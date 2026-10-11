import { getDB, settings, audit } from "../db";
import type {
  Job,
  Campaign,
  Product,
  Script,
  Email,
  Notification,
  Settings,
  SearchFilters,
} from "../domain";
import { AppError, signed } from "../security";
import { startCall, sendEmail, telegram, searchCompanies } from "../providers";
import { getProspect, activity, notify, createProspect, enqueue } from "./crm";
import { eligible, reserve, campaignWindow, localHour } from "./policy";
async function dispatch(job: Job) {
  const db = await getDB(),
    s = await settings(),
    p = await getProspect(String(job.payload.prospect_id));
  let c: Campaign | null = null,
    email: Email | null = null,
    script: Script | null = null,
    product: Product | null = null;
  if (job.payload.campaign_id) {
    [c] = await db.query<Campaign>("select * from ssa.campaigns where id=$1", [
      job.payload.campaign_id,
    ]);
    if (!c) throw new AppError("Campaña no encontrada.");
    if (c.status === "cancelled" || c.status === "completed")
      throw new AppError("Campaña finalizada.");
    if (c.status === "paused" || !campaignWindow(c, s)) {
      await db.query(
        "update ssa.automation_jobs set status='queued',run_at=now()+interval '5 minutes',locked_at=null where id=$1",
        [job.id],
      );
      return false;
    }
    [product] = await db.query<Product>(
      "select * from ssa.products where id=$1 and active=true",
      [c.product_id],
    );
    if (!product) throw new AppError("Producto inactivo.");
    if (c.channel === "call") {
      [script] = await db.query<Script>(
        "select * from ssa.scripts where id=$1 and product_id=$2",
        [c.script_id, c.product_id],
      );
      if (!script) throw new AppError("Guion no disponible.");
    } else
      [email] = await db.query<Email>(
        "select * from ssa.emails where prospect_id=$1 and campaign_id=$2",
        [p.id, c.id],
      );
  } else
    [email] = await db.query<Email>(
      "select * from ssa.emails where id=$1 and prospect_id=$2",
      [job.payload.email_id, p.id],
    );
  const channel = c?.channel || "email";
  if (
    channel === "email" &&
    (!email || !email.approved_at || email.status !== "approved")
  )
    throw new AppError("El correo no está aprobado.");
  if (localHour(s) < s.start_hour || localHour(s) >= s.end_hour) {
    await db.query(
      "update ssa.automation_jobs set status='queued',run_at=now()+interval '5 minutes',locked_at=null where id=$1",
      [job.id],
    );
    return false;
  }
  const destination = await eligible(p, channel, s, db, job.demo);
  const cost =
    channel === "call"
      ? Math.ceil((script?.max_seconds || 180) / 60) * s.call_minute_cost
      : s.email_cost;
  if (
    !(await reserve(
      db,
      p,
      c,
      channel,
      job.unique_key,
      cost,
      job.demo,
      destination,
    ))
  )
    return true;
  // Reservations are durable before provider I/O. Never retry an ambiguous outbound request.
  try {
    const current = await settings();
    const latestProspect = await getProspect(p.id);
    const latestDestination = await eligible(
      latestProspect,
      channel,
      current,
      db,
      job.demo,
    );
    if (latestDestination !== destination)
      throw new AppError("El destino cambió después de aprobar el contacto.");
    if (email) {
      const claimed = await db.query(
        "update ssa.emails set status='sending' where id=$1 and status='approved' and approved_at is not null and subject=$2 and body=$3 returning id",
        [email.id, email.subject, email.body],
      );
      if (!claimed.length)
        throw new AppError("El borrador cambió o ya no está aprobado.");
    }
    if (c) {
      const [latest] = await db.query<Campaign>(
        "select * from ssa.campaigns where id=$1",
        [c.id],
      );
      if (latest.status !== "running")
        throw new AppError("Campaña detenida antes del envío.");
    }
    if (channel === "call") {
      const call = job.demo
        ? { call_id: "demo-" + job.id }
        : await startCall(p, product!, script!, current);
      await db.transaction(async (tx) => {
        await tx.query(
          "insert into ssa.calls(prospect_id,campaign_id,provider_id,status,duration_seconds,transcript,summary,interest,objections,next_action,cost,demo) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            p.id,
            c?.id,
            call.call_id,
            job.demo ? "simulated" : "registered",
            job.demo ? 65 : null,
            job.demo
              ? `[SIMULACIÓN — no hubo llamada]\nAsistente: Hola, soy el asistente virtual de Solervia. ¿Podemos conversar brevemente?\nEmpresa ficticia: Sí, me interesa conocer opciones.\nAsistente: Podemos proponer una reunión; el horario requiere confirmación del administrador.`
              : null,
            job.demo
              ? "Conversación de prueba. Se expresó interés en una reunión."
              : null,
            job.demo ? "interested" : null,
            job.demo ? "Sin objeciones en este escenario de prueba." : null,
            job.demo ? "Proponer reunión y validar necesidades." : null,
            0,
            job.demo,
          ],
        );
        await tx.query(
          "update ssa.operations set status='done',provider_id=$2,actual_cost=$3 where unique_key=$1",
          [job.unique_key, call.call_id, job.demo ? 0 : null],
        );
        if (job.demo)
          await notify(
            "call",
            `Llamada simulada completada: ${p.name}.`,
            true,
            p.id,
            tx,
          );
      });
    } else {
      const unsubscribe = new URL(
        "/api/unsubscribe",
        process.env.APP_URL || "http://127.0.0.1:3000",
      );
      unsubscribe.searchParams.set("token", signed(p.id));
      const result = job.demo
        ? { id: "demo-" + job.id }
        : await sendEmail(
            destination,
            email!.subject,
            email!.body,
            job.unique_key,
            unsubscribe.toString(),
            current,
          );
      await db.transaction(async (tx) => {
        await tx.query(
          "update ssa.emails set status=$2,provider_id=$3,sent_at=now(),cost=$4 where id=$1",
          [
            email!.id,
            job.demo ? "simulated" : "sent",
            result.id,
            job.demo ? 0 : cost,
          ],
        );
        await tx.query(
          "update ssa.operations set status='done',provider_id=$2,actual_cost=$3 where unique_key=$1",
          [job.unique_key, result.id, job.demo ? 0 : cost],
        );
      });
    }
    await db.query(
      "update ssa.prospects set status=case when status in ('Nuevo','Pendiente de revisión','Aprobado para contacto') then 'Contactado' else status end,updated_at=now() where id=$1",
      [p.id],
    );
    await activity(
      p.id,
      channel,
      `${job.demo ? "Simulación" : "Solicitud enviada al proveedor"} · ${channel === "call" ? "llamada" : "correo"}`,
      job.demo,
    );
    return true;
  } catch (error) {
    await db.query(
      "update ssa.operations set status='uncertain' where unique_key=$1",
      [job.unique_key],
    );
    await db.query(
      "update ssa.automation_jobs set status='uncertain',error='Resultado del proveedor incierto. Revisar antes de cualquier nuevo contacto.' where id=$1",
      [job.id],
    );
    throw error;
  }
}
async function processJob(job: Job) {
  const db = await getDB(),
    s = await settings();
  if (job.demo !== (s.mode === "demo"))
    throw new AppError("El trabajo pertenece a otro modo.");
  if (s.emergency) throw new AppError("Parada de emergencia activa.");
  if (job.kind === "dispatch") return dispatch(job);
  if (job.kind === "notification") {
    const [n] = await db.query<Notification & { prospect_id: string | null }>(
      "select * from ssa.notifications where id=$1",
      [job.payload.notification_id],
    );
    if (!n) throw new AppError("Notificación no encontrada.");
    if (!job.demo && !process.env.TELEGRAM_BOT_TOKEN) {
      await db.query(
        "update ssa.notifications set status='not_configured' where id=$1",
        [n.id],
      );
      return true;
    }
    const link = n.prospect_id
      ? new URL("/prospectos/" + n.prospect_id, process.env.APP_URL).toString()
      : process.env.APP_URL;
    await telegram(
      `SOLERVIA SALES AGENT\n\n${n.message}\n${link}`,
      s,
      job.demo,
    );
    await db.query("update ssa.notifications set status=$2 where id=$1", [
      n.id,
      job.demo ? "simulated" : "sent",
    ]);
    return true;
  }
  if (job.kind === "followup") {
    const p = await getProspect(String(job.payload.prospect_id));
    if (
      p.status === "No contactar" ||
      new Date(p.followup_at || 0).toISOString() !==
        new Date(String(job.payload.at)).toISOString()
    )
      return true;
    await activity(
      p.id,
      "followup",
      "Seguimiento pendiente: " +
        (p.next_action || "Revisar ficha. No se contactó automáticamente."),
      job.demo,
    );
    await notify(
      "interest",
      `Seguimiento pendiente: ${p.name}`,
      job.demo,
      p.id,
    );
    return true;
  }
  if (job.kind === "search") {
    const rows = await searchCompanies(
      job.payload.filters as unknown as SearchFilters,
      job.demo,
    );
    for (const row of rows) await createProspect(row);
    await activity(
      null,
      "search",
      `Búsqueda programada completada: ${rows.length} resultados; duplicados omitidos.`,
      job.demo,
    );
    return true;
  }
  throw new AppError("Tipo de trabajo desconocido.");
}
export async function runWorker(limit = 10) {
  const db = await getDB();
  const s = await settings();
  if (s.emergency) return { processed: 0, stopped: true };
  await db.query(
    "update ssa.automation_jobs set status=case when kind='dispatch' then 'uncertain' else 'queued' end,error='Interrupción del worker; revisar estado.',locked_at=null where status='running' and locked_at<now()-interval '5 minutes'",
  );
  await db.query(
    "update ssa.operations set status='uncertain' where status='reserved' and created_at<now()-interval '5 minutes'",
  );
  await scheduleSearches();
  let processed = 0;
  const deadline = Date.now() + 30000;
  for (let i = 0; i < limit; i++) {
    if (Date.now() >= deadline) break;
    if ((await settings()).emergency) break;
    const job = await db.transaction(async (tx) => {
      const [j] = await tx.query<Job>(
        "select * from ssa.automation_jobs where status='queued' and run_at<=now() and demo=$1 order by run_at for update skip locked limit 1",
        [s.mode === "demo"],
      );
      if (!j) return null;
      await tx.query(
        "update ssa.automation_jobs set status='running',locked_at=now(),attempts=attempts+1 where id=$1",
        [j.id],
      );
      return { ...j, attempts: j.attempts + 1 };
    });
    if (!job) break;
    try {
      if (await processJob(job))
        await db.query(
          "update ssa.automation_jobs set status='done',error=null where id=$1",
          [job.id],
        );
    } catch (e) {
      const message =
        e instanceof AppError
          ? e.message
          : "Error de proveedor o ejecución; revisar integración.";
      await db.query(
        "update ssa.automation_jobs set status=$2,error=$3,run_at=now()+interval '5 minutes',locked_at=null where id=$1 and status='running'",
        [
          job.id,
          job.kind !== "dispatch" && job.attempts < 3 ? "queued" : "failed",
          message,
        ],
      );
      await audit("job.failed", job.id, { kind: job.kind, message });
      if (job.kind !== "notification")
        await notify(
          message.includes("presupuesto") || message.includes("límite")
            ? "budget"
            : "error",
          message,
          job.demo,
        );
    }
    processed++;
  }
  const completed = await db.query<{ id: string; name: string; demo: boolean }>(
    "update ssa.campaigns c set status='completed' where c.status='running' and exists(select 1 from ssa.automation_jobs j where j.payload->>'campaign_id'=c.id::text) and not exists(select 1 from ssa.automation_jobs j where j.payload->>'campaign_id'=c.id::text and j.status in ('queued','running','uncertain')) returning id,name,demo",
  );
  for (const c of completed)
    await notify(
      "campaign",
      `Campaña finalizada: ${c.name}. Revisa resultados y trabajos fallidos.`,
      c.demo,
    );
  await retention(s);
  return { processed, stopped: false };
}
async function scheduleSearches() {
  const db = await getDB(),
    s = await settings();
  await db.transaction(async (tx) => {
    const rows = await tx.query<{
      id: string;
      filters: SearchFilters;
      next_run: string;
      interval_hours: number;
      demo: boolean;
    }>(
      "select * from ssa.scheduled_searches where active=true and next_run<=now() and demo=$1 for update skip locked",
      [s.mode === "demo"],
    );
    for (const row of rows) {
      await enqueue(
        "search",
        { filters: row.filters },
        `search:${row.id}:${new Date(row.next_run).toISOString()}`,
        row.demo,
        new Date(),
        tx,
      );
      await tx.query(
        "update ssa.scheduled_searches set next_run=now()+interval '1 hour'*interval_hours where id=$1",
        [row.id],
      );
    }
  });
}
async function retention(s: Settings) {
  const db = await getDB();
  await db.query(
    "update ssa.calls set transcript=null,summary=null,objections=null where created_at<now()-$1*interval '1 day' and (transcript is not null or summary is not null)",
    [s.retention_days],
  );
  await db.query(
    "update ssa.emails set body='[Contenido eliminado por retención]',reply=null where created_at<now()-$1*interval '1 day' and body<>'[Contenido eliminado por retención]'",
    [s.retention_days],
  );
  await db.query("delete from ssa.sessions where expires_at<now()");
  await db.query(
    "delete from ssa.rate_limits where resets_at<now()-interval '1 day'",
  );
}
