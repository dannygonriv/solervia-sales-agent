import { afterEach, describe, expect, it, vi } from "vitest";
import Retell from "retell-sdk";
import {
  defaultSettings,
  type Prospect,
  type Script,
  type Product,
} from "../src/lib/domain";
import {
  analyze,
  generateEmail,
  searchCompanies,
  sendEmail,
  startCall,
  telegram,
  voiceContext,
} from "../src/lib/providers";
const p = {
  id: "7b748b58-e4c8-4f69-b01d-36119a4e97be",
  name: "Empresa ficticia de prueba",
  sector: "Servicios",
  activity: "Servicios",
  source: "Prueba",
  website: null,
  size: "6 a 10",
  phone: "+525500000000",
  email: "test@example.invalid",
  demo: false,
} as Prospect;
const product: Product = {
  id: "c558f186-9221-4e7a-abba-4d0755ddc4ec",
  name: "Desarrollo a medida",
  line: "Custom",
  description: "Aplicaciones web según alcance acordado.",
  price: null,
  active: true,
};
const script = {
  id: "fd34088b-1c56-4df2-8d2c-057715209742",
  product_id: product.id,
  name: "Exploración",
  opening: "Asistente virtual",
  max_seconds: 120,
} as Script;
const live = {
  ...defaultSettings,
  mode: "production" as const,
  sender_identity: "Solervia · Responsable comercial",
  privacy_notice: "https://example.invalid/privacidad",
};
function mockLive() {
  vi.stubEnv("LIVE_ACTIONS_ENABLED", "true");
  vi.stubEnv("COMPLIANCE_REVIEWED", "true");
  vi.stubEnv("RETELL_AGENT_REVIEWED", "true");
  vi.stubEnv("EMAIL_PROVIDER_APPROVED", "true");
  for (const key of [
    "RETELL_API_KEY",
    "RETELL_AGENT_ID",
    "RETELL_FROM_NUMBER",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "EMAIL_REPLY_TO",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
  ])
    vi.stubEnv(key, "test-only-" + key);
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("Contratos de proveedor sin comunicaciones reales", () => {
  it("Resend transmite identidad, baja e idempotencia con transporte simulado", async () => {
    mockLive();
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "test-mail" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    await sendEmail(
      "test@example.invalid",
      "Prueba",
      "Contenido ficticio",
      "test-key",
      "https://example.invalid/baja",
      live,
    );
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers["Idempotency-Key"]).toBe("test-key");
    const body = JSON.parse(options.body);
    expect(body.text).toContain("https://example.invalid/baja");
    expect(body.text).toContain(live.sender_identity);
    expect(body.reply_to).toBe("test-only-EMAIL_REPLY_TO");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("Retell recibe contexto, duración y grabaciones deshabilitadas con transporte simulado", async () => {
    mockLive();
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ call_id: "contract-test" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const call = await startCall(p, product, script, live);
    expect(call.call_id).toBe("contract-test");
    const request = fetch.mock.calls[0][0];
    const options = fetch.mock.calls[0][1];
    const body = JSON.parse(options?.body || (await request.text()));
    expect(body.retell_llm_dynamic_variables.sales_context).toContain(
      "asistente virtual",
    );
    expect(body.agent_override.agent.max_call_duration_ms).toBe(120000);
    expect(body.agent_override.agent.data_storage_setting).toBe(
      "basic_attributes_only",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("Telegram usa únicamente el chat del servidor con transporte simulado", async () => {
    mockLive();
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    await telegram("Notificación de prueba", live, false);
    expect(JSON.parse(fetch.mock.calls[0][1].body).chat_id).toBe(
      "test-only-TELEGRAM_CHAT_ID",
    );
  });
  it("demo ignora claves configuradas y no llama a red", async () => {
    mockLive();
    vi.stubEnv("OPENAI_API_KEY", "test-only-key");
    vi.stubEnv("DENUE_TOKEN", "test-only-key");
    const fetch = vi.fn().mockRejectedValue(new Error("No network"));
    vi.stubGlobal("fetch", fetch);
    await analyze(p, [product], defaultSettings);
    await generateEmail(p, product, defaultSettings);
    await telegram("demo", defaultSettings, true);
    expect(
      await searchCompanies(
        {
          keyword: "",
          city: "Guadalajara",
          state_code: "14",
          municipality: "",
          sector: "",
          activity: "",
          size: "",
          page: 1,
        },
        true,
      ),
    ).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("el SDK Retell acepta firma válida y rechaza cuerpo alterado o timestamp antiguo", async () => {
    const body = '{"event":"call_ended"}',
      key = "test-only-key";
    const signature = await Retell.sign(body, key);
    expect(await Retell.verify(body, key, signature)).toBe(true);
    expect(await Retell.verify(body + " ", key, signature)).toBe(false);
    expect(
      await Retell.verify(body, key, signature.replace(/v=\d+/, "v=1")),
    ).toBe(false);
  });
  it("no reintenta solicitudes fallidas de contacto", async () => {
    mockLive();
    const fetch = vi
      .fn()
      .mockRejectedValue(
        new Error("Timeout después de aceptación desconocida"),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(startCall(p, product, script, live)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("el contexto de voz no concede autoridad de confirmar una reunión", () => {
    const context = voiceContext(p, product, script);
    expect(context).toContain("No confirmes citas");
    expect(context).toContain("opt_out=true");
    expect(context).toContain("No inventes precios");
  });
});
