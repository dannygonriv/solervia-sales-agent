# Activar llamadas reales

**No se han hecho llamadas reales ni se ha probado una cuenta Retell durante el desarrollo.** El adaptador está implementado; la activación necesita infraestructura y configuración del administrador.

1. Desplegar de forma autorizada la aplicación y PostgreSQL, aplicar migraciones y activar un scheduler cloud. Completar primero el flujo en demo.
2. Revisar las obligaciones aplicables, términos del proveedor, uso de IA, tratamiento de datos y base válida por destinatario. La presencia de un teléfono en DENUE no basta. Registrar en la ficha evidencia, canal permitido y vigencia. Revisar REPEP cuando corresponda; la aplicación no consulta ni certifica ese registro automáticamente.
3. Crear un agente Retell con español de México, voz apropiada y objetivo de conversación exploratoria. Incorporar **`{{sales_context}}`** al prompt del agente. Se envían también `{{company_name}}` y `{{product_name}}`. No habilitar herramientas arbitrarias ni instrucciones que autoricen precios o acciones fuera del catálogo.
4. Configurar en Retell el agente como asistente virtual de Solervia, permiso inicial, salida respetuosa ante rechazo, prohibición de inventar precios o promesas y ofrecimiento de seguimiento humano. Una reunión sólo se propone: no se confirma durante la llamada.
5. Configurar el análisis posterior con estas claves en `custom_analysis_data`: `opt_out` (boolean), `interest` (texto; usar `interested` si hubo interés), `objections` (texto), `next_action` (texto). El resumen usa `call_summary`. Una baja bloquea al prospecto y sus destinos globalmente. El SDK verifica la firma y su ventana de tiempo.
6. Asociar un número autorizado y compatible con llamadas a México. Si se usa Twilio, conectarlo a Retell según sus instrucciones y permisos. Este proyecto no compra números ni habilita planes.
7. Configurar `RETELL_API_KEY`, `RETELL_AGENT_ID`, `RETELL_FROM_NUMBER` en E.164, y el webhook HTTPS `POST /api/webhooks/retell` para eventos de llamada y análisis. Se usa la API key del proveedor para validar `x-retell-signature` sobre el cuerpo exacto.
8. **Mantener grabaciones deshabilitadas.** El adaptador fuerza `data_storage_setting=basic_attributes_only`; no guarda URLs de audio. Confirmar en la cuenta las condiciones efectivas de retención y entrega de transcripciones vía webhook antes de usar datos reales. El sistema no incluye activación de grabaciones.
9. Revisar de extremo a extremo el agente en el entorno de pruebas autorizado del proveedor. Sólo después marcar `RETELL_AGENT_REVIEWED=true` y `COMPLIANCE_REVIEWED=true`. Estos flags son constancias del administrador, no verificaciones automáticas.
10. Configurar precio estimado por minuto, duración máxima por guion, presupuesto y límites diarios. Configurar límites adicionales de gasto y destino en el proveedor; los topes de esta aplicación son reservas estimadas y no sustituyen el control de facturación del proveedor.
11. Cuando se autorice operar, establecer `LIVE_ACTIONS_ENABLED=true`, elegir Producción en la aplicación, registrar prospectos reales y aprobar cada canal. Crear/revisar/iniciar una campaña de bajo volumen.
12. Verificar un primer contacto **expresamente autorizado**, su recepción en Retell, webhook, transcripción, resumen, costo y exclusión. Esta comprobación con credenciales y destinatario autorizado es pendiente de puesta en marcha, no parte de los resultados verificados de la entrega.

## Comportamiento ante fallos

- Falta de clave, número, revisión, permiso, presupuesto o horario: no se solicita la llamada.
- Estado No contactar, baja o exclusión: no se solicita la llamada.
- Cambio de destino después de la revisión: detiene el intento.
- Timeout, pérdida de respuesta o caída luego de una reserva: intento incierto, sin reintento automático. El administrador debe reconciliarlo en Retell antes de cualquier nuevo contacto.
- Parada de emergencia: pausa campañas y bloquea nuevos contactos; una llamada ya aceptada por el proveedor puede seguir. Usar los controles del proveedor para detener una llamada en curso si corresponde.

Referencia: [crear llamadas en Retell](https://docs.retellai.com/api-references/create-phone-call), [verificar firmas](https://docs.retellai.com/features/secure-webhook).
