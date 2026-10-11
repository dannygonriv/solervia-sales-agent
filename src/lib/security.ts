import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { getDB } from "./db";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function passwordHash(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, encoded] = stored.split(":");
  if (!salt || !encoded) return false;
  const candidate = Buffer.from(
      passwordHash(password, salt).split(":")[1],
      "hex",
    ),
    expected = Buffer.from(encoded, "hex");
  return (
    expected.length === candidate.length && timingSafeEqual(candidate, expected)
  );
}
export function same(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32)
    throw new AppError(
      "Ejecuta npm run setup o configura SESSION_SECRET.",
      503,
    );
  return s;
}
export function signed(value: string) {
  return `${value}.${createHmac("sha256", secret()).update(value).digest("base64url")}`;
}
export function verifySigned(token: string) {
  const i = token.lastIndexOf(".");
  const value = token.slice(0, i);
  if (i < 0 || !same(token, signed(value)))
    throw new AppError("Enlace inválido.", 401);
  return value;
}
export function encrypt(value: string) {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || "", "hex");
  if (key.length !== 32)
    throw new AppError("Configura TOKEN_ENCRYPTION_KEY.", 503);
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv),
    data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((v) => v.toString("base64url"))
    .join(".");
}
export function decrypt(value: string) {
  const [iv, tag, data] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || "", "hex"),
    iv,
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
export async function rateLimit(key: string, max = 60, seconds = 60) {
  const db = await getDB();
  const [row] = await db.query<{ count: number }>(
    `insert into ssa.rate_limits(key,count,resets_at) values($1,1,now()+$2*interval '1 second') on conflict(key) do update set count=case when ssa.rate_limits.resets_at<now() then 1 else ssa.rate_limits.count+1 end,resets_at=case when ssa.rate_limits.resets_at<now() then now()+$2*interval '1 second' else ssa.rate_limits.resets_at end returning count`,
    [key, seconds],
  );
  if (row.count > max)
    throw new AppError("Demasiadas solicitudes. Intenta más tarde.", 429);
}
export function assertOrigin(request: Request) {
  const expected = new URL(process.env.APP_URL || "http://127.0.0.1:3000")
    .origin;
  if (request.headers.get("origin") !== expected)
    throw new AppError("Origen no autorizado.", 403);
}
export function cookieValue(request: Request, name: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export async function session(request: Request) {
  const token = cookieValue(request, "ssa_session");
  if (!token) throw new AppError("Inicia sesión.", 401);
  const [user] = await (
    await getDB()
  ).query<{ id: string; email: string }>(
    "select u.id,u.email from ssa.sessions s join ssa.users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()",
    [hash(token)],
  );
  if (!user) throw new AppError("Tu sesión expiró.", 401);
  return user;
}
export const cookieOptions = () =>
  `Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${process.env.APP_ENV === "production" ? "; Secure" : ""}`;
export function normalizeContact(v: string) {
  return v.includes("@") ? v.trim().toLowerCase() : v.replace(/[^\d+]/g, "");
}
export function safeCSV(values: unknown[][]) {
  return (
    "\uFEFF" +
    values
      .map((row) =>
        row
          .map((v) => {
            let s = String(v ?? "");
            if (/^[=+\-@\t\r\n]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
