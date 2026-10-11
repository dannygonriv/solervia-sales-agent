import { getDB, settings, audit, type DB } from "../db";
import {
  companyInput,
  contactInput,
  prospectInput,
  type Prospect,
  type Product,
  type Script,
  type Campaign,
  type Email,
  type Call,
  type Meeting,
  type Activity,
  type Job,
  type Notification,
  type AppState,
} from "../domain";
import { hash, normalizeContact, AppError } from "../security";
import { integrationStatus } from "../providers";
export const prospectSQL = `select p.*,c.name,c.legal_name,c.sector,c.activity,c.size,c.address,c.city,c.state,c.website,c.linkedin,c.source,c.source_id,c.demo,c.consulted_at,t.id as contact_id,t.email,t.phone,t.name as contact_name,t.email_allowed,t.call_allowed,t.legal_basis,t.evidence,t.expires_at from ssa.prospects p join ssa.companies c on c.id=p.company_id join ssa.contacts t on t.company_id=c.id`;
export async function getProspect(id: string, db?: DB) {
  const [p] = await (db || (await getDB())).query<Prospect>(
    prospectSQL + " where p.id=$1",
    [id],
  );
  if (!p) throw new AppError("Prospecto no encontrado.", 404);
  return p;
}
export async function activity(
  prospectId: string | null,
  kind: string,
  description: string,
  demo: boolean,
  db?: DB,
) {
  await (db || (await getDB())).query(
    "insert into ssa.activities(prospect_id,kind,description,demo) values($1,$2,$3,$4)",
    [prospectId, kind, description, demo],
  );
}
export async function notify(
  kind: string,
  message: string,
  demo: boolean,
  prospectId: string | null = null,
  db?: DB,
) {
  const d = db || (await getDB());
  const s = await settings(d);
  if (
    !s.notification_types.includes(
      kind as (typeof s.notification_types)[number],
    )
  )
    return;
  const [n] = await d.query<{ id: string }>(
    "insert into ssa.notifications(kind,message,prospect_id,demo) values($1,$2,$3,$4) returning id",
    [kind, message, prospectId, demo],
  );
  await enqueue(
    "notification",
    { notification_id: n.id },
    "notification:" + n.id,
    demo,
    new Date(),
    d,
  );
}
export async function enqueue(
  kind: string,
  payload: Record<string, unknown>,
  key: string,
  demo: boolean,
  runAt = new Date(),
  db?: DB,
) {
  const rows = await (db || (await getDB())).query<{ id: string }>(
    `insert into ssa.automation_jobs(kind,payload,unique_key,demo,run_at) values($1,$2::jsonb,$3,$4,$5) on conflict(unique_key) do nothing returning id`,
    [kind, JSON.stringify(payload), key, demo, runAt.toISOString()],
  );
  return rows[0]?.id;
}
export async function createProspect(raw: unknown) {
  const input = companyInput.parse(raw);
  const db = await getDB();
  const s = await settings(db);
  if (s.mode === "demo" && !input.demo)
    throw new AppError("En demostración sólo se admiten registros de prueba.");
  if (s.mode === "production" && input.demo)
    throw new AppError(
      "Los datos de demostración no se pueden importar a producción.",
    );
  const normalize = (v: string) =>
    v
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  const fingerprint = hash(
    `${input.demo}|${normalize(input.name)}|${normalize(input.address || "")}|${normalize(input.city)}`,
  );
  return db.transaction(async (tx) => {
    const [c] = await tx.query<{ id: string }>(
      `insert into ssa.companies(name,legal_name,sector,activity,size,address,city,state,website,linkedin,source,source_id,fingerprint,demo) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict do nothing returning id`,
      [
        input.name,
        input.legal_name,
        input.sector,
        input.activity,
        input.size,
        input.address,
        input.city,
        input.state,
        input.website,
        input.linkedin,
        input.source,
        input.source_id,
        fingerprint,
        input.demo,
      ],
    );
    if (!c) {
      const [existing] = await tx.query<{ id: string }>(
        "select p.id from ssa.prospects p join ssa.companies c on c.id=p.company_id where c.fingerprint=$1 or (c.source=$2 and c.source_id=$3)",
        [fingerprint, input.source, input.source_id],
      );
      if (!existing) throw new AppError("La empresa ya existe.", 409);
      return { id: existing.id, duplicate: true };
    }
    await tx.query(
      "insert into ssa.contacts(company_id,name,email,phone) values($1,$2,$3,$4)",
      [
        c.id,
        input.contact_name,
        input.email,
        input.phone ? normalizeContact(input.phone) : null,
      ],
    );
    const [p] = await tx.query<{ id: string }>(
      "insert into ssa.prospects(company_id) values($1) returning id",
      [c.id],
    );
    await activity(
      p.id,
      "created",
      "Prospecto registrado; contacto pendiente de revisión.",
      input.demo,
      tx,
    );
    await audit("prospect.created", p.id, {}, tx);
    return { id: p.id, duplicate: false };
  });
}
export async function editCompany(id: string, raw: unknown) {
  const c = companyInput.parse(raw),
    p = await getProspect(id);
  const db = await getDB();
  if (c.demo !== p.demo)
    throw new AppError("No se puede cambiar el origen demo de un prospecto.");
  await db.transaction(async (tx) => {
    await tx.query(
      "update ssa.companies set name=$2,legal_name=$3,sector=$4,activity=$5,size=$6,address=$7,city=$8,state=$9,website=$10,linkedin=$11,updated_at=now() where id=$1",
      [
        p.company_id,
        c.name,
        c.legal_name,
        c.sector,
        c.activity,
        c.size,
        c.address,
        c.city,
        c.state,
        c.website,
        c.linkedin,
      ],
    );
    await tx.query(
      "update ssa.contacts set name=$2,email=$3,phone=$4,email_allowed=case when email is distinct from $3 then false else email_allowed end,call_allowed=case when phone is distinct from $4 then false else call_allowed end,updated_at=now() where id=$1",
      [
        p.contact_id,
        c.contact_name,
        c.email,
        c.phone ? normalizeContact(c.phone) : null,
      ],
    );
    await audit("prospect.company.updated", id, {}, tx);
  });
}
export async function editProspect(id: string, raw: unknown) {
  const v = prospectInput.parse(raw),
    p = await getProspect(id);
  const db = await getDB();
  await db.transaction(async (tx) => {
    await tx.query(
      "update ssa.prospects set status=$2,notes=$3,next_action=$4,followup_at=$5,product_id=$6,reviewed_at=case when $2='Aprobado para contacto' then now() else reviewed_at end,updated_at=now() where id=$1",
      [id, v.status, v.notes, v.next_action, v.followup_at, v.product_id],
    );
    if (v.status === "No contactar")
      await suppressProspect(id, "Marcado No contactar por administrador", tx);
    if (v.followup_at)
      await enqueue(
        "followup",
        { prospect_id: id, at: v.followup_at },
        `followup:${id}:${v.followup_at}`,
        p.demo,
        new Date(v.followup_at),
        tx,
      );
    await activity(id, "updated", `Ficha actualizada: ${v.status}`, p.demo, tx);
    await audit("prospect.updated", id, {}, tx);
  });
}
export async function setConsent(id: string, raw: unknown) {
  const input = contactInput.parse(raw),
    p = await getProspect(id);
  const db = await getDB();
  await db.transaction(async (tx) => {
    await tx.query(
      "update ssa.contacts set email_allowed=$2,call_allowed=$3,legal_basis=$4,evidence=$5,consent_at=now(),expires_at=$6,updated_at=now() where id=$1",
      [
        p.contact_id,
        input.email_allowed,
        input.call_allowed,
        input.legal_basis,
        input.evidence,
        input.expires_at || null,
      ],
    );
    await tx.query(
      "insert into ssa.consent_history(contact_id,snapshot) values($1,$2::jsonb)",
      [p.contact_id, JSON.stringify(input)],
    );
    await audit(
      "consent.updated",
      id,
      { email_allowed: input.email_allowed, call_allowed: input.call_allowed },
      tx,
    );
  });
}
export async function suppressProspect(id: string, reason: string, db?: DB) {
  const d = db || (await getDB()),
    p = await getProspect(id, d);
  for (const value of [p.email, p.phone].filter(Boolean) as string[])
    await d.query(
      "insert into ssa.suppression_list(value,reason) values($1,$2) on conflict(value) do nothing",
      [normalizeContact(value), reason],
    );
  await d.query(
    "insert into ssa.suppression_list(value,reason) values($1,$2) on conflict(value) do nothing",
    [id, reason],
  );
  await d.query(
    "update ssa.prospects set status='No contactar',updated_at=now() where id=$1",
    [id],
  );
  await d.query(
    "update ssa.contacts set email_allowed=false,call_allowed=false where id=$1",
    [p.contact_id],
  );
  await d.query(
    "update ssa.automation_jobs set status='cancelled' where payload->>'prospect_id'=$1 and status='queued'",
    [id],
  );
  await audit("contact.suppressed", id, {}, d);
}
export async function state(): Promise<AppState> {
  const db = await getDB(),
    s = await settings(db),
    demo = s.mode === "demo";
  const [
    prospects,
    products,
    scripts,
    campaigns,
    emails,
    calls,
    meetings,
    activities,
    jobs,
    notifications,
    suppression,
    searches,
    costs,
  ] = await Promise.all([
    db.query<Prospect>(
      prospectSQL + " where c.demo=$1 order by p.created_at desc",
      [demo],
    ),
    db.query<Product>("select * from ssa.products order by name"),
    db.query<Script>("select * from ssa.scripts order by name"),
    db.query<Campaign>(
      "select * from ssa.campaigns where demo=$1 order by created_at desc",
      [demo],
    ),
    db.query<Email>(
      "select * from ssa.emails where demo=$1 order by created_at desc",
      [demo],
    ),
    db.query<Call>(
      "select * from ssa.calls where demo=$1 order by created_at desc",
      [demo],
    ),
    db.query<Meeting>(
      "select * from ssa.meetings where demo=$1 order by starts_at",
      [demo],
    ),
    db.query<Activity>(
      "select * from ssa.activities where demo=$1 order by created_at desc limit 200",
      [demo],
    ),
    db.query<Job>(
      "select * from ssa.automation_jobs where demo=$1 order by created_at desc limit 100",
      [demo],
    ),
    db.query<Notification>(
      "select * from ssa.notifications where demo=$1 order by created_at desc limit 50",
      [demo],
    ),
    db.query<{ id: string; value: string; reason: string }>(
      "select * from ssa.suppression_list order by created_at desc",
    ),
    db.query<AppState["searches"][number]>(
      "select id,name,active,next_run,interval_hours from ssa.scheduled_searches where demo=$1 order by created_at desc",
      [demo],
    ),
    db.query<{ reserved: number; actual: number }>(
      "select coalesce(sum(reserved_cost),0) as reserved,coalesce(sum(actual_cost),0) as actual from ssa.operations where demo=$1",
      [demo],
    ),
  ]);
  return {
    settings: s,
    prospects,
    products,
    scripts,
    campaigns,
    emails,
    calls,
    meetings,
    activities,
    jobs,
    notifications,
    suppression,
    searches,
    costs: costs[0],
    integrations: integrationStatus(),
  };
}
