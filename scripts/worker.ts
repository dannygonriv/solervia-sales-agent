import { runWorker } from "../src/lib/services/worker";
runWorker(20)
  .then((result) => {
    console.log(JSON.stringify(result));
    process.exit(0);
  })
  .catch(() => {
    console.error("Error del worker. Revisa configuración y audit_logs.");
    process.exit(1);
  });
