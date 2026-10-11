import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { passwordHash } from "../src/lib/security";
if (existsSync(".env.local")) {
  console.log(".env.local ya existe; no se modificó.");
  process.exit(0);
}
const password = randomBytes(15).toString("base64url");
mkdirSync(".data", { recursive: true, mode: 0o700 });
writeFileSync(
  ".env.local",
  `APP_URL=http://127.0.0.1:3000\nAPP_ENV=local\nADMIN_EMAIL=admin@solervia.local\nADMIN_PASSWORD_HASH=${passwordHash(password)}\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nTOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nCRON_SECRET=${randomBytes(32).toString("hex")}\nLIVE_ACTIONS_ENABLED=false\nCOMPLIANCE_REVIEWED=false\n`,
  { mode: 0o600 },
);
writeFileSync(
  ".data/demo-login.txt",
  `Acceso local a Solervia Sales Agent\nCorreo: admin@solervia.local\nContraseña: ${password}\n`,
  { mode: 0o600 },
);
console.log(
  "Configuración local creada. Credenciales privadas en .data/demo-login.txt. Inicia con npm run dev.",
);
