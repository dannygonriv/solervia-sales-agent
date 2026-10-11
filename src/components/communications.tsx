"use client";
import { useState } from "react";
import Link from "next/link";
import type { AppState, Email } from "@/lib/domain";
import {
  api,
  Badge,
  Empty,
  Form,
  Modal,
  PageTitle,
  Panel,
  date,
  money,
  type Run,
} from "./ui";
export function Emails({ data, run }: { data: AppState; run: Run }) {
  const [edit, setEdit] = useState<Email | null>(null),
    [reply, setReply] = useState<Email | null>(null);
  return (
    <>
      <PageTitle
        title="Correos"
        description="Cada mensaje comienza como borrador. Revisa el contenido antes de aprobarlo."
      />
      {data.emails.length ? (
        <div className="email-list">
          {data.emails.map((e) => (
            <Panel
              key={e.id}
              title={e.subject}
              action={
                <Badge
                  tone={
                    e.status === "approved"
                      ? "green"
                      : e.demo
                        ? "amber"
                        : "neutral"
                  }
                >
                  {e.demo ? "Demo · " : ""}
                  {{
                    draft: "Borrador",
                    approved: "Aprobado",
                    simulated: "Envío simulado",
                    sent: "Enviado",
                    delivered: "Entregado",
                    replied: "Respuesta registrada",
                  }[e.status] || e.status}
                </Badge>
              }
            >
              <div className="detail-block">
                <div className="email-meta">
                  <Link href={"/prospectos/" + e.prospect_id}>
                    {data.prospects.find((p) => p.id === e.prospect_id)?.name}
                  </Link>
                  <small>
                    {date(e.created_at)}
                    {e.campaign_id ? " · Campaña" : ""}
                  </small>
                </div>
                <pre>{e.body}</pre>
                {e.reply && (
                  <div className="note">
                    <b>Respuesta registrada</b>
                    <p>{e.reply}</p>
                  </div>
                )}
                <div className="card-actions">
                  {["draft", "approved"].includes(e.status) && (
                    <button
                      className="button secondary"
                      onClick={() => setEdit(e)}
                    >
                      Editar borrador
                    </button>
                  )}
                  {e.status === "draft" && (
                    <button
                      className="button primary"
                      onClick={() =>
                        run(
                          () => api(`emails/${e.id}/approve`),
                          "Contenido aprobado.",
                        )
                      }
                    >
                      Aprobar contenido
                    </button>
                  )}
                  {e.status === "approved" && !e.campaign_id && (
                    <button
                      className="button primary"
                      onClick={() =>
                        run(
                          () => api(`emails/${e.id}/send`),
                          "Envío encolado; se verificará la elegibilidad.",
                        )
                      }
                    >
                      {e.demo ? "Encolar simulación" : "Autorizar envío"}
                    </button>
                  )}
                  {["sent", "simulated", "delivered", "replied"].includes(
                    e.status,
                  ) && (
                    <button
                      className="button secondary"
                      onClick={() => setReply(e)}
                    >
                      Registrar respuesta / baja
                    </button>
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel title="Bandeja de trabajo">
          <Empty
            title="Mensajes con contexto, no plantillas vacías"
            detail="Abre una ficha de prospecto para preparar un correo personalizado o genera los borradores de una campaña."
            action={
              <Link href="/prospectos" className="button secondary">
                Ver prospectos
              </Link>
            }
          />
        </Panel>
      )}
      {edit && (
        <Modal title="Editar borrador" onClose={() => setEdit(null)}>
          <Form
            fields={[
              { name: "subject", label: "Asunto", required: true },
              {
                name: "body",
                label: "Mensaje",
                type: "textarea",
                required: true,
              },
            ]}
            initial={{ subject: edit.subject, body: edit.body }}
            onSubmit={async (v) => {
              await api("emails/" + edit.id, "PATCH", v);
              setEdit(null);
              await run(
                async () => {},
                "Borrador guardado. Requiere nueva aprobación.",
              );
            }}
          />
        </Modal>
      )}
      {reply && (
        <Modal title="Registrar respuesta" onClose={() => setReply(null)}>
          <p className="muted">
            Copia la respuesta recibida en tu buzón. Las respuestas entrantes se
            registran manualmente en esta versión.
          </p>
          <Form
            fields={[
              {
                name: "reply",
                label: "Respuesta recibida",
                type: "textarea",
                required: true,
              },
              {
                name: "opt_out",
                label: "Solicitó no recibir más comunicaciones",
                type: "checkbox",
              },
            ]}
            onSubmit={async (v) => {
              await api(`emails/${reply.id}/reply`, "POST", v);
              setReply(null);
              await run(async () => {}, "Respuesta registrada.");
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function Calls({ data, run }: { data: AppState; run: Run }) {
  return (
    <>
      <PageTitle
        title="Llamadas"
        description="Conversaciones, transcripciones y siguientes pasos en un solo lugar."
      />
      <Panel title="Historial de llamadas">
        {data.calls.length ? (
          <div className="call-list">
            {data.calls.map((c) => (
              <details key={c.id}>
                <summary>
                  <div>
                    <b>
                      {data.prospects.find((p) => p.id === c.prospect_id)?.name}
                    </b>
                    <small>
                      {date(c.created_at)} · {c.duration_seconds ?? "—"} s ·{" "}
                      {money(c.cost)}
                    </small>
                  </div>
                  <Badge tone={c.demo ? "amber" : "blue"}>
                    {c.demo ? "Simulada" : c.status}
                  </Badge>
                </summary>
                <div className="detail-block">
                  <h3>Resumen</h3>
                  <p>{c.summary || "Pendiente del proveedor."}</p>
                  <h3>Transcripción</h3>
                  <pre>
                    {c.transcript || "No disponible o eliminada por retención."}
                  </pre>
                  <dl>
                    <dt>Interés</dt>
                    <dd>{c.interest || "Por analizar"}</dd>
                    <dt>Objeciones</dt>
                    <dd>{c.objections || "Sin registro"}</dd>
                    <dt>Próxima acción</dt>
                    <dd>{c.next_action || "Revisar resultado"}</dd>
                  </dl>
                  {c.demo && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        run(
                          () =>
                            api("webhooks/simulate", "POST", {
                              call_id: c.provider_id,
                              opt_out: false,
                            }),
                          "Webhook simulado procesado de forma idempotente.",
                        )
                      }
                    >
                      Probar evento de análisis
                    </button>
                  )}
                  <p className="muted">
                    No se almacenan grabaciones. La conservación de
                    transcripciones se administra desde Configuración.
                  </p>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <Empty
            title="Cada conversación contará su historia"
            detail="Crea una campaña de llamadas para probar el agente y consultar sus resultados aquí."
            action={
              <Link href="/campanas" className="button secondary">
                Ir a campañas
              </Link>
            }
          />
        )}
      </Panel>
    </>
  );
}
