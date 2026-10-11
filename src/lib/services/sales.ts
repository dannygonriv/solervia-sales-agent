import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDB, settings, audit } from "../db";
import {
  campaignInput,
  type Product,
  type Campaign,
  type Email,
  type Meeting,
  type Analysis,
} from "../domain";
import { AppError } from "../security";
import { analyze, generateEmail } from "../providers";
import { googleConnected, createCalendarEvent } from "../providers/calendar";
import { getProspect, activity, notify, enqueue } from "./crm";
import { eligible, reserve } from "./policy";
export async function qualify(id: string) {
  const db = await getDB(),
    p = await getProspect(id),
    s = await settings(),
    demo = s.mode === "demo";
  if (p.demo !== demo) throw new AppError("Modo incorrecto.");
  const products = await db.query<Product>(
    "select * from ssa.products where active=true",
  );
  const key = "analysis:" + randomUUID();
  await reserve(db, p, null, "ai", key, s.ai_request_cap, demo, null);
  let result: Analysis;
  try {
    result = await analyze(p, products, s);
  } catch (e) {
    await db.query(
      "update ssa.operations set status='uncertain' where unique_key=$1",
      [key],
    );
    throw e;
  }
  await db.transaction(async (tx) => {
    await tx.query(
      "update ssa.prospects set score=$2,analysis=$3::jsonb,status=case when status in ('Nuevo','Investigando') then 'Pendiente de revisión' else status end,updated_at=now() where id=$1",
      [id, result.score, JSON.stringify(result)],
    );
    await tx.query(
      "update ssa.operations set status='done',actual_cost=$2 where unique_key=$1",
      [key, demo ? 0 : s.ai_request_cap],
    );
    await activity(
      id,
      "analysis",
      `Calificación ${result.score}/100. Hipótesis pendientes de validación.`,
      demo,
      tx,
    );
    if (result.score >= 70)
      await notify(
        "priority",
        `${p.name}: prioridad ${result.score}/100`,
        demo,
        id,
        tx,
      );
  });
  return result;
}
export async function draftEmail(
  id: string,
  productId: string,
  campaignId: string | null = null,
) {
  const db = await getDB(),
    p = await getProspect(id),
    s = await settings();
  if (p.demo !== (s.mode === "demo")) throw new AppError("Modo incorrecto.");
  const [product] = await db.query<Product>(
    "select * from ssa.products where id=$1 and active=true",
    [productId],
  );
  if (!product) throw new AppError("Selecciona un producto activo.");
  const key = "draft:" + randomUUID();
  await reserve(db, p, null, "ai", key, s.ai_request_cap, p.demo, null);
  let draft;
  try {
    draft = await generateEmail(p, product, s);
  } catch (e) {
    await db.query(
      "update ssa.operations set status='uncertain' where unique_key=$1",
      [key],
    );
    throw e;
  }
  const [email] = await db.query<Email>(
    "insert into ssa.emails(prospect_id,campaign_id,subject,body,demo) values($1,$2,$3,$4,$5) on conflict(campaign_id,prospect_id) where campaign_id is not null do update set subject=excluded.subject,body=excluded.body,status='draft',approved_at=null returning *",
    [id, campaignId, draft.subject, draft.body, p.demo],
  );
  await db.query(
    "update ssa.operations set status='done',actual_cost=$2 where unique_key=$1",
    [key, p.demo ? 0 : s.ai_request_cap],
  );
  return email;
}
export async function createCampaign(raw: unknown) {
  const v = campaignInput.parse(raw),
    db = await getDB(),
    s = await settings(),
    demo = s.mode === "demo";
  return db.transaction(async (tx) => {
    const [prod] = await tx.query<Product>(
      "select * from ssa.products where id=$1 and active=true",
      [v.product_id],
    );
    if (!prod) throw new AppError("Producto no disponible.");
    if (v.channel === "call") {
      if (!v.script_id) throw new AppError("Selecciona un guion de voz.");
      if (
        !(
          await tx.query(
            "select id from ssa.scripts where id=$1 and product_id=$2",
            [v.script_id, v.product_id],
          )
        ).length
      )
        throw new AppError("El guion no corresponde al producto.");
    }
    const ids = [...new Set(v.prospect_ids)];
    for (const id of ids) {
      const p = await getProspect(id, tx);
      if (p.demo !== demo)
        throw new AppError("No mezcles modos en la campaña.");
    }
    const [campaign] = await tx.query<Campaign>(
      "insert into ssa.campaigns(name,product_id,script_id,channel,max_contacts,budget,starts_at,start_hour,end_hour,demo) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *",
      [
        v.name,
        v.product_id,
        v.script_id,
        v.channel,
        v.max_contacts,
        v.budget,
        v.starts_at,
        v.start_hour,
        v.end_hour,
        demo,
      ],
    );
    for (const id of ids)
      await tx.query(
        "insert into ssa.campaign_prospects(campaign_id,prospect_id) values($1,$2)",
        [campaign.id, id],
      );
    await audit("campaign.created", campaign.id, {}, tx);
    return campaign;
  });
}
export async function controlCampaign(id: string, action: string) {
  const db = await getDB();
  return db.transaction(async (tx) => {
    await tx.query("select id from ssa.settings where id=1 for update");
    const [c] = await tx.query<Campaign>(
      "select * from ssa.campaigns where id=$1 for update",
      [id],
    );
    if (!c) throw new AppError("Campaña no encontrada.", 404);
    const s = await settings(tx);
    if (action === "pause") {
      if (c.status !== "running")
        throw new AppError("La campaña no está en ejecución.");
      await tx.query("update ssa.campaigns set status='paused' where id=$1", [
        id,
      ]);
    } else if (action === "cancel") {
      await tx.query(
        "update ssa.campaigns set status='cancelled' where id=$1",
        [id],
      );
      await tx.query(
        "update ssa.automation_jobs set status='cancelled' where payload->>'campaign_id'=$1 and status='queued'",
        [id],
      );
    } else if (action === "start") {
      if (!["draft", "paused"].includes(c.status))
        throw new AppError("No se puede iniciar esta campaña.");
      if (c.demo !== (s.mode === "demo"))
        throw new AppError("La campaña pertenece a otro modo.");
      const members = await tx.query<{ prospect_id: string }>(
        "select prospect_id from ssa.campaign_prospects where campaign_id=$1",
        [id],
      );
      for (const member of members) {
        await eligible(
          await getProspect(member.prospect_id, tx),
          c.channel,
          s,
          tx,
          c.demo,
        );
        if (c.channel === "email") {
          const [email] = await tx.query<Email>(
            "select * from ssa.emails where prospect_id=$1 and campaign_id=$2",
            [member.prospect_id, id],
          );
          if (!email?.approved_at)
            throw new AppError(
              "Prepara y aprueba cada correo de esta campaña.",
            );
        }
        await enqueue(
          "dispatch",
          { prospect_id: member.prospect_id, campaign_id: id },
          `campaign:${id}:${member.prospect_id}`,
          c.demo,
          new Date(c.starts_at),
          tx,
        );
      }
      await tx.query(
        "update ssa.campaigns set status='running',approved_at=now() where id=$1",
        [id],
      );
    } else throw new AppError("Acción inválida.");
    await audit(`campaign.${action}`, id, {}, tx);
  });
}
export const meetingInput = z
  .object({
    prospect_id: z.string().uuid(),
    product_id: z.string().uuid().nullable(),
    starts_at: z.iso.datetime(),
    ends_at: z.iso.datetime(),
    summary: z.string().max(5000),
  })
  .refine(
    (v) =>
      new Date(v.ends_at) > new Date(v.starts_at) &&
      new Date(v.starts_at) > new Date(),
    "Selecciona un horario futuro válido.",
  );
export async function proposeMeeting(raw: unknown) {
  const v = meetingInput.parse(raw),
    p = await getProspect(v.prospect_id),
    db = await getDB(),
    s = await settings();
  if (p.demo !== (s.mode === "demo")) throw new AppError("Modo incorrecto.");
  const [m] = await db.query<Meeting>(
    "insert into ssa.meetings(prospect_id,product_id,starts_at,ends_at,summary,demo) values($1,$2,$3,$4,$5,$6) returning *",
    [v.prospect_id, v.product_id, v.starts_at, v.ends_at, v.summary, p.demo],
  );
  await db.query(
    "update ssa.prospects set status='Reunión propuesta' where id=$1 and status not in ('No contactar','Cliente')",
    [p.id],
  );
  await activity(
    p.id,
    "meeting",
    "Reunión propuesta; pendiente de verificar disponibilidad.",
    p.demo,
  );
  await notify("meeting", `Reunión propuesta con ${p.name}.`, p.demo, p.id);
  return m;
}
export async function confirmMeeting(id: string) {
  const db = await getDB(),
    s = await settings();
  const m = await db.transaction(async (tx) => {
    await tx.query("select id from ssa.settings where id=1 for update");
    const [meeting] = await tx.query<
      Meeting & { confirmation_started_at: string | null }
    >("select * from ssa.meetings where id=$1", [id]);
    if (!meeting) throw new AppError("Reunión no encontrada.", 404);
    if (meeting.demo !== (s.mode === "demo"))
      throw new AppError("Modo incorrecto.");
    if (["confirmed", "simulated"].includes(meeting.status)) return meeting;
    if (
      meeting.status === "confirming" &&
      meeting.confirmation_started_at &&
      Date.now() - new Date(meeting.confirmation_started_at).getTime() < 120000
    )
      throw new AppError(
        "La confirmación está en proceso. Intenta nuevamente en dos minutos.",
        409,
      );
    if (new Date(meeting.starts_at) <= new Date())
      throw new AppError("La reunión debe estar en el futuro.");
    const overlap = await tx.query(
      "select id from ssa.meetings where id<>$1 and demo=$4 and status in ('confirmed','simulated','confirming','uncertain') and starts_at<$3 and ends_at>$2",
      [id, meeting.starts_at, meeting.ends_at, meeting.demo],
    );
    if (overlap.length)
      throw new AppError("Existe un conflicto en el calendario.", 409);
    if (!meeting.demo && !(await googleConnected(tx))) return meeting;
    await tx.query(
      "update ssa.meetings set status='confirming',confirmation_started_at=now() where id=$1",
      [id],
    );
    return { ...meeting, status: "confirming" };
  });
  if (m.status !== "confirming") return m;
  const p = await getProspect(m.prospect_id);
  try {
    const event = m.demo
      ? { id: "demo-" + id }
      : await createCalendarEvent(m, p);
    await db.query(
      "update ssa.meetings set status=$2,provider_id=$3 where id=$1",
      [id, m.demo ? "simulated" : "confirmed", event.id],
    );
    await db.query(
      "update ssa.prospects set status='Reunión confirmada' where id=$1 and status not in ('No contactar','Cliente')",
      [p.id],
    );
    await activity(
      p.id,
      "meeting",
      m.demo
        ? "Confirmación simulada; sin evento externo."
        : "Reunión confirmada en Google Calendar.",
      m.demo,
    );
    await notify(
      "meeting",
      `${m.demo ? "Simulación de reunión" : "Reunión confirmada"}: ${p.name}`,
      m.demo,
      p.id,
    );
    return {
      ...m,
      status: m.demo ? "simulated" : "confirmed",
      provider_id: event.id,
    };
  } catch (error) {
    await db.query(
      "update ssa.meetings set status='uncertain' where id=$1 and status='confirming'",
      [id],
    );
    throw error;
  }
}
