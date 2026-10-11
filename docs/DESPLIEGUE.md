# Despliegue privado en Vercel + Supabase

No se creó ningún recurso externo ni despliegue durante esta entrega. Estos pasos son para cuando el administrador autorice publicarlo.

## Base de datos

1. Crear o elegir un proyecto Supabase. No añadir `ssa` a los esquemas expuestos por la Data API.
2. Obtener una conexión PostgreSQL de backend (pooler de transacciones compatible; `prepare:false` ya está configurado). Mantener el certificado TLS validado; no desactivar `rejectUnauthorized`.
3. Configurar `DATABASE_URL` en un archivo local privado de despliegue o entorno seguro. Copiar las otras variables de `.env.example` a `.env.local`, sin sobrescribir credenciales existentes.
4. Ejecutar `npm run db:migrate` con esa conexión. Aplica las migraciones pendientes y crea el administrador inicial de `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` si no existe. La aplicación cloud no migra automáticamente.
5. Comprobar tablas en `ssa`, restricciones y RLS. El usuario SQL del backend debe ser propietario/autorizado; los roles de navegador no reciben acceso.

La implementación usa autenticación propia de administrador. No requiere activar Supabase Auth ni publicar una `service_role` key. Configurar backups en Supabase según el plan; verificar restauración antes de guardar datos reales.

## Aplicación

1. Importar este repositorio en un proyecto Vercel **sólo después de autorización de publicación**. Framework Next.js, Node.js 22, build `npm run build`.
2. Variables obligatorias: `APP_ENV=production`, `APP_URL=https://dominio-definitivo`, `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`.
3. Usar secretos nuevos para cloud. `npm run setup` genera claves hex y un hash scrypt para desarrollo; no reutilizar ese archivo como archivo público. Una clave de cifrado debe tener 64 caracteres hexadecimales; `SESSION_SECRET` al menos 32 caracteres.
4. Mantener `LIVE_ACTIONS_ENABLED=false` y `COMPLIANCE_REVIEWED=false`. Empezar en modo demo incluso en cloud y verificar el flujo.
5. Configurar los proveedores opcionales. Google necesita una URI de retorno exacta de ese dominio; Retell y Resend necesitan webhooks HTTPS.
6. Desplegar con la configuración de Vercel. El archivo `vercel.json` sólo define el framework; no activa campañas ni crea cron jobs.
7. Probar login, persistencia después de un nuevo despliegue, rechazo de API anónima, origen ajeno, firma inválida, demo sin proveedores y sesión cerrada.
8. Si se usan previews, configurar APP_URL y OAuth para cada entorno de forma explícita; no conectar una preview a datos/credenciales de producción.

## Trabajo programado que no depende de la Mac

La cola queda en Supabase. Un scheduler cloud debe invocar:

```http
GET https://TU_DOMINIO/api/cron
Authorization: Bearer TU_CRON_SECRET
```

La respuesta contiene `processed` y `stopped`; repetir cada 5 minutos para un volumen inicial reducido. La duración de una petición es acotada; la cola conserva lo pendiente. No usar un `setInterval` dentro de una función serverless.

Opción de bajo costo: extensiones **pg_cron + pg_net** de Supabase, con APP_URL y CRON_SECRET en **Vault**. El archivo [cloud-scheduler.sql](cloud-scheduler.sql) es una plantilla explícita, separada de las migraciones. Revisarla y ejecutarla sólo en el proyecto autorizado, una vez desplegada la app y guardados los dos secretos. No contiene secretos reales. También puede usarse Vercel Cron si la frecuencia permitida por el plan es suficiente; revisar sus límites vigentes antes de elegirlo.

Monitorear el resultado HTTP de pg_net, los fallos del cron y `automation_jobs`. Una llamada de cron rechazada por autenticación no genera un trabajo. Una interrupción durante una comunicación deja el intento pendiente de revisión.

## Operación y recuperación

- **Emergencia**: botón “Detener campañas”. Pausa campañas y evita nuevas reservas. No promete deshacer una comunicación ya aceptada por el proveedor.
- **Reanudar**: desactivar emergencia en Configuración y reanudar las campañas revisadas individualmente.
- **Job incierto**: consultar el proveedor por hora/destino y correlación, registrar el resultado en una revisión administrativa; no cambiar el estado a queued sin confirmar que nunca se contactó.
- **Rotación de contraseña**: seguir `SEGURIDAD.md`; revocar sesiones.
- **Retención**: cada ejecución limpia transcripciones, resúmenes y cuerpos antiguos según `retention_days`; no borra el registro mínimo de exclusión ni auditoría automáticamente.
- **PGlite**: respaldo sólo con el proceso local detenido. En cloud utilizar exclusivamente PostgreSQL remoto.

Fuentes oficiales: [programación con Supabase](https://supabase.com/docs/guides/functions/schedule-functions), [límites de Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [conexiones PostgreSQL de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).
