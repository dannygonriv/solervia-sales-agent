# Verificación de la entrega

Comprobación local realizada el 10 de octubre de 2026, en la zona horaria America/Mexico_City.

## Resultados ejecutados

| Comprobación                                 | Resultado                                             |
| -------------------------------------------- | ----------------------------------------------------- |
| Instalación con versiones fijadas y lockfile | Completada                                            |
| `npm run typecheck`                          | Pasa, TypeScript estricto                             |
| `npm run lint`                               | Pasa, sin errores ni advertencias de código           |
| `npm run test`                               | 34 pruebas aprobadas en 2 archivos                    |
| `npm run build`                              | Build optimizado de Next.js 16.4.0 correcto           |
| `npm run test:e2e`                           | 1 recorrido integral de Chromium aprobado             |
| `npm audit`                                  | 0 vulnerabilidades                                    |
| Migraciones locales                          | Aplicadas a PostgreSQL embebido persistente           |
| Capturas escritorio y móvil                  | Generadas por Playwright e inspeccionadas visualmente |

El recorrido de navegador usa el build de producción en localhost y una base aislada. Crea producto y guion por formularios, busca y registra una empresa demo, califica, edita una nota y verifica que persiste tras recarga, aprueba/encola correo, crea/inicia una campaña de llamada, ejecuta la cola, consulta transcripción, procesa webhook simulado, confirma envío simulado y propone/confirma una reunión. Recorre las diez secciones, registra errores JavaScript y comprueba ausencia de desbordamiento horizontal en un viewport de 390 px.

Capturas: [dashboard vacío](screenshots/dashboard-empty.png), [dashboard tras el flujo demo](screenshots/dashboard-demo.png), [móvil](screenshots/dashboard-mobile.png). Los datos visibles de estas capturas son ficticios, creados por la prueba y separados de la base local del administrador.

## Instancia local entregada

El servidor quedó en `http://127.0.0.1:3000`, ejecutando el build de producción con modo demo. Se comprobó en un proceso distinto al migrador: health 200, login 200 con la contraseña local generada, lectura de estado 200 y logout 200. La base del administrador contiene cero prospectos; los datos de las pruebas viven en bases separadas. `.env.local` y `.data/demo-login.txt` tienen permisos 0600 y están ignorados por Git.

## Pruebas de comportamiento

- Contraseña scrypt, tokens HMAC, cifrado de credenciales y revocación de sesión.
- API privada sin sesión, escritura de origen ajeno y cron sin secreto rechazados.
- Firma Retell inválida, cuerpo modificado y timestamp antiguo rechazados; firma válida aceptada por el SDK.
- RLS habilitado en todas las tablas del esquema privado.
- Duplicados concurrentes de empresa y protección contra fórmulas CSV.
- Calificación demo con hipótesis, sin tráfico de red.
- Llamada demo persistida con transcripción y costo cero; reejecución sin duplicar.
- Correos sujetos a aprobación; simulación sin red.
- Exclusión después de aprobar una campaña y parada de emergencia.
- Pausa/reanudación sin duplicados; dos workers concurrentes sin repetir una llamada.
- Reservas concurrentes de presupuesto, presupuesto insuficiente y cooldown entre campañas.
- Cambio de modo sin convertir trabajos demo en contactos reales.
- Recuperación de contacto interrumpido como incierto, sin reintento automático.
- Permiso/destino editado y relectura de autorización al reservar.
- Webhook demo idempotente y solicitud de baja global.
- Conflictos de reuniones, bloqueo de confirmación concurrente y propuesta real sin Google conectado.
- Búsqueda programada persistente e idempotente.
- Contratos Retell, Resend y Telegram usando exclusivamente transporte HTTP simulado; Retell recibe el contexto, duración máxima y política sin almacenamiento de audio.
- Adaptadores demo sin red incluso con variables de proveedor configuradas; solicitud fallida de contacto no se reintenta.

## Problemas encontrados y corregidos

Etiquetas ambiguas de selectores en formularios, selectores de navegación de la prueba, una transición del menú capturada a mitad del cambio de tamaño, revisión de destino/borrador inmediatamente antes del envío, verificación asíncrona de firma, aislamiento de la base en memoria, prevención de confirmación simultánea y una dependencia transitoria vulnerable del antiguo paquete de lint. Ninguno de esos problemas permanece en la validación final.

El runner imprime un aviso de color de terminal (`NO_COLOR`/`FORCE_COLOR`); no es un error de la aplicación.

## No verificado / limitaciones explícitas

- No se consultó DENUE con un token real ni se ejecutó un modelo OpenAI con credenciales.
- No se realizaron llamadas Retell/Twilio, correos Resend, notificaciones Telegram ni eventos Google reales.
- No se configuraron proyecto Supabase cloud, dominio, despliegue Vercel ni scheduler remoto.
- No se certifican permisos, RLS, TLS, backups ni disponibilidad de la instancia remota hasta configurarla y verificarla.
- La confirmación de agenda es humana; el agente propone horarios y no agenda autónomamente durante la llamada.
- Respuestas de correo se registran manualmente; no hay sincronización automática de buzón.
- Las grabaciones permanecen deshabilitadas. No hay interfaz para activarlas ni almacenamiento de audio.
- La revisión legal, REPEP y condiciones de proveedores es externa al software; los flags no certifican cumplimiento.
- No se validó la aplicación bajo carga empresarial ni con otros navegadores. El alcance inicial es un administrador y volumen reducido.

No se confunden pruebas de contrato con verificación en cuentas reales. Las guías de despliegue y activación describen exactamente qué queda por configurar.
