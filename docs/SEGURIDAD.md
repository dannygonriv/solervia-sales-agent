# Seguridad y contacto responsable

## Acceso y secretos

Administrador único sin registro público. La contraseña se almacena mediante scrypt con salt aleatorio. Una sesión tiene 256 bits aleatorios, hash en la base, caducidad de ocho horas, HttpOnly y SameSite=Lax; en cloud exige Secure mediante APP_ENV=production. Cerrar sesión revoca el registro servidor. Los formularios y las operaciones de escritura exigen un Origin igual a APP_URL. El login tiene límites globales y por identificador; la API tiene límite por administrador, todos persistidos en PostgreSQL.

Nunca poner claves en NEXT_PUBLIC, Git, capturas o logs. `.env*` y `.data` están excluidos de Git. Google refresh tokens se cifran con AES-256-GCM y `TOKEN_ENCRYPTION_KEY`; el esquema privado tiene RLS y no expone tablas por la Data API. Proteger acceso al proyecto Supabase/Vercel y restringir quién conoce DATABASE_URL. Los secretos de cron y baja se comparan/validan criptográficamente.

La autorización de la aplicación no depende de metadatos editables de un usuario. Todos los IDs, textos, estados y límites se validan con Zod; SQL usa parámetros. Los nombres de tablas dinámicos se limitan a products/scripts y las columnas proceden de esquemas cerrados. CSV neutraliza fórmulas. React escapa el contenido comercial. No existe un fetch a URLs arbitrarias aportadas por prospectos.

## Rotación de acceso

El alta inicial usa ADMIN_EMAIL y ADMIN_PASSWORD_HASH sólo cuando el administrador aún no existe. Para cambiar una contraseña existente:

1. Generar un nuevo hash scrypt compatible usando `passwordHash` de `src/lib/security.ts` desde un entorno privado. No enviar la contraseña en argumentos públicos ni versionarla.
2. Desde una conexión administrativa segura, actualizar `ssa.users.password_hash` con parámetros para el email exacto.
3. Revocar sus filas de `ssa.sessions` y actualizar el secreto de despliegue para futuras instalaciones. La app no ofrece recuperación por correo ni altas adicionales.
4. Para rotar la clave de Google, desconectar/revocar el grant y volver a autorizar con la nueva TOKEN_ENCRYPTION_KEY. Cambiar esa clave sin volver a autorizar hace ilegibles los tokens previos.

## Controles comerciales

- Origen de datos y fecha de consulta por empresa. No se afirma haber investigado un sitio web sólo porque existe su URL.
- Autorización independiente para correo y llamada, base, evidencia, fecha y vigencia; cada cambio deja `consent_history`.
- La edición de correo/teléfono revoca automáticamente el permiso del canal modificado.
- Estados comerciales y exclusión global. Los rechazos y bajas no se convierten en autorización por cambiar de campaña.
- Revisión humana de cada correo y revisión al iniciar una campaña. Editar un borrador revoca su aprobación; no se modifica un correo cuyo envío ya fue reclamado.
- Reserva atómica de gasto e intentos. La identidad del destino se revisa otra vez antes del proveedor. La fila global de settings serializa reservas concurrentes.
- Separación demo/producción. Los datos ficticios no se convierten a reales al cambiar modo.
- Webhooks verificados con el SDK Retell y Svix/Resend; deduplicados por evento. Eventos fuera de orden no degradan un análisis final ni revierten una baja.
- No se guardan grabaciones. La retención configurable limpia transcripciones, resúmenes y cuerpos de correo; conserva auditoría, métricas mínimas y exclusiones para evitar recontacto. Las copias del proveedor y backups requieren su propia política.

## Marco de revisión en México

Esta aplicación implementa controles técnicos, **no emite una conclusión jurídica sobre cada destinatario ni acredita cumplimiento por sí sola**. El administrador debe revisar finalidad, datos personales involucrados, avisos, derechos de los titulares, base de tratamiento, condiciones de contacto y transferencias a proveedores. El campo de evidencia debe apuntar a un registro verificable, no sólo decir “es público”.

Antes de activar llamadas comerciales, revisar la normativa aplicable y el REPEP según el destinatario/caso. No hay consulta automática a REPEP en esta versión; no se evade ningún mecanismo de exclusión o antispam. No se reutilizan perfiles personales de LinkedIn ni se realiza scraping.

Referencias oficiales para esa revisión: [LFPDPPP, Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf), [REPEP, información general de Profeco](https://repep.profeco.gob.mx/infogeneral.jsp), [preguntas frecuentes REPEP](https://repep.profeco.gob.mx/preguntasfrecuentes.jsp). Estas referencias orientan la revisión externa; no reemplazan asesoramiento específico cuando sea necesario.

## Pendientes de operación cloud

Credenciales, roles y RLS de la instancia real, backups y restauración, restricciones de proveedor, dominio/remitente, cron, validación del agente y verificación del primer contacto autorizado. No afirmar que el entorno está listo para contacto real hasta completar esas comprobaciones con evidencia.
