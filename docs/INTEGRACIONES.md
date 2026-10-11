# Configuración de APIs

Todos los adaptadores se ejecutan en el servidor. Las credenciales se inyectan desde `.env.local` o el gestor de secretos del despliegue. Configuración muestra su presencia sin revelar sus valores. **Ningún proveedor real fue verificado con credenciales de una cuenta.**

| Servicio              | Variables                                                                                            | Preparación externa                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| PostgreSQL / Supabase | `DATABASE_URL`                                                                                       | Conexión de backend, migraciones, TLS, backups                                                               |
| INEGI DENUE           | `DENUE_TOKEN`                                                                                        | Token del INEGI; consulta oficial `BuscarEntidad`                                                            |
| OpenAI                | `OPENAI_API_KEY`, `OPENAI_MODEL`                                                                     | Proyecto API con límites; modelo compatible con Responses y structured outputs; valor inicial `gpt-4.1-mini` |
| Retell                | `RETELL_API_KEY`, `RETELL_AGENT_ID`, `RETELL_FROM_NUMBER`, `RETELL_AGENT_REVIEWED`                   | Agente en español de México y número autorizado                                                              |
| Resend                | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_PROVIDER_APPROVED` | Dominio remitente validado, política de envío y buzón de respuestas                                          |
| Google                | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CALENDAR_ID`              | Proyecto Google Cloud, Calendar API, pantalla OAuth, usuario permitido                                       |
| Telegram              | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`                                                             | Bot privado y chat del administrador                                                                         |

## DENUE

El adaptador consulta `https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarEntidad/...` con 50 registros por página. `14` es Jalisco. El filtro de palabra clave y entidad llega a DENUE; municipio, ciudad, actividad, sector y tamaño se filtran en el lote recibido. Avanzar página puede revelar más coincidencias. No se promete exhaustividad ni extracción de datos inexistentes. Campos faltantes se convierten en null. La fuente y el ID del INEGI permiten detectar duplicados.

El modo demo devuelve tres empresas ficticias con dominios `example.invalid`. No contiene teléfonos reales. La búsqueda programada registra resultados y omite duplicados; el procesamiento comercial posterior conserva revisión humana.

## OpenAI

Se usa Responses API con `store:false`, salida Zod estructurada, límite de tokens y sin reintentos automáticos. El contexto incluye sólo datos comerciales necesarios y el catálogo. No usa navegación automática. Las necesidades son hipótesis. Los borradores nunca se envían por el modelo.

En modo demo, la calificación usa reglas transparentes y los correos la plantilla editable. Las reservas USD por solicitud se configuran en Operación: son estimaciones conservadoras, no tarifas oficiales. Configurar límites de gasto del proyecto del proveedor antes de activarlo.

## Retell / Twilio

Ver [LLAMADAS_REALES.md](LLAMADAS_REALES.md). Twilio es opcional como proveedor del número conectado a Retell; la aplicación no necesita otra clave Twilio cuando Retell administra la llamada. El webhook es `POST /api/webhooks/retell`, firmado con `x-retell-signature` y verificado con el SDK oficial sobre el cuerpo exacto. Se procesan `call_started`, `call_ended` y `call_analyzed`; duplicados no producen otra interacción.

## Correo con Resend

Configurar un remitente de dominio verificado, un buzón `EMAIL_REPLY_TO` y revisar si la política del proveedor permite el caso comercial. No usar una cuenta personal para envíos masivos. El adaptador añade identidad, aviso y enlace de baja. Usa la clave de operación como `Idempotency-Key`.

Webhook `POST /api/webhooks/email`: firma Svix (`svix-id`, `svix-timestamp`, `svix-signature`), entrega, rebote y queja. Rebotes y quejas generan exclusión. El enlace de baja firmado pide confirmación por POST; abrirlo por GET no da de baja automáticamente por un escáner de correo. No se anuncia RFC 8058 one-click porque se usa confirmación humana.

**Respuestas entrantes:** se reciben en el buzón Reply-To y se registran desde Correos → Registrar respuesta / baja. No se implementa sincronización IMAP, Gmail ni recepción automática de cuerpos en esta entrega. El webhook sólo actualiza estados de correos que la aplicación reconoce.

## Google Calendar OAuth

1. Activar Calendar API y configurar credenciales de aplicación web.
2. Registrar la URI exacta `https://TU_DOMINIO/api/oauth/google/callback`. Para local: `http://127.0.0.1:3000/api/oauth/google/callback`.
3. Añadir el administrador como usuario de prueba si la pantalla OAuth está en pruebas; revisar requisitos de publicación y vigencia del refresh token en Google.
4. En Configuración → Integraciones → Conectar con Google, autorizar los scopes `calendar.events` y `calendar.freebusy`.
5. El callback verifica sesión, state con caducidad y PKCE. El refresh token se guarda cifrado en `ssa.integrations`; nunca se devuelve al navegador.
6. La confirmación comprueba conflictos locales y free/busy remoto, y crea un evento con ID estable. `sendUpdates=none`: no se envían invitaciones a terceros. Una propuesta sin Google conectado no se marca como confirmada.

En demo, confirmar sólo crea un estado local “Confirmación simulada”. El agente de voz no puede confirmar eventos por su cuenta.

## Telegram

Configurar bot y chat privado; habilitar los tipos deseados en Contacto responsable. Cada evento entra a la cola. El botón de prueba **prepara una notificación**, que se procesa desde Actividad o cron. En demo se marca simulada y jamás llama a Telegram. Producción requiere habilitación global de operaciones reales.

## Referencias oficiales

- [API DENUE](https://www.inegi.org.mx/servicios/api_denue.html)
- [OpenAI: salidas estructuradas](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [Retell: crear llamada](https://docs.retellai.com/api-references/create-phone-call), [firmas](https://docs.retellai.com/features/secure-webhook)
- [Resend: enviar](https://resend.com/docs/api-reference/emails/send-email), [webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests)
- [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)
- [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage)
