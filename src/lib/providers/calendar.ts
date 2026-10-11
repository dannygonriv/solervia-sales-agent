import { getDB, settings, type DB } from "../db";
import { decrypt, encrypt, AppError } from "../security";
import { assertLive, jsonFetch, requireEnv } from "./index";
import type { Meeting, Prospect } from "../domain";
export function googleRedirect() {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    new URL("/api/oauth/google/callback", process.env.APP_URL).toString()
  );
}
export async function storeGoogleTokens(tokens: Record<string, unknown>) {
  if (typeof tokens.refresh_token !== "string")
    throw new AppError(
      "Google no entregó refresh token. Revoca y reconecta con consentimiento.",
      409,
    );
  await (
    await getDB()
  ).query(
    "insert into ssa.integrations(provider,encrypted_token) values('google',$1) on conflict(provider) do update set encrypted_token=$1,updated_at=now()",
    [encrypt(JSON.stringify(tokens))],
  );
}
export async function googleConnected(db?: DB) {
  return (
    (
      await (db || (await getDB())).query(
        "select provider from ssa.integrations where provider='google' and encrypted_token is not null",
      )
    ).length > 0
  );
}
async function accessToken() {
  requireEnv(
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "TOKEN_ENCRYPTION_KEY",
  );
  const [row] = await (
    await getDB()
  ).query<{ encrypted_token: string }>(
    "select encrypted_token from ssa.integrations where provider='google'",
  );
  if (!row?.encrypted_token)
    throw new AppError("Google Calendar no está conectado.", 409);
  const tokens = JSON.parse(decrypt(row.encrypted_token));
  const result = await jsonFetch<{ access_token: string }>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    },
  );
  return result.access_token;
}
export async function availability(start: string, end: string) {
  const token = await accessToken(),
    id = process.env.GOOGLE_CALENDAR_ID || "primary";
  const result = await jsonFetch<{
    calendars: Record<
      string,
      { busy: { start: string; end: string }[]; errors?: unknown[] }
    >;
  }>("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ timeMin: start, timeMax: end, items: [{ id }] }),
  });
  const cal = result.calendars[id];
  if (!cal || cal.errors?.length)
    throw new AppError("No fue posible verificar disponibilidad.", 502);
  return { available: cal.busy.length === 0, busy: cal.busy };
}
export async function createCalendarEvent(m: Meeting, p: Prospect) {
  assertLive(await settings());
  const token = await accessToken(),
    calendar = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || "primary"),
    eventId = m.id.replaceAll("-", "");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const existing = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendar}/events/${eventId}`,
    { headers, signal: AbortSignal.timeout(20000) },
  );
  if (existing.ok) {
    const result = await existing.json();
    if (result.status === "cancelled")
      throw new AppError("El evento fue cancelado en Google.", 409);
    return result as { id: string };
  }
  if (existing.status !== 404)
    throw new AppError("No se pudo reconciliar el evento de Google.", 502);
  if (!(await availability(m.starts_at, m.ends_at)).available)
    throw new AppError("El horario ya está ocupado.", 409);
  return jsonFetch<{ id: string }>(
    `https://www.googleapis.com/calendar/v3/calendars/${calendar}/events?sendUpdates=none`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: eventId,
        summary: `Solervia · ${p.name}`,
        description: m.summary || "Reunión comercial",
        start: { dateTime: new Date(m.starts_at).toISOString() },
        end: { dateTime: new Date(m.ends_at).toISOString() },
      }),
    },
  );
}
