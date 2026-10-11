import { z } from "zod";
import Retell from "retell-sdk";
import { Webhook } from "svix";
import { getDB } from "../db";
import { AppError } from "../security";
import { activity, notify, suppressProspect } from "./crm";
const retellEvent = z.object({
  event: z.enum(["call_started", "call_ended", "call_analyzed"]),
  call: z.object({
    call_id: z.string().min(1),
    duration_ms: z.number().nonnegative().optional(),
    transcript: z.string().max(300000).optional(),
    call_analysis: z
      .object({
        call_summary: z.string().optional(),
        user_sentiment: z.string().optional(),
        custom_analysis_data: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
    call_cost: z.object({ combined_cost: z.number().nonnegative() }).optional(),
  }),
});
export async function retellWebhook(
  body: string,
  signature: string,
  demo = false,
) {
  if (
    !demo &&
    (!process.env.RETELL_API_KEY ||
      !(await Retell.verify(body, process.env.RETELL_API_KEY, signature)))
  )
    throw new AppError("Firma inválida.", 401);
  const event = retellEvent.parse(JSON.parse(body)),
    db = await getDB();
  return db.transaction(async (tx) => {
    const [call] = await tx.query<{
      id: string;
      prospect_id: string;
      demo: boolean;
      status: string;
    }>("select * from ssa.calls where provider_id=$1 for update", [
      event.call.call_id,
    ]);
    if (!call)
      throw new AppError(
        "Llamada todavía no registrada; reintentar evento.",
        409,
      );
    if (call.demo !== demo)
      throw new AppError("Modo del evento incorrecto.", 403);
    const key = `retell:${event.event}:${event.call.call_id}`;
    const inserted = await tx.query(
      "insert into ssa.webhook_events(event_key,provider) values($1,'retell') on conflict do nothing returning event_key",
      [key],
    );
    if (!inserted.length) return { duplicate: true };
    const data = event.call.call_analysis,
      extra = data?.custom_analysis_data || {},
      cost = event.call.call_cost
        ? event.call.call_cost.combined_cost / 100
        : null;
    await tx.query(
      "update ssa.calls set status=case when status='analyzed' then status else $2 end,duration_seconds=coalesce($3,duration_seconds),transcript=coalesce($4,transcript),summary=coalesce($5,summary),interest=coalesce($6,interest),objections=coalesce($7,objections),next_action=coalesce($8,next_action),cost=coalesce($9,cost) where id=$1",
      [
        call.id,
        event.event === "call_analyzed"
          ? "analyzed"
          : event.event === "call_ended"
            ? "ended"
            : call.status === "registered"
              ? "started"
              : call.status,
        event.call.duration_ms === undefined
          ? null
          : Math.ceil(event.call.duration_ms / 1000),
        event.call.transcript || null,
        data?.call_summary || null,
        typeof extra.interest === "string" ? extra.interest : null,
        typeof extra.objections === "string" ? extra.objections : null,
        typeof extra.next_action === "string" ? extra.next_action : null,
        demo ? 0 : cost,
      ],
    );
    if (cost !== null)
      await tx.query(
        "update ssa.operations set actual_cost=$2 where provider_id=$1",
        [event.call.call_id, demo ? 0 : cost],
      );
    if (extra.opt_out === true)
      await suppressProspect(
        call.prospect_id,
        "Solicitud recibida en llamada",
        tx,
      );
    else if (extra.interest === "interested") {
      await tx.query(
        "update ssa.prospects set status='Interesado' where id=$1 and status<>'No contactar'",
        [call.prospect_id],
      );
      await notify(
        "interest",
        "Interés detectado en llamada. Revisar transcripción.",
        demo,
        call.prospect_id,
        tx,
      );
    }
    if (event.event === "call_analyzed") {
      await activity(
        call.prospect_id,
        "call",
        "Resultado de llamada recibido y analizado.",
        demo,
        tx,
      );
      await notify(
        "call",
        data?.call_summary || "Llamada analizada.",
        demo,
        call.prospect_id,
        tx,
      );
    }
    return { duplicate: false };
  });
}
export async function emailWebhook(body: string, headers: Headers) {
  if (!process.env.RESEND_WEBHOOK_SECRET)
    throw new AppError("Webhook no configurado.", 503);
  let verified: unknown;
  try {
    verified = new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(body, {
      "svix-id": headers.get("svix-id") || "",
      "svix-timestamp": headers.get("svix-timestamp") || "",
      "svix-signature": headers.get("svix-signature") || "",
    });
  } catch {
    throw new AppError("Firma inválida.", 401);
  }
  const event = z
    .object({ type: z.string(), data: z.object({ email_id: z.string() }) })
    .parse(verified);
  const db = await getDB();
  return db.transaction(async (tx) => {
    const [email] = await tx.query<{
      id: string;
      prospect_id: string;
      demo: boolean;
      status: string;
    }>("select * from ssa.emails where provider_id=$1", [event.data.email_id]);
    if (!email || email.demo) return { ignored: true };
    const key = "resend:" + headers.get("svix-id");
    const rows = await tx.query(
      "insert into ssa.webhook_events(event_key,provider) values($1,'resend') on conflict do nothing returning event_key",
      [key],
    );
    if (!rows.length) return { duplicate: true };
    if (event.type === "email.bounced" || event.type === "email.complained") {
      await tx.query("update ssa.emails set status=$2 where id=$1", [
        email.id,
        event.type.split(".")[1],
      ]);
      await suppressProspect(
        email.prospect_id,
        "Baja por rebote o queja del proveedor",
        tx,
      );
    } else if (
      event.type === "email.delivered" &&
      !["bounced", "complained", "replied"].includes(email.status)
    )
      await tx.query("update ssa.emails set status='delivered' where id=$1", [
        email.id,
      ]);
    return { ok: true };
  });
}
