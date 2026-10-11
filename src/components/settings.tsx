"use client";
import { useState } from "react";
import {
  ShieldCheck,
  Plug,
  Package,
  FileText,
  SlidersHorizontal,
} from "lucide-react";
import type { AppState, Product, Script } from "@/lib/domain";
import {
  api,
  AddButton,
  Badge,
  Empty,
  Form,
  Modal,
  PageTitle,
  Panel,
  type Field,
  type Run,
} from "./ui";
const productFields: Field[] = [
  { name: "name", label: "Nombre", required: true },
  {
    name: "line",
    label: "Línea de negocio",
    type: "select",
    required: true,
    options: [
      { value: "Products", label: "Solervia Products" },
      { value: "Custom", label: "Solervia Custom" },
    ],
  },
  {
    name: "description",
    label: "Descripción y funciones verificadas",
    type: "textarea",
    required: true,
  },
  {
    name: "price",
    label: "Precio autorizado",
    hint: "Déjalo vacío si requiere cotización.",
  },
  { name: "active", label: "Producto activo", type: "checkbox" },
];
const scriptFields: Field[] = [
  { name: "name", label: "Nombre del guion", required: true },
  { name: "audience", label: "Público objetivo", required: true },
  {
    name: "opening",
    label: "Presentación (debe identificar al asistente como IA)",
    type: "textarea",
    required: true,
  },
  {
    name: "value_proposition",
    label: "Propuesta de valor",
    type: "textarea",
    required: true,
  },
  {
    name: "questions",
    label: "Preguntas de calificación",
    type: "textarea",
    required: true,
  },
  { name: "objections", label: "Objeciones frecuentes", type: "textarea" },
  {
    name: "allowed_answers",
    label: "Respuestas autorizadas",
    type: "textarea",
    required: true,
  },
  { name: "goal", label: "Objetivo de la conversación", required: true },
  {
    name: "max_seconds",
    label: "Duración máxima (segundos)",
    type: "number",
    min: 30,
    max: 600,
    required: true,
  },
  {
    name: "end_conditions",
    label: "Condiciones para terminar",
    type: "textarea",
    required: true,
  },
];
export function SettingsPage({ data, run }: { data: AppState; run: Run }) {
  const [tab, setTab] = useState("general"),
    [product, setProduct] = useState<Product | "new" | null>(null),
    [script, setScript] = useState<Script | "new" | null>(null);
  const s = data.settings;
  return (
    <>
      <PageTitle
        title="Configuración"
        description="Tu oferta, tus límites y las herramientas que conectan tu operación."
      />
      <div className="tabs">
        {[
          { id: "general", label: "Operación", icon: SlidersHorizontal },
          { id: "products", label: "Productos", icon: Package },
          { id: "scripts", label: "Guiones", icon: FileText },
          { id: "integrations", label: "Integraciones", icon: Plug },
          { id: "security", label: "Contacto responsable", icon: ShieldCheck },
        ].map((t) => (
          <button
            className={tab === t.id ? "active" : ""}
            key={t.id}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>
      {tab === "general" && (
        <Panel title="Preferencias de operación">
          <div className="detail-block">
            <Form
              fields={[
                {
                  name: "company_name",
                  label: "Nombre de la empresa",
                  required: true,
                },
                {
                  name: "mode",
                  label: "Modo de operación",
                  type: "select",
                  options: [
                    {
                      value: "demo",
                      label: "Demostración · sin comunicaciones reales",
                    },
                    {
                      value: "production",
                      label: "Producción · requiere habilitación del servidor",
                    },
                  ],
                  required: true,
                },
                { name: "city", label: "Ciudad objetivo", required: true },
                { name: "sectors", label: "Sectores objetivo" },
                { name: "timezone", label: "Zona horaria", required: true },
                {
                  name: "daily_budget",
                  label: "Presupuesto diario USD",
                  type: "number",
                  step: "0.01",
                  min: 0.01,
                },
                {
                  name: "daily_calls",
                  label: "Llamadas / día",
                  type: "number",
                  min: 0,
                  max: 500,
                },
                {
                  name: "daily_emails",
                  label: "Correos / día",
                  type: "number",
                  min: 0,
                  max: 500,
                },
                {
                  name: "max_attempts",
                  label: "Intentos máximos por contacto y canal",
                  type: "number",
                  min: 1,
                  max: 5,
                },
                {
                  name: "cooldown_hours",
                  label: "Pausa entre contactos (horas)",
                  type: "number",
                  min: 24,
                },
                {
                  name: "start_hour",
                  label: "Hora inicial (0–23)",
                  type: "number",
                  min: 0,
                  max: 23,
                },
                {
                  name: "end_hour",
                  label: "Hora final (1–24)",
                  type: "number",
                  min: 1,
                  max: 24,
                },
                {
                  name: "call_minute_cost",
                  label: "Estimación USD / minuto de llamada",
                  type: "number",
                  min: 0.01,
                  step: "0.01",
                },
                {
                  name: "email_cost",
                  label: "Estimación USD / correo",
                  type: "number",
                  min: 0.001,
                  step: "0.001",
                },
                {
                  name: "ai_request_cap",
                  label: "Reserva USD / solicitud IA",
                  type: "number",
                  min: 0.01,
                  step: "0.01",
                },
                {
                  name: "retention_days",
                  label: "Retención de contenido (días)",
                  type: "number",
                  min: 7,
                  max: 3650,
                },
                {
                  name: "emergency",
                  label: "Parada de emergencia activa",
                  type: "checkbox",
                },
                {
                  name: "email_template",
                  label: "Plantilla inicial para borradores",
                  type: "textarea",
                  hint: "Variables disponibles: {{empresa}} y {{producto}}.",
                },
              ]}
              initial={s}
              onSubmit={async (v) => {
                await api("settings", "PATCH", { ...s, ...v });
                await run(async () => {}, "Preferencias guardadas.");
              }}
            />
          </div>
        </Panel>
      )}
      {tab === "products" && (
        <Panel
          title="Catálogo comercial"
          action={
            <AddButton onClick={() => setProduct("new")}>
              Agregar producto
            </AddButton>
          }
        >
          {data.products.length ? (
            <div className="result-list">
              {data.products.map((p) => (
                <article key={p.id}>
                  <span className="avatar">
                    <Package size={20} />
                  </span>
                  <div>
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                    <small>
                      {p.line} · {p.price || "Precio por definir"} ·{" "}
                      {p.active ? "Activo" : "Inactivo"}
                    </small>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => setProduct(p)}
                  >
                    Editar
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Define lo que Solervia puede ofrecer"
              detail="Agrega únicamente productos, funciones y precios autorizados. La IA utilizará este catálogo como referencia."
            />
          )}
        </Panel>
      )}
      {tab === "scripts" && (
        <Panel
          title="Guiones de conversación"
          action={
            <AddButton onClick={() => setScript("new")}>Crear guion</AddButton>
          }
        >
          {data.scripts.length ? (
            <div className="result-list">
              {data.scripts.map((g) => (
                <article key={g.id}>
                  <span className="avatar">
                    <FileText size={20} />
                  </span>
                  <div>
                    <h3>{g.name}</h3>
                    <p>{g.goal}</p>
                    <small>
                      {g.max_seconds} segundos ·{" "}
                      {data.products.find((p) => p.id === g.product_id)?.name}
                    </small>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => setScript(g)}
                  >
                    Editar
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Prepara una conversación natural"
              detail="Configura preguntas, respuestas autorizadas y condiciones para terminar. El asistente siempre debe identificarse como IA."
            />
          )}
        </Panel>
      )}
      {tab === "integrations" && (
        <>
          <div className="info-banner">
            <ShieldCheck size={20} />
            <p>
              Las credenciales se configuran en variables de entorno del
              servidor. Nunca se envían al navegador ni se guardan en tablas
              públicas. “Configurado” indica presencia de variables, no una
              conexión probada.
            </p>
          </div>
          <div className="integration-grid">
            {data.integrations.map((i) => (
              <article className="panel integration-card" key={i.name}>
                <div className="campaign-top">
                  <Plug size={22} />
                  <Badge tone={i.configured ? "green" : "neutral"}>
                    {i.configured ? "Configurado" : "Pendiente"}
                  </Badge>
                </div>
                <h2>{i.name}</h2>
                <p>{i.detail}</p>
                {i.name === "Google Calendar" && i.configured && (
                  <button
                    onClick={() =>
                      window.location.assign(
                        new URL(
                          "/api/oauth/google/start",
                          window.location.origin,
                        ),
                      )
                    }
                    className="button secondary"
                  >
                    Conectar con Google
                  </button>
                )}
                {i.name === "Telegram" && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      run(
                        () => api("notifications/test"),
                        "Notificación de prueba encolada.",
                      )
                    }
                  >
                    Preparar notificación de prueba
                  </button>
                )}
              </article>
            ))}
          </div>
          <Panel title="Variables necesarias">
            <div className="detail-block">
              <p>
                Consulta <code>.env.example</code> y{" "}
                <code>docs/INTEGRACIONES.md</code> en el repositorio. Para
                producción configura DATABASE_URL, APP_URL, ADMIN_EMAIL,
                ADMIN_PASSWORD_HASH, SESSION_SECRET, TOKEN_ENCRYPTION_KEY y
                CRON_SECRET. Agrega las variables de los proveedores que vayas a
                utilizar.
              </p>
              <p>
                El modo demostración ignora todos los proveedores de
                comunicación, incluso cuando existen credenciales.
              </p>
            </div>
          </Panel>
        </>
      )}
      {tab === "security" && (
        <>
          <Panel title="Identidad y aviso de privacidad">
            <div className="detail-block">
              <Form
                fields={[
                  {
                    name: "sender_identity",
                    label: "Identificación completa del remitente",
                    type: "textarea",
                    hint: "Nombre comercial, responsable y medio de contacto.",
                  },
                  {
                    name: "privacy_notice",
                    label: "Aviso de privacidad (URL o texto)",
                    type: "textarea",
                  },
                ]}
                initial={s}
                onSubmit={async (v) => {
                  await api("settings", "PATCH", { ...s, ...v });
                  await run(async () => {}, "Información guardada.");
                }}
              />
              <h3>Notificaciones de Telegram</h3>
              <div className="checkbox-list">
                {[
                  { id: "priority", label: "Alta prioridad" },
                  { id: "call", label: "Llamada completada" },
                  { id: "interest", label: "Interés y seguimientos" },
                  {
                    id: "meeting",
                    label: "Reuniones propuestas / confirmadas",
                  },
                  { id: "campaign", label: "Campaña finalizada" },
                  { id: "error", label: "Errores importantes" },
                  { id: "budget", label: "Límites de presupuesto" },
                ].map((n) => (
                  <label key={n.id}>
                    <input
                      type="checkbox"
                      checked={s.notification_types.includes(
                        n.id as (typeof s.notification_types)[number],
                      )}
                      onChange={(e) =>
                        run(() =>
                          api("settings", "PATCH", {
                            ...s,
                            notification_types: e.target.checked
                              ? [...s.notification_types, n.id]
                              : s.notification_types.filter((v) => v !== n.id),
                          }),
                        )
                      }
                    />
                    {n.label}
                  </label>
                ))}
              </div>
            </div>
          </Panel>
          <Panel title="Lista de exclusión global">
            {data.suppression.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Identificador o contacto</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.suppression.map((v) => (
                      <tr key={v.id}>
                        <td>{v.value}</td>
                        <td>{v.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="Sin exclusiones registradas"
                detail="Las bajas, las quejas y los contactos marcados No contactar aparecerán aquí y bloquearán futuros envíos."
              />
            )}
          </Panel>
          <div className="info-banner">
            <p>
              Grabaciones deshabilitadas. Se conservan transcripciones y
              resúmenes por {s.retention_days} días. La revisión de la base de
              contacto corresponde al administrador; activar permisos no
              constituye una validación jurídica automática.
            </p>
          </div>
        </>
      )}
      {product && (
        <Modal
          title={product === "new" ? "Agregar producto" : "Editar producto"}
          onClose={() => setProduct(null)}
        >
          <Form
            fields={productFields}
            initial={
              product === "new"
                ? { line: "Custom", active: true }
                : (product as unknown as Record<string, unknown>)
            }
            onSubmit={async (v) => {
              await api(
                product === "new" ? "products" : "products/" + product.id,
                product === "new" ? "POST" : "PATCH",
                v,
              );
              setProduct(null);
              await run(async () => {}, "Producto guardado.");
            }}
          />
        </Modal>
      )}
      {script && (
        <Modal
          title={script === "new" ? "Crear guion" : "Editar guion"}
          onClose={() => setScript(null)}
        >
          <Form
            fields={[
              {
                name: "product_id",
                label: "Producto",
                type: "select",
                required: true,
                options: data.products.map((p) => ({
                  value: p.id,
                  label: p.name,
                })),
              },
              ...scriptFields,
            ]}
            initial={
              script === "new"
                ? {
                    max_seconds: 180,
                    opening:
                      "Hola, soy el asistente virtual de Solervia. ¿Tienes un momento para conversar?",
                    goal: "Proponer una reunión exploratoria, pendiente de confirmación.",
                    end_conditions:
                      "Terminar si no desea continuar, pide no contacto o se alcanza el límite de duración.",
                    allowed_answers:
                      "Usar sólo el catálogo autorizado. Si falta información, ofrecer seguimiento humano.",
                  }
                : (script as unknown as Record<string, unknown>)
            }
            onSubmit={async (v) => {
              await api(
                script === "new" ? "scripts" : "scripts/" + script.id,
                script === "new" ? "POST" : "PATCH",
                v,
              );
              setScript(null);
              await run(async () => {}, "Guion guardado.");
            }}
          />
        </Modal>
      )}
    </>
  );
}
