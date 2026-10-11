import { getDB, migrate } from "../src/lib/db";
await migrate(await getDB());
console.log("Migraciones aplicadas.");
process.exit(0);
