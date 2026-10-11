# Solervia Sales Agent

Aplicación privada de prospección comercial para un administrador. Next.js 16, React, TypeScript estricto, Tailwind/CSS, PostgreSQL y cola persistente. No hay suscripciones ni organizaciones múltiples.

**El repositorio se entrega en modo demostración.** Ese modo no llama a proveedores externos de IA, voz, correo, calendario o notificaciones. Los indicadores salen de la base de datos del modo seleccionado; no se precargan prospectos ni métricas. Las empresas ficticias sólo se muestran al realizar una búsqueda demo y se guardan cuando el administrador las registra.

## Inicio local

Requiere Node.js 22. `npm run setup` genera una configuración privada sólo si `.env.local` no existe. No modifica servicios de la computadora ni usa Docker.

```bash
npm ci
npm run setup
npm run dev
```

Abrir http://127.0.0.1:3000. Correo y contraseña local generada: **`.data/demo-login.txt`**. No se incluyen en Git. PostgreSQL embebido con PGlite persiste en `.data/postgres`; las migraciones locales se aplican al iniciar. No abras dos procesos de aplicación sobre el mismo directorio PGlite. El worker local se ejecuta desde Actividad o por la API del proceso activo.

Para probar el build:

```bash
npm run build
npm run start
```

Detén `dev` antes de `start`. La contraseña se almacena como scrypt; las sesiones son tokens aleatorios almacenados mediante SHA-256 con caducidad de ocho horas. Cambiar `ADMIN_PASSWORD_HASH` no cambia automáticamente un usuario existente: ver [seguridad](docs/SEGURIDAD.md).

## Recorrido de prueba

1. En **Configuración → Productos**, registra una oferta con descripción verificable. Para llamadas crea un guion.
2. En **Buscar empresas**, deja las palabras clave vacías para consultar las tres empresas ficticias. Registra una.
3. En **Prospectos**, abre la ficha, modifica datos y notas, califica y programa seguimiento. Las hipótesis se distinguen de los datos registrados.
4. Prepara un correo, edítalo y apruébalo en **Correos**. Puedes encolar su simulación individual.
5. Crea una campaña con ese prospecto. Las de correo necesitan preparar y aprobar los borradores de cada miembro. Las de voz necesitan un guion asociado al producto.
6. Revisa e inicia. En **Actividad**, ejecuta trabajos pendientes. Se respetan horarios incluso en demo: para una prueba fuera de horario puedes configurar temporalmente 0–24 en Operación y en la campaña.
7. Consulta la transcripción simulada en **Llamadas** y prueba el evento de análisis. Registra una propuesta en **Calendario** y simula su confirmación.
8. Revisa las estadísticas, activa la parada de emergencia o marca el prospecto como **No contactar** para comprobar los bloqueos.

## Funcionalidades y límites

| Área                | Implementación                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Autenticación       | Administrador único, hash scrypt, sesiones revocables, cookies HttpOnly, SameSite y Secure en producción, control de origen y límites de solicitudes                                       |
| CRM                 | Registro, edición, notas, estados, permisos por canal, historial de consentimientos, duplicados, búsqueda, filtros, orden y CSV protegido contra fórmulas                                  |
| Empresas            | Catálogo ficticio en demo; adaptador DENUE `BuscarEntidad` con paginación y filtros locales por lote; fuente y fecha de consulta                                                           |
| Calificación        | Reglas explícitas en demo; OpenAI Responses con salida estructurada y catálogo autorizado en producción                                                                                    |
| Productos / guiones | Altas y edición desde la interfaz, precios opcionales, preguntas, objeciones, respuestas y duración                                                                                        |
| Campañas            | Borrador, aprobación, inicio, pausa, reanudación, cancelación, topes, exclusiones, horarios, reservas de presupuesto y trabajos idempotentes                                               |
| Correo              | Borrador, edición, aprobación, envío individual/campaña, Resend, baja por enlace, webhooks de entrega/rebote/queja. **Las respuestas se registran manualmente**, no se sincroniza un buzón |
| Voz                 | Retell, contexto de guion/prospecto/producto, límite de duración, webhooks firmados, transcripción, resumen, interés, exclusión y costo. **Sin grabaciones habilitadas**                   |
| Agenda              | Propuestas, OAuth Google, free/busy, comprobación de conflictos, identificador de evento estable y confirmación; sin integración, conserva propuesta                                       |
| Notificaciones      | Bandeja local, preferencias y adaptador Telegram con enlaces a la ficha                                                                                                                    |
| Automatización      | Cola PostgreSQL, bloqueos, recuperación de trabajos, reintentos limitados de tareas internas, búsquedas periódicas, recordatorios de seguimiento y retención de contenido                  |
| Métricas            | Cálculo a partir de registros persistidos, separación demo/producción, costos y reservas en USD                                                                                            |

Las integraciones reales **no han sido probadas contra cuentas externas**. La configuración, las credenciales, el despliegue cloud y la aceptación de las condiciones de cada proveedor son pendientes de activación. No se realizaron llamadas, envíos, compras ni publicaciones durante el desarrollo.

Un agente de voz propone una reunión; el administrador confirma después de verificar Google Calendar. No hay confirmación autónoma desde una llamada. Retell/Twilio se configuran en el proveedor; no se compra ni aprovisiona un número desde esta aplicación. No se implementa scraping ni extracción de perfiles personales.

## Verificación

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

Vitest usa una base PostgreSQL en memoria. Playwright levanta el build en `127.0.0.1:3100` con una base aislada `.data/e2e-*`, credenciales de prueba y proveedores reales deshabilitados. No borra la base local del administrador. Capturas verificables en `docs/screenshots/`. Resultados y alcance de la comprobación en [VERIFICACION.md](docs/VERIFICACION.md).

## Cloud y APIs

- [Arquitectura y decisiones](docs/ARQUITECTURA.md)
- [Despliegue en Vercel + Supabase](docs/DESPLIEGUE.md)
- [Configuración de integraciones](docs/INTEGRACIONES.md)
- [Activación de llamadas](docs/LLAMADAS_REALES.md)
- [Seguridad, privacidad y contacto responsable](docs/SEGURIDAD.md)
- [Costos variables](docs/COSTOS.md)
- [Variables de entorno](.env.example)

En cloud, `DATABASE_URL` es obligatoria; nunca se cae silenciosamente a archivos temporales. Las claves se cargan sólo en el servidor, y el esquema `ssa` no se expone por la Data API de Supabase.
