"use client";
import { useState } from "react";
import { Play, CalendarDays } from "lucide-react";
import type { AppState } from "@/lib/domain";
import {
  api,
  AddButton,
  Badge,
  Empty,
  Form,
  Modal,
  PageTitle,
  Panel,
  date,
  datetimeInput,
  type Run,
} from "./ui";
export function Calendar({ data, run }: { data: AppState; run: Run }) {
  const [modal, setModal] = useState(false);
  const [defaultEnd] = useState(() =>
    datetimeInput(new Date(Date.now() + 88200000).toISOString()),
  );
  return (
    <>
      <PageTitle
        title="Calendario"
        description="Proponer es el primer paso. Confirma sólo después de comprobar disponibilidad."
        action={
          <AddButton onClick={() => setModal(true)}>Proponer reunión</AddButton>
        }
      />
      <div className="info-banner">
        <CalendarDays size={20} />
        <p>
          {data.settings.mode === "demo"
            ? "Las confirmaciones son simuladas y verifican conflictos en el calendario local."
            : "Sin una cuenta de Google Calendar conectada, las reuniones permanecen como propuestas."}{" "}
          Horarios mostrados en America/Mexico_City.
        </p>
      </div>
      <Panel title="Agenda comercial">
        {data.meetings.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.meetings.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <b>
                        {
                          data.prospects.find((p) => p.id === m.prospect_id)
                            ?.name
                        }
                      </b>
                      <small>{m.summary}</small>
                    </td>
                    <td>{date(m.starts_at)}</td>
                    <td>{date(m.ends_at)}</td>
                    <td>
                      <Badge
                        tone={m.status === "confirmed" ? "green" : "amber"}
                      >
                        {
                          {
                            proposed: "Propuesta",
                            confirmed: "Confirmada",
                            simulated: "Confirmación simulada",
                            confirming: "Verificando",
                            uncertain: "Revisar con proveedor",
                          }[m.status]
                        }
                      </Badge>
                    </td>
                    <td>
                      {!["confirmed", "simulated"].includes(m.status) && (
                        <button
                          className="button secondary"
                          onClick={() =>
                            run(
                              () => api(`meetings/${m.id}/confirm`),
                              "Reunión revisada. Consulta su estado de confirmación.",
                            )
                          }
                        >
                          {m.demo
                            ? "Simular confirmación"
                            : "Verificar y confirmar"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Tu agenda tiene espacio para crecer"
            detail="Registra una propuesta desde una conversación interesada. Aquí podrás confirmar su horario."
          />
        )}
      </Panel>
      {modal && (
        <Modal title="Proponer reunión" onClose={() => setModal(false)}>
          <Form
            fields={[
              {
                name: "prospect_id",
                label: "Empresa",
                type: "select",
                required: true,
                options: data.prospects.map((p) => ({
                  value: p.id,
                  label: p.name,
                })),
              },
              {
                name: "product_id",
                label: "Producto",
                type: "select",
                options: data.products.map((p) => ({
                  value: p.id,
                  label: p.name,
                })),
              },
              {
                name: "starts_at",
                label: "Inicio (hora local del navegador)",
                type: "datetime-local",
                required: true,
              },
              {
                name: "ends_at",
                label: "Fin (hora local del navegador)",
                type: "datetime-local",
                required: true,
              },
              {
                name: "summary",
                label: "Resumen de la conversación",
                type: "textarea",
              },
            ]}
            initial={{ starts_at: datetimeInput(), ends_at: defaultEnd }}
            onSubmit={async (v) => {
              await api("meetings", "POST", {
                ...v,
                product_id: v.product_id || null,
                starts_at: new Date(String(v.starts_at)).toISOString(),
                ends_at: new Date(String(v.ends_at)).toISOString(),
              });
              setModal(false);
              await run(async () => {}, "Propuesta registrada.");
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function Activity({ data, run }: { data: AppState; run: Run }) {
  return (
    <>
      <PageTitle
        title="Actividad y automatizaciones"
        description="Observa qué pasó, qué sigue y qué necesita tu atención."
        action={
          <button
            className="button primary"
            onClick={() =>
              run(() => api("worker"), "Ciclo de trabajos ejecutado.")
            }
          >
            <Play size={16} />
            Ejecutar trabajos pendientes
          </button>
        }
      />
      <div className="info-banner">
        <p>
          La cola persiste en PostgreSQL. En cloud, un programador externo
          invoca el worker aunque tu computadora esté apagada. El botón ejecuta
          hasta 10 trabajos vencidos.
        </p>
      </div>
      <Panel title="Cola de trabajo">
        {data.jobs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Trabajo</th>
                  <th>Estado</th>
                  <th>Programado</th>
                  <th>Intentos</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      {{
                        dispatch: "Contacto autorizado",
                        notification: "Notificación",
                        followup: "Seguimiento",
                        search: "Búsqueda",
                      }[j.kind] || j.kind}
                    </td>
                    <td>
                      <Badge
                        tone={
                          j.status === "done"
                            ? "green"
                            : ["failed", "uncertain"].includes(j.status)
                              ? "red"
                              : "neutral"
                        }
                      >
                        {
                          {
                            queued: "Pendiente",
                            running: "En proceso",
                            done: "Completado",
                            failed: "Fallido",
                            uncertain: "Requiere revisión",
                            cancelled: "Cancelado",
                          }[j.status]
                        }
                      </Badge>
                    </td>
                    <td>{date(j.run_at)}</td>
                    <td>{j.attempts}</td>
                    <td>
                      <small>{j.error || "—"}</small>
                      {j.status === "failed" && j.kind !== "dispatch" && (
                        <button
                          className="text-link"
                          onClick={() => run(() => api(`jobs/${j.id}/retry`))}
                        >
                          Reintentar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Sin trabajos pendientes"
            detail="Las campañas, los seguimientos y las búsquedas crearán trabajos aquí."
          />
        )}
      </Panel>
      <div className="dashboard-grid">
        <Panel title="Historial de actividad">
          <div className="timeline">
            {data.activities.map((a) => (
              <div key={a.id}>
                <span className="timeline-dot" />
                <p>
                  {a.description}
                  <small>{date(a.created_at)}</small>
                </p>
              </div>
            ))}
            {!data.activities.length && (
              <p className="muted">No hay actividad registrada.</p>
            )}
          </div>
        </Panel>
        <Panel title="Notificaciones">
          <div className="notification-list">
            {data.notifications.map((n) => (
              <div className="list-item" key={n.id}>
                <div>
                  <p>{n.message}</p>
                  <small>{date(n.created_at)}</small>
                </div>
                <Badge>
                  {n.status === "simulated" ? "Simulada" : n.status}
                </Badge>
              </div>
            ))}
            {!data.notifications.length && (
              <Empty
                title="Sin notificaciones"
                detail="Los eventos importantes se registrarán aquí y se enviarán a Telegram cuando esté configurado."
              />
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
