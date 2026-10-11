# Solervia Sales Agent — instrucciones de trabajo

- Mantener el repositorio privado y no publicar/desplegar ni contactar personas sin autorización explícita del usuario.
- No realizar llamadas, correos, mensajes de Telegram ni llamadas pagadas a IA durante el desarrollo. Usar fixtures y proveedores simulados. Una clave configurada no es permiso para usarla.
- No inventar empresas, funcionalidades, clientes ni precios en producción. Marcar siempre datos simulados y separar métricas por modo.
- Todo acceso comercial a la API requiere sesión de administrador. Las excepciones son health, login, webhooks firmados, cron con secreto y baja con token firmado.
- Los proveedores sólo viven en `src/lib/providers`. Nunca importar secretos en componentes ni usar NEXT_PUBLIC para claves privadas.
- Toda operación de contacto debe pasar por elegibilidad y reserva atómica de presupuesto antes del proveedor. Un resultado ambiguo se revisa manualmente; no se reintenta a ciegas.
- Usar consultas parametrizadas. Mantener RLS y esquema privado. No agregar acceso anónimo a tablas.
- Preservar `.env.local` y `.data`. Pruebas sólo en bases aisladas. No ejecutar un worker PGlite separado contra el archivo de una aplicación abierta.
- Cambios de esquema: generar archivo con `supabase migration new <nombre>`. No editar una migración ya desplegada.
- Validación requerida: typecheck, lint, pruebas, build. Al cambiar flujos de usuario ejecutar también Playwright. Registrar claramente qué proveedores no pudieron verificarse con credenciales.
- Mantener documentación de activación, costos y límites. El estado de un proveedor configurado no equivale a una conexión verificada.
