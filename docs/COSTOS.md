# Costos y límites

La aplicación usa importes en **USD**. Los valores iniciales son parámetros de demostración, no tarifas contractuales ni precios vigentes: 0.25 por minuto de llamada, 0.01 por correo y 0.05 de reserva por solicitud de IA. El administrador debe ajustarlos a sus proveedores antes de producción.

- Voz: reserva `ceil(duración_máxima_segundos / 60) × costo_por_minuto`. Retell puede devolver `combined_cost` en centavos; el webhook lo convierte a USD. Se conserva como mínimo el mayor entre reserva y costo recibido para evaluar topes.
- Correo: una reserva por envío al proveedor. No se cobra ni contabiliza como cargo real una simulación.
- IA: reserva conservadora por operación y `max_output_tokens` acotado. El costo mostrado para IA en producción es esa **estimación**, no conciliación de la factura ni cálculo de tokens de entrada/salida con una tarifa oficial.
- Google/Telegram: dependen de cuotas y condiciones de las cuentas. La aplicación no compra servicios.
- Supabase/Vercel: costos de plan, almacenamiento, backups y funciones según el entorno elegido. No se afirma disponibilidad gratuita ilimitada.
- Twilio: puede añadir renta de número y telefonía según conexión con Retell; cotejar para evitar contar dos veces o subestimar costos.

`operations` persiste reservas y resultados. El presupuesto diario se calcula en la zona horaria configurada; el tope de campaña considera sus contactos y reservas. El usuario no puede evadir un límite con workers concurrentes. Un resultado incierto conserva su reserva y requiere revisión, en lugar de liberar gasto y arriesgar otro contacto.

El simulador utiliza los límites para probar bloqueos, pero los registros de llamadas/correos/IA demo tienen costo real cero. No se mezclan con indicadores de producción.

Los límites internos no garantizan un tope absoluto de factura: puede haber diferencias de tarifa, cargos fijos, impuestos y reportes tardíos. Configurar también los controles de gasto del proveedor. El botón de emergencia bloquea trabajo nuevo, no revierte cargos ya generados.
