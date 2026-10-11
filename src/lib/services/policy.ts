import { AppError, normalizeContact } from "../security";
import type { Prospect, Settings, Campaign } from "../domain";
import type { DB } from "../db";
import { assertLive, requireEnv } from "../providers";
import { getProspect } from "./crm";
export function localHour(s: Settings, now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: s.timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}
export async function eligible(
  p: Prospect,
  channel: "call" | "email",
  s: Settings,
  db: DB,
  demo: boolean,
) {
  if (p.demo !== demo)
    throw new AppError("El prospecto pertenece a otro modo.", 409);
  if (s.emergency) throw new AppError("Parada de emergencia activa.", 409);
  if (["No contactar", "No interesado", "Cliente"].includes(p.status))
    throw new AppError("El estado del prospecto no permite contacto.", 409);
  const dest = channel === "email" ? p.email : p.phone;
  const excluded = await db.query(
    "select id from ssa.suppression_list where value=any($1::text[])",
    [
      [
        p.id,
        ...[p.email, p.phone].filter(Boolean).map((v) => normalizeContact(v!)),
      ],
    ],
  );
  if (excluded.length)
    throw new AppError("Contacto en lista de exclusión.", 409);
  if (!demo) {
    assertLive(s);
    if (!dest) throw new AppError("Falta un destino válido.", 409);
    if (
      p.status !== "Aprobado para contacto" &&
      ![
        "Contactado",
        "Sin respuesta",
        "Interesado",
        "Reunión propuesta",
      ].includes(p.status)
    )
      throw new AppError("Primero aprueba el prospecto para contacto.", 409);
    if (
      !(channel === "email" ? p.email_allowed : p.call_allowed) ||
      !p.legal_basis ||
      !p.evidence
    )
      throw new AppError(
        "Falta autorización documentada para este canal.",
        409,
      );
    if (p.expires_at && new Date(p.expires_at) <= new Date())
      throw new AppError("La autorización expiró.", 409);
    if (channel === "call") {
      if (!/^\+[1-9]\d{7,14}$/.test(dest!))
        throw new AppError("Normaliza el teléfono al formato E.164.", 409);
      requireEnv("RETELL_API_KEY", "RETELL_AGENT_ID", "RETELL_FROM_NUMBER");
      if (process.env.RETELL_AGENT_REVIEWED !== "true")
        throw new AppError("Agente de voz pendiente de revisión.", 409);
    } else {
      requireEnv("RESEND_API_KEY", "EMAIL_FROM", "EMAIL_REPLY_TO");
      if (
        process.env.EMAIL_PROVIDER_APPROVED !== "true" ||
        !s.sender_identity ||
        !s.privacy_notice
      )
        throw new AppError(
          "Revisa proveedor, remitente y aviso de privacidad.",
          409,
        );
    }
  }
  return dest ? normalizeContact(dest) : `demo:${p.id}:${channel}`;
}
export function campaignWindow(c: Campaign, s: Settings, now = new Date()) {
  const hour = localHour(s, now);
  return (
    now >= new Date(c.starts_at) &&
    hour >= Math.max(c.start_hour, s.start_hour) &&
    hour < Math.min(c.end_hour, s.end_hour)
  );
}
export async function reserve(
  db: DB,
  p: Prospect | null,
  c: Campaign | null,
  channel: string,
  key: string,
  cost: number,
  demo: boolean,
  destination: string | null,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx.query<{ data: Settings }>(
      "select data from ssa.settings where id=1 for update",
    );
    const s = row.data;
    if (s.emergency) throw new AppError("Parada de emergencia activa.", 409);
    if ((s.mode === "demo") !== demo)
      throw new AppError("El modo del trabajo ya no está activo.", 409);
    if (
      (
        await tx.query("select id from ssa.operations where unique_key=$1", [
          key,
        ])
      ).length
    )
      return false;
    if (p && (channel === "email" || channel === "call")) {
      const currentProspect = await getProspect(p.id, tx);
      const currentDestination = await eligible(
        currentProspect,
        channel,
        s,
        tx,
        demo,
      );
      if (destination !== currentDestination)
        throw new AppError("El destino cambió. Revisa el contacto.", 409);
      const [attempts] = await tx.query<{ count: number; recent: number }>(
        "select count(*)::int as count,count(*) filter(where created_at>now()-$3*interval '1 hour')::int as recent from ssa.operations where (prospect_id=$1 or destination=$2) and channel=$4 and demo=$5",
        [p.id, destination, s.cooldown_hours, channel, demo],
      );
      if (attempts.count >= s.max_attempts || attempts.recent > 0)
        throw new AppError("Límite de intentos o pausa entre contactos.", 409);
    }
    const [spent] = await tx.query<{
      total: number;
      calls: number;
      emails: number;
    }>(
      `select coalesce(sum(greatest(reserved_cost,coalesce(actual_cost,0))),0) as total,count(*) filter(where channel='call')::int as calls,count(*) filter(where channel='email')::int as emails from ssa.operations where demo=$1 and (created_at at time zone $2)::date=(now() at time zone $2)::date`,
      [demo, s.timezone],
    );
    if (
      Number(spent.total) + cost > s.daily_budget ||
      (channel === "call" && spent.calls >= s.daily_calls) ||
      (channel === "email" && spent.emails >= s.daily_emails)
    )
      throw new AppError("Se alcanzó el límite diario o presupuesto.", 409);
    if (c) {
      const [current] = await tx.query<Campaign>(
        "select * from ssa.campaigns where id=$1",
        [c.id],
      );
      if (current?.status !== "running")
        throw new AppError("La campaña no está activa.", 409);
      if (!campaignWindow(current, s))
        throw new AppError("Fuera del horario autorizado.", 409);
      const [used] = await tx.query<{ count: number; total: number }>(
        "select count(*)::int as count,coalesce(sum(greatest(reserved_cost,coalesce(actual_cost,0))),0) as total from ssa.operations where campaign_id=$1",
        [c.id],
      );
      if (
        used.count >= c.max_contacts ||
        Number(used.total) + cost > Number(c.budget)
      )
        throw new AppError("Se alcanzó el límite de la campaña.", 409);
    }
    await tx.query(
      "insert into ssa.operations(unique_key,prospect_id,campaign_id,channel,destination,status,reserved_cost,demo) values($1,$2,$3,$4,$5,'reserved',$6,$7)",
      [key, p?.id || null, c?.id || null, channel, destination, cost, demo],
    );
    return true;
  });
}
