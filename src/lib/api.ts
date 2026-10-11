import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { getDB, settings, audit } from "./db";
import {
  AppError,
  assertOrigin,
  session,
  rateLimit,
  verifyPassword,
  hash,
  cookieOptions,
  cookieValue,
  secret,
  same,
  signed,
  verifySigned,
  safeCSV,
} from "./security";
import {
  uuid,
  productInput,
  scriptInput,
  settingsInput,
  type Email,
  type Campaign,
} from "./domain";
import {
  state,
  createProspect,
  editProspect,
  editCompany,
  setConsent,
  getProspect,
  enqueue,
  suppressProspect,
  activity,
  notify,
} from "./services/crm";
import {
  qualify,
  draftEmail,
  createCampaign,
  controlCampaign,
  proposeMeeting,
  confirmMeeting,
} from "./services/sales";
import { runWorker } from "./services/worker";
import { retellWebhook, emailWebhook } from "./services/webhooks";
import { searchCompanies, jsonFetch, requireEnv } from "./providers";
import {
  googleRedirect,
  storeGoogleTokens,
  googleConnected,
  availability,
} from "./providers/calendar";
const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
async function body(request: Request) {
  const text = await request.text();
  if (text.length > 400000)
    throw new AppError("Solicitud demasiado grande.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("JSON inválido.");
  }
}
const searchSchema = z.object({
  keyword: z.string().max(100).default(""),
  state_code: z
    .string()
    .regex(/^(0[1-9]|[12][0-9]|3[0-2])$/)
    .default("14"),
  municipality: z.string().max(100).default(""),
  sector: z.string().max(100).default(""),
  activity: z.string().max(150).default(""),
  size: z.string().max(100).default(""),
  city: z.string().max(100).default("Guadalajara"),
  page: z.number().int().min(1).max(100).default(1),
});
export async function handle(request: Request, path: string[]) {
  try {
    return await route(request, path);
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (error instanceof AppError)
      return json({ error: error.message }, error.status);
    console.error(
      "SSA request failed",
      error instanceof Error ? error.name : "unknown",
    );
    return json(
      {
        error:
          "No se completó la operación. Revisa la configuración o los registros del servidor.",
      },
      500,
    );
  }
}
async function route(request: Request, path: string[]): Promise<Response> {
  const key = path.join("/"),
    method = request.method,
    url = new URL(request.url);
  if (key === "health" && method === "GET")
    return json({ ok: true, service: "Solervia Sales Agent" });
  if (key === "login" && method === "POST") {
    assertOrigin(request);
    const input = z
      .object({ email: z.email(), password: z.string().min(1).max(200) })
      .parse(await body(request));
    await rateLimit("login:global", 30, 900);
    await rateLimit("login:" + hash(input.email.toLowerCase()), 8, 900);
    secret();
    const db = await getDB();
    const [user] = await db.query<{ id: string; password_hash: string }>(
      "select id,password_hash from ssa.users where email=$1",
      [input.email.toLowerCase()],
    );
    const fallback = "0123456789abcdef0123456789abcdef:" + "00".repeat(64);
    const valid = verifyPassword(
      input.password,
      user?.password_hash || fallback,
    );
    if (!user || !valid)
      throw new AppError("Correo o contraseña incorrectos.", 401);
    const token = randomBytes(32).toString("base64url");
    await db.query(
      "insert into ssa.sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '8 hours')",
      [hash(token), user.id],
    );
    await audit("auth.login", user.id);
    return json({ ok: true }, 200, {
      "Set-Cookie": `ssa_session=${token}; ${cookieOptions()}`,
    });
  }
  if (key === "cron" && method === "GET") {
    if (
      !process.env.CRON_SECRET ||
      !same(
        request.headers.get("authorization") || "",
        `Bearer ${process.env.CRON_SECRET}`,
      )
    )
      throw new AppError("No autorizado.", 401);
    return json(await runWorker(10));
  }
  if (key === "webhooks/retell" && method === "POST") {
    const raw = await request.text();
    if (raw.length > 400000)
      throw new AppError("Evento demasiado grande.", 413);
    return json(
      await retellWebhook(raw, request.headers.get("x-retell-signature") || ""),
    );
  }
  if (key === "webhooks/email" && method === "POST") {
    const raw = await request.text();
    if (raw.length > 400000)
      throw new AppError("Evento demasiado grande.", 413);
    return json(await emailWebhook(raw, request.headers));
  }
  if (key === "unsubscribe") {
    const token = url.searchParams.get("token") || "",
      id = uuid.parse(verifySigned(token));
    if (method === "GET")
      return new Response(
        `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Solervia · Preferencias</title><body style="font-family:system-ui;max-width:580px;margin:80px auto;padding:24px"><h1>Dejar de recibir comunicaciones</h1><p>Confirma tu solicitud para excluir este contacto de las campañas de Solervia.</p><form method="post"><button style="padding:14px">Confirmar baja</button></form></body></html>`,
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    if (method === "POST") {
      await (
        await getDB()
      ).transaction((tx) =>
        suppressProspect(id, "Solicitud mediante enlace de baja", tx),
      );
      return new Response(
        "Tu solicitud se registró. No recibirás más comunicaciones.",
        { headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
  }
  const user = await session(request);
  if (!["GET", "HEAD"].includes(method)) assertOrigin(request);
  await rateLimit("admin:" + user.id, 240, 60);
  if (key === "logout" && method === "POST") {
    await (
      await getDB()
    ).query("delete from ssa.sessions where token_hash=$1", [
      hash(cookieValue(request, "ssa_session")),
    ]);
    return json({ ok: true }, 200, {
      "Set-Cookie": "ssa_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    });
  }
  if (key === "state" && method === "GET") {
    const data = await state();
    const g = data.integrations.find((i) => i.name === "Google Calendar");
    if (g && (await googleConnected()))
      g.detail =
        "Cuenta conectada mediante OAuth; disponibilidad pendiente de cada consulta";
    return json(data);
  }
  if (key === "prospects/export" && method === "GET") {
    const data = await state();
    return new Response(
      safeCSV([
        [
          "Empresa",
          "Estado",
          "Sector",
          "Ciudad",
          "Correo",
          "Teléfono",
          "Prioridad",
          "Fuente",
          "Simulado",
        ],
        ...data.prospects.map((p) => [
          p.name,
          p.status,
          p.sector,
          p.city,
          p.email,
          p.phone,
          p.score,
          p.source,
          p.demo,
        ]),
      ]),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="prospectos-solervia.csv"',
          "Cache-Control": "no-store",
        },
      },
    );
  }
  if (key === "prospects" && method === "POST")
    return json(await createProspect(await body(request)), 201);
  if (path[0] === "prospects" && path[1]) {
    const id = uuid.parse(path[1]);
    if (path.length === 2 && method === "GET")
      return json(await getProspect(id));
    if (method === "PATCH" && path.length === 2) {
      await editProspect(id, await body(request));
      return json({ ok: true });
    }
    if (path[2] === "company" && method === "PATCH") {
      await editCompany(id, await body(request));
      return json({ ok: true });
    }
    if (path[2] === "consent" && method === "POST") {
      await setConsent(id, await body(request));
      return json({ ok: true });
    }
    if (path[2] === "qualify" && method === "POST")
      return json(await qualify(id));
    if (path[2] === "draft" && method === "POST") {
      const v = z.object({ product_id: uuid }).parse(await body(request));
      return json(await draftEmail(id, v.product_id));
    }
  }
  if (key === "search" && method === "POST") {
    const filters = searchSchema.parse(await body(request));
    await rateLimit("denue", 20, 60);
    return json({
      companies: await searchCompanies(
        filters,
        (await settings()).mode === "demo",
      ),
      page: filters.page,
      note: "Los filtros locales se aplican sobre cada lote de 50 registros de DENUE.",
    });
  }
  if (key === "searches" && method === "POST") {
    const v = z
      .object({
        name: z.string().min(2).max(100),
        filters: searchSchema,
        interval_hours: z.number().int().min(1).max(720),
      })
      .parse(await body(request));
    const [r] = await (
      await getDB()
    ).query(
      "insert into ssa.scheduled_searches(name,filters,interval_hours,demo) values($1,$2::jsonb,$3,$4) returning id",
      [
        v.name,
        JSON.stringify(v.filters),
        v.interval_hours,
        (await settings()).mode === "demo",
      ],
    );
    return json(r, 201);
  }
  if (path[0] === "searches" && path[1] && method === "PATCH") {
    const v = z.object({ active: z.boolean() }).parse(await body(request));
    await (
      await getDB()
    ).query("update ssa.scheduled_searches set active=$2 where id=$1", [
      uuid.parse(path[1]),
      v.active,
    ]);
    return json({ ok: true });
  }
  if (
    ["products", "scripts"].includes(path[0]) &&
    ["POST", "PATCH"].includes(method)
  ) {
    const table = path[0],
      v =
        table === "products"
          ? productInput.parse(await body(request))
          : scriptInput.parse(await body(request)),
      entries = Object.entries(v),
      columns = entries.map((e) => e[0]),
      values = entries.map((e) => e[1]),
      db = await getDB();
    if (method === "POST") {
      const [row] = await db.query(
        `insert into ssa.${table}(${columns.join(",")}) values(${values.map((_, i) => "$" + (i + 1)).join(",")}) returning id`,
        values,
      );
      await audit(`${table}.created`, String(row.id));
      return json(row, 201);
    }
    const id = uuid.parse(path[1]);
    await db.query(
      `update ssa.${table} set ${columns.map((c, i) => c + "=$" + (i + 2)).join(",")} where id=$1`,
      [id, ...values],
    );
    await audit(`${table}.updated`, id);
    return json({ ok: true });
  }
  if (key === "campaigns" && method === "POST")
    return json(await createCampaign(await body(request)), 201);
  if (path[0] === "campaigns" && path[1] && method === "POST") {
    const id = uuid.parse(path[1]);
    if (path[2] === "drafts") {
      const db = await getDB();
      const [c] = await db.query<Campaign>(
        "select * from ssa.campaigns where id=$1",
        [id],
      );
      if (!c || c.channel !== "email" || c.status !== "draft")
        throw new AppError(
          "Prepara correos en una campaña de correo en borrador.",
        );
      const members = await db.query<{ prospect_id: string }>(
        "select cp.prospect_id from ssa.campaign_prospects cp where campaign_id=$1 and not exists(select 1 from ssa.emails e where e.campaign_id=cp.campaign_id and e.prospect_id=cp.prospect_id) limit 2",
        [id],
      );
      for (const m of members)
        await draftEmail(m.prospect_id, c.product_id, id);
      return json({ prepared: members.length });
    }
    const v = z
      .object({
        action: z.enum(["start", "pause", "cancel"]),
        approved: z.boolean().optional(),
      })
      .parse(await body(request));
    if (v.action === "start" && !v.approved)
      throw new AppError("Confirma la revisión humana.");
    await controlCampaign(id, v.action);
    return json({ ok: true });
  }
  if (path[0] === "emails" && path[1]) {
    const id = uuid.parse(path[1]),
      db = await getDB();
    const [email] = await db.query<Email>(
      "select * from ssa.emails where id=$1",
      [id],
    );
    if (!email) throw new AppError("Correo no encontrado.", 404);
    if (method === "PATCH") {
      if (!["draft", "approved"].includes(email.status))
        throw new AppError("No se puede editar un correo enviado.");
      const v = z
        .object({
          subject: z.string().min(2).max(200),
          body: z.string().min(10).max(20000),
        })
        .parse(await body(request));
      const changed = await db.query(
        "update ssa.emails set subject=$2,body=$3,status='draft',approved_at=null where id=$1 and status in ('draft','approved') returning id",
        [id, v.subject, v.body],
      );
      if (!changed.length)
        throw new AppError("El envío ya está en proceso.", 409);
      return json({ ok: true });
    }
    if (method === "POST") {
      if (path[2] === "approve") {
        if (!["draft", "approved"].includes(email.status))
          throw new AppError("Estado inválido.");
        await db.query(
          "update ssa.emails set status='approved',approved_at=now() where id=$1 and status in ('draft','approved')",
          [id],
        );
        await audit("email.approved", id);
        return json({ ok: true });
      }
      if (path[2] === "send") {
        if (email.campaign_id)
          throw new AppError("Inicia la campaña para enviar este borrador.");
        if (email.status !== "approved")
          throw new AppError("Aprueba el correo antes de enviarlo.");
        await enqueue(
          "dispatch",
          { prospect_id: email.prospect_id, email_id: id },
          "email:" + id,
          email.demo,
        );
        await db.query(
          "update ssa.automation_jobs j set status='queued',run_at=now(),error=null where unique_key=$1 and status='failed' and not exists(select 1 from ssa.operations o where o.unique_key=j.unique_key)",
          ["email:" + id],
        );
        return json({ queued: true });
      }
      if (path[2] === "reply") {
        const v = z
          .object({ reply: z.string().min(1).max(20000), opt_out: z.boolean() })
          .parse(await body(request));
        await db.transaction(async (tx) => {
          await tx.query(
            "update ssa.emails set reply=$2,status='replied' where id=$1",
            [id, v.reply],
          );
          if (v.opt_out)
            await suppressProspect(
              email.prospect_id,
              "Baja recibida por correo",
              tx,
            );
          await activity(
            email.prospect_id,
            "reply",
            "Respuesta registrada manualmente.",
            email.demo,
            tx,
          );
        });
        return json({ ok: true });
      }
    }
  }
  if (key === "meetings" && method === "POST")
    return json(await proposeMeeting(await body(request)), 201);
  if (path[0] === "meetings" && path[2] === "confirm" && method === "POST")
    return json(await confirmMeeting(uuid.parse(path[1])));
  if (key === "calendar/availability" && method === "POST") {
    const v = z
      .object({ start: z.iso.datetime(), end: z.iso.datetime() })
      .parse(await body(request));
    if ((await settings()).mode === "demo")
      return json({
        available: null,
        simulated: true,
        note: "La confirmación simulada comprueba conflictos locales.",
      });
    return json(await availability(v.start, v.end));
  }
  if (key === "settings" && method === "PATCH") {
    const v = settingsInput.parse(await body(request));
    await (
      await getDB()
    ).transaction(async (tx) => {
      await tx.query("select id from ssa.settings where id=1 for update");
      await tx.query(
        "update ssa.settings set data=$1::jsonb,updated_at=now() where id=1",
        [JSON.stringify(v)],
      );
      await audit(
        "settings.updated",
        undefined,
        { mode: v.mode, emergency: v.emergency },
        tx,
      );
    });
    return json({ ok: true });
  }
  if (key === "emergency" && method === "POST") {
    const db = await getDB();
    await db.transaction(async (tx) => {
      await tx.query("select id from ssa.settings where id=1 for update");
      await tx.query(
        "update ssa.settings set data=jsonb_set(data,'{emergency}','true') where id=1",
      );
      await tx.query(
        "update ssa.campaigns set status='paused' where status='running'",
      );
      await audit("emergency.stop", undefined, {}, tx);
    });
    return json({
      ok: true,
      note: "Nuevos contactos bloqueados; las solicitudes ya aceptadas por un proveedor pueden continuar.",
    });
  }
  if (key === "worker" && method === "POST") return json(await runWorker());
  if (path[0] === "jobs" && path[2] === "retry" && method === "POST") {
    const id = uuid.parse(path[1]);
    const rows = await (
      await getDB()
    ).query(
      "update ssa.automation_jobs set status='queued',run_at=now(),error=null,attempts=0 where id=$1 and status='failed' and kind<>'dispatch' returning id",
      [id],
    );
    if (!rows.length)
      throw new AppError(
        "Sólo se reintentan trabajos internos fallidos; un contacto incierto requiere reconciliación.",
      );
    return json({ ok: true });
  }
  if (key === "suppression" && method === "POST") {
    const v = z
      .object({ prospect_id: uuid, reason: z.string().min(3).max(500) })
      .parse(await body(request));
    await (
      await getDB()
    ).transaction((tx) => suppressProspect(v.prospect_id, v.reason, tx));
    return json({ ok: true });
  }
  if (key === "webhooks/simulate" && method === "POST") {
    if ((await settings()).mode !== "demo")
      throw new AppError("Sólo disponible en demostración.");
    const v = z
      .object({ call_id: z.string(), opt_out: z.boolean().default(false) })
      .parse(await body(request));
    return json(
      await retellWebhook(
        JSON.stringify({
          event: "call_analyzed",
          call: {
            call_id: v.call_id,
            call_analysis: {
              call_summary: "Evento simulado verificado.",
              custom_analysis_data: {
                opt_out: v.opt_out,
                interest: "interested",
              },
            },
            duration_ms: 65000,
          },
        }),
        "",
        true,
      ),
    );
  }
  if (key === "notifications/test" && method === "POST") {
    await notify(
      "error",
      "Notificación de prueba solicitada por el administrador.",
      (await settings()).mode === "demo",
    );
    return json({ queued: true });
  }
  if (key === "oauth/google/start" && method === "GET") {
    requireEnv("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
    const state = randomBytes(24).toString("base64url"),
      verifier = randomBytes(32).toString("base64url"),
      value = Buffer.from(
        JSON.stringify({ state, verifier, expires: Date.now() + 600000 }),
      ).toString("base64url");
    const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    target.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: googleRedirect(),
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: target.toString(),
        "Set-Cookie": `ssa_oauth=${signed(value)}; ${cookieOptions()}`,
      },
    });
  }
  if (key === "oauth/google/callback" && method === "GET") {
    const payload = JSON.parse(
      Buffer.from(
        verifySigned(cookieValue(request, "ssa_oauth")),
        "base64url",
      ).toString(),
    );
    if (
      !same(payload.state, url.searchParams.get("state") || "") ||
      payload.expires < Date.now()
    )
      throw new AppError("OAuth expiró o no coincide.", 401);
    const code = url.searchParams.get("code");
    if (!code) throw new AppError("Google no autorizó la conexión.");
    const tokens = await jsonFetch<Record<string, unknown>>(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: googleRedirect(),
          grant_type: "authorization_code",
          code_verifier: payload.verifier,
        }),
      },
    );
    await storeGoogleTokens(tokens);
    await audit("google.connected", user.id);
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/configuracion",
        "Set-Cookie": "ssa_oauth=; Path=/; HttpOnly; Max-Age=0",
      },
    });
  }
  throw new AppError("Ruta no encontrada.", 404);
}
