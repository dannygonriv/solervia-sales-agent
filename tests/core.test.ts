import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { getDB, settings } from "../src/lib/db";
import { defaultSettings, type Email, type Call } from "../src/lib/domain";
import {
  createProspect,
  getProspect,
  enqueue,
  suppressProspect,
  editCompany,
} from "../src/lib/services/crm";
import {
  createCampaign,
  controlCampaign,
  draftEmail,
  proposeMeeting,
  confirmMeeting,
  qualify,
} from "../src/lib/services/sales";
import { runWorker } from "../src/lib/services/worker";
import { eligible, reserve } from "../src/lib/services/policy";
import { retellWebhook } from "../src/lib/services/webhooks";
import { handle } from "../src/lib/api";
import {
  passwordHash,
  verifyPassword,
  signed,
  verifySigned,
  safeCSV,
  encrypt,
  decrypt,
} from "../src/lib/security";
process.env.LOCAL_DATABASE_PATH = ":memory:";
process.env.APP_ENV = "local";
process.env.DATABASE_URL = "";
process.env.APP_URL = "http://127.0.0.1:3000";
process.env.SESSION_SECRET = "a".repeat(64);
process.env.TOKEN_ENCRYPTION_KEY = "b".repeat(64);
process.env.LIVE_ACTIONS_ENABLED = "false";
let productId: string, scriptId: string;
beforeAll(async () => {
  await getDB();
});
beforeEach(async () => {
  const db = await getDB();
  const tables = await db.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname='ssa' and tablename not in ('schema_migrations','settings')",
  );
  await db.query(
    "truncate " +
      tables.map((t) => "ssa." + t.tablename).join(",") +
      " cascade",
  );
  await db.query("update ssa.settings set data=$1::jsonb where id=1", [
    JSON.stringify({ ...defaultSettings, start_hour: 0, end_hour: 24 }),
  ]);
  const [p] = await db.query<{ id: string }>(
    "insert into ssa.products(name,line,description) values('Solervia Custom','Custom','Desarrollo de software a medida') returning id",
  );
  productId = p.id;
  const [s] = await db.query<{ id: string }>(
    "insert into ssa.scripts(product_id,name,audience,opening,value_proposition,questions,objections,allowed_answers,goal,max_seconds,end_conditions) values($1,'Exploración','Empresas','Soy un asistente virtual de Solervia.','Explorar oportunidades de software.','¿Qué necesitan?','No tengo tiempo','Ofrecer seguimiento humano','Proponer reunión',120,'Finalizar si no desea continuar') returning id",
    [p.id],
  );
  scriptId = s.id;
});
afterEach(() => vi.restoreAllMocks());
async function prospect(name = "Empresa ficticia") {
  return createProspect({
    name,
    source: "Prueba automatizada",
    city: "Guadalajara",
    state: "Jalisco",
    email: name.replaceAll(" ", "").toLowerCase() + "@example.invalid",
    demo: true,
  });
}
async function campaign(p: string, channel: "email" | "call" = "call") {
  return createCampaign({
    name: "Campaña prueba",
    product_id: productId,
    script_id: channel === "call" ? scriptId : null,
    channel,
    prospect_ids: [p],
    max_contacts: 5,
    budget: 5,
    starts_at: new Date(Date.now() - 60000).toISOString(),
    start_hour: 0,
    end_hour: 24,
  });
}
describe("Seguridad y autenticación", () => {
  it("verifica contraseñas scrypt, firma enlaces y cifra tokens", () => {
    const encoded = passwordHash("una contraseña larga");
    expect(verifyPassword("una contraseña larga", encoded)).toBe(true);
    expect(verifyPassword("incorrecta", encoded)).toBe(false);
    expect(verifySigned(signed("id"))).toBe("id");
    expect(() => verifySigned(signed("id") + "x")).toThrow();
    const encrypted = encrypt("token privado");
    expect(encrypted).not.toContain("token privado");
    expect(decrypt(encrypted)).toBe("token privado");
  });
  it("bloquea API sin sesión, origen ajeno y cron sin secreto", async () => {
    expect(
      (await handle(new Request("http://localhost/api/state"), ["state"]))
        .status,
    ).toBe(401);
    expect(
      (
        await handle(
          new Request("http://localhost/api/login", {
            method: "POST",
            headers: { Origin: "https://evil.invalid" },
            body: "{}",
          }),
          ["login"],
        )
      ).status,
    ).toBe(403);
    expect(
      (await handle(new Request("http://localhost/api/cron"), ["cron"])).status,
    ).toBe(401);
  });
  it("inicia sesión y revoca la cookie al salir", async () => {
    const db = await getDB();
    await db.query("insert into ssa.users(email,password_hash) values($1,$2)", [
      "test@example.invalid",
      passwordHash("testpassword123"),
    ]);
    const response = await handle(
      new Request("http://127.0.0.1:3000/api/login", {
        method: "POST",
        headers: { Origin: "http://127.0.0.1:3000" },
        body: JSON.stringify({
          email: "test@example.invalid",
          password: "testpassword123",
        }),
      }),
      ["login"],
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    const headers = { cookie, Origin: "http://127.0.0.1:3000" };
    expect(
      (
        await handle(new Request("http://localhost/api/state", { headers }), [
          "state",
        ])
      ).status,
    ).toBe(200);
    await handle(
      new Request("http://localhost/api/logout", { method: "POST", headers }),
      ["logout"],
    );
    expect(
      (
        await handle(new Request("http://localhost/api/state", { headers }), [
          "state",
        ])
      ).status,
    ).toBe(401);
  });
  it("neutraliza fórmulas al exportar CSV", () => {
    expect(safeCSV([["=1+1", "+cmd", "normal", 'texto,"citado"']])).toContain(
      '"\'=1+1"',
    );
  });
  it("rechaza firma inválida en webhook real", async () => {
    process.env.RETELL_API_KEY = "test-key";
    await expect(retellWebhook("{}", "bad")).rejects.toThrow("Firma inválida");
    delete process.env.RETELL_API_KEY;
  });
  it("RLS está habilitado en todas las tablas privadas", async () => {
    const rows = await (
      await getDB()
    ).query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ssa' and c.relkind='r'",
    );
    expect(rows.length).toBeGreaterThan(15);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });
});
describe("CRM y calificación", () => {
  it("persiste prospectos y detecta duplicados concurrentes", async () => {
    const rows = await Promise.all([prospect(), prospect()]);
    expect(rows[0].id).toBe(rows[1].id);
    expect(rows.filter((r) => r.duplicate)).toHaveLength(1);
    expect((await getProspect(rows[0].id)).name).toBe("Empresa ficticia");
  });
  it("una edición de destino revoca permisos de ese canal", async () => {
    const { id } = await prospect();
    const db = await getDB();
    const p = await getProspect(id);
    await db.query(
      "update ssa.contacts set email_allowed=true,call_allowed=true where id=$1",
      [p.contact_id],
    );
    await editCompany(id, {
      ...p,
      email: "nuevo@example.invalid",
      source: "Prueba",
      demo: true,
    });
    expect((await getProspect(id)).email_allowed).toBe(false);
  });
  it("califica sin tráfico externo en demo y distingue hipótesis", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network in demo"));
    const { id } = await prospect();
    const result = await qualify(id);
    expect(result.hypotheses.length).toBeGreaterThan(0);
    expect(result.reason).toContain("demostración");
    expect((await getProspect(id)).score).toBe(result.score);
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe("Campañas y cola durable", () => {
  it("simula llamada, persiste transcripción y no duplica al reejecutar", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network"));
    const { id } = await prospect();
    const c = await campaign(id);
    await controlCampaign(c.id, "start");
    await runWorker();
    await runWorker();
    const calls = await (await getDB()).query<Call>("select * from ssa.calls");
    expect(calls).toHaveLength(1);
    expect(calls[0].transcript).toContain("SIMULACIÓN");
    expect(calls[0].demo).toBe(true);
    expect(Number(calls[0].cost)).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("exige aprobar borrador y simula un envío sin red", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network"));
    const { id } = await prospect();
    const c = await campaign(id, "email");
    await expect(controlCampaign(c.id, "start")).rejects.toThrow("aprueba");
    const e = await draftEmail(id, productId, c.id);
    await (
      await getDB()
    ).query(
      "update ssa.emails set status='approved',approved_at=now() where id=$1",
      [e.id],
    );
    await controlCampaign(c.id, "start");
    await runWorker();
    const [sent] = await (
      await getDB()
    ).query<Email>("select * from ssa.emails where id=$1", [e.id]);
    expect(sent.status).toBe("simulated");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("exclusión después de aprobar impide la llamada", async () => {
    const { id } = await prospect();
    const c = await campaign(id);
    await controlCampaign(c.id, "start");
    await (
      await getDB()
    ).transaction((tx) => suppressProspect(id, "Solicitud de baja", tx));
    await runWorker();
    expect(await (await getDB()).query("select * from ssa.calls")).toHaveLength(
      0,
    );
  });
  it("parada de emergencia bloquea toda ejecución", async () => {
    const { id } = await prospect();
    const c = await campaign(id);
    await controlCampaign(c.id, "start");
    await (
      await getDB()
    ).query(
      "update ssa.settings set data=jsonb_set(data,'{emergency}','true')",
    );
    expect((await runWorker()).stopped).toBe(true);
    expect(await (await getDB()).query("select * from ssa.calls")).toHaveLength(
      0,
    );
  });
  it("pausa conserva trabajos sin contactar y reanudar es idempotente", async () => {
    const { id } = await prospect();
    const c = await campaign(id);
    await controlCampaign(c.id, "start");
    await controlCampaign(c.id, "pause");
    await runWorker();
    expect(await (await getDB()).query("select * from ssa.calls")).toHaveLength(
      0,
    );
    await controlCampaign(c.id, "start");
    await (await getDB()).query("update ssa.automation_jobs set run_at=now()");
    await runWorker();
    expect(await (await getDB()).query("select * from ssa.calls")).toHaveLength(
      1,
    );
  });
  it("reserva presupuestos atómicamente bajo concurrencia", async () => {
    const db = await getDB();
    await db.query(
      "update ssa.settings set data=jsonb_set(data,'{daily_budget}','1')",
    );
    const p = await getProspect((await prospect()).id);
    const results = await Promise.allSettled([
      reserve(db, p, null, "ai", "a", 0.7, true, null),
      reserve(db, p, null, "ai", "b", 0.7, true, null),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.query("select * from ssa.operations")).toHaveLength(1);
  });
  it("no mezcla trabajos demo con producción aunque cambie el modo", async () => {
    const { id } = await prospect();
    const c = await campaign(id);
    await controlCampaign(c.id, "start");
    await (
      await getDB()
    ).query(
      "update ssa.settings set data=jsonb_set(data,'{mode}','\"production\"')",
    );
    await runWorker();
    expect(await (await getDB()).query("select * from ssa.calls")).toHaveLength(
      0,
    );
  });
  it("recuperación de trabajo de contacto interrumpido exige revisión", async () => {
    await enqueue(
      "dispatch",
      { prospect_id: (await prospect()).id },
      "interrupted",
      true,
    );
    const db = await getDB();
    await db.query(
      "update ssa.automation_jobs set status='running',locked_at=now()-interval '10 minutes'",
    );
    await runWorker();
    expect(
      (
        await db.query<{ status: string }>(
          "select status from ssa.automation_jobs",
        )
      )[0].status,
    ).toBe("uncertain");
  });
  it("presupuesto de campaña insuficiente no contacta", async () => {
    const { id } = await prospect();
    const c = await campaign(id);
    await (
      await getDB()
    ).query("update ssa.campaigns set budget=0.01 where id=$1", [c.id]);
    await controlCampaign(c.id, "start");
    await runWorker();
    expect(await (await getDB()).query("select * from ssa.calls")).toHaveLength(
      0,
    );
  });
  it("una segunda campaña no evade cooldown por dirección compartida", async () => {
    const { id } = await prospect();
    const p = await getProspect(id),
      db = await getDB();
    expect(
      await reserve(db, p, null, "email", "one", 0.01, true, p.email),
    ).toBe(true);
    await expect(
      reserve(db, p, null, "email", "two", 0.01, true, p.email),
    ).rejects.toThrow("pausa");
  });
});
describe("Webhooks y calendario", () => {
  it("procesa webhook demo una sola vez y registra baja global", async () => {
    const { id } = await prospect();
    const c = await campaign(id);
    await controlCampaign(c.id, "start");
    await runWorker();
    const [call] = await (await getDB()).query<Call>("select * from ssa.calls");
    const body = JSON.stringify({
      event: "call_analyzed",
      call: {
        call_id: call.provider_id,
        call_analysis: {
          call_summary: "No desea más contacto",
          custom_analysis_data: { opt_out: true },
        },
        duration_ms: 64000,
      },
    });
    expect((await retellWebhook(body, "", true)).duplicate).toBe(false);
    expect((await retellWebhook(body, "", true)).duplicate).toBe(true);
    expect((await getProspect(id)).status).toBe("No contactar");
  });
  it("evita conflictos de reuniones y no crea eventos externos en demo", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network"));
    const { id } = await prospect();
    const values = {
      prospect_id: id,
      product_id: productId,
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      ends_at: new Date(Date.now() + 90000000).toISOString(),
      summary: "Prueba",
    };
    const m = await proposeMeeting(values);
    expect(m.status).toBe("proposed");
    expect((await confirmMeeting(m.id)).status).toBe("simulated");
    const conflict = await proposeMeeting(values);
    await expect(confirmMeeting(conflict.id)).rejects.toThrow("conflicto");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bloquea prospectos reales sin la habilitación del servidor", async () => {
    const p = await getProspect((await prospect()).id),
      s = { ...(await settings()), mode: "production" as const };
    await expect(
      eligible({ ...p, demo: false }, "email", s, await getDB(), false),
    ).rejects.toThrow("bloqueadas");
  });
});

describe("Casos adicionales de ejecución", () => {
  it("dos workers concurrentes no duplican la misma comunicación", async () => {
    const { id } = await prospect();
    const c = await campaign(id);
    await controlCampaign(c.id, "start");
    await Promise.all([runWorker(), runWorker()]);
    expect(
      await (await getDB()).query("select id from ssa.calls"),
    ).toHaveLength(1);
  });
  it("una autorización revocada después de leer la ficha se vuelve a consultar en la reserva", async () => {
    const { id } = await prospect();
    const p = await getProspect(id),
      db = await getDB();
    await db.query(
      "update ssa.prospects set status='No contactar' where id=$1",
      [id],
    );
    await expect(
      reserve(db, p, null, "email", "stale-permission", 0.01, true, p.email),
    ).rejects.toThrow("estado");
  });
  it("búsqueda programada persiste resultados sin red y no los duplica", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network"));
    const filters = {
      keyword: "",
      city: "Guadalajara",
      state_code: "14",
      municipality: "",
      sector: "",
      activity: "",
      size: "",
      page: 1,
    };
    await (
      await getDB()
    ).query(
      "insert into ssa.scheduled_searches(name,filters,interval_hours,demo) values($1,$2::jsonb,24,true)",
      ["Prueba periódica", JSON.stringify(filters)],
    );
    await runWorker();
    expect(
      await (await getDB()).query("select id from ssa.prospects"),
    ).toHaveLength(3);
    await (
      await getDB()
    ).query("update ssa.scheduled_searches set next_run=now()");
    await runWorker();
    expect(
      await (await getDB()).query("select id from ssa.prospects"),
    ).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sin integración Google una reunión real permanece propuesta", async () => {
    const db = await getDB();
    await db.query(
      "update ssa.settings set data=jsonb_set(data,'{mode}','\"production\"')",
    );
    const p = await createProspect({
      name: "Prueba real sin contactar",
      source: "Fixture",
      city: "Guadalajara",
      state: "Jalisco",
      demo: false,
    });
    const m = await proposeMeeting({
      prospect_id: p.id,
      product_id: productId,
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      ends_at: new Date(Date.now() + 90000000).toISOString(),
      summary: "Propuesta pendiente",
    });
    expect((await confirmMeeting(m.id)).status).toBe("proposed");
  });
  it("una confirmación en curso no se ejecuta simultáneamente", async () => {
    const { id } = await prospect();
    const m = await proposeMeeting({
      prospect_id: id,
      product_id: productId,
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      ends_at: new Date(Date.now() + 90000000).toISOString(),
      summary: "Prueba de concurrencia",
    });
    await (
      await getDB()
    ).query(
      "update ssa.meetings set status='confirming',confirmation_started_at=now() where id=$1",
      [m.id],
    );
    await expect(confirmMeeting(m.id)).rejects.toThrow("en proceso");
  });
});
