-- PLANTILLA DE ACTIVACIÓN MANUAL. NO FORMA PARTE DE LAS MIGRACIONES.
-- Requiere app desplegada y revisión previa del proyecto destino.
-- Habilita pg_cron, pg_net y Vault en el proyecto Supabase autorizado.
-- Crea en Vault dos secretos desde el panel: ssa_app_url y ssa_cron_secret.
-- No pegues sus valores en un archivo versionado.
select cron.schedule(
 'solervia-sales-worker',
 '*/5 * * * *',
 $$
 select net.http_get(
   url := (select decrypted_secret from vault.decrypted_secrets where name='ssa_app_url') || '/api/cron',
   headers := jsonb_build_object(
     'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='ssa_cron_secret')
   ),
   timeout_milliseconds := 60000
 );
 $$
);
-- Inspección: select jobid,jobname,schedule,active from cron.job;
-- Desactivar únicamente este trabajo si corresponde:
-- select cron.unschedule('solervia-sales-worker');
