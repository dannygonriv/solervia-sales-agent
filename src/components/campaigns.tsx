"use client";
import { useState } from "react";
import Link from "next/link";
import { Play, Pause, Phone, Mail, Square, ArrowRight } from "lucide-react";
import type { AppState, Campaign } from "@/lib/domain";
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
  money,
  type Run,
} from "./ui";
export function Campaigns({ data, run }: { data: AppState; run: Run }) {
  const [create, setCreate] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [approve, setApprove] = useState<Campaign | null>(null);
  return (
    <>
      <PageTitle
        title="Campañas"
        description="Conversaciones relevantes, con objetivos claros y límites definidos."
        action={
          <AddButton onClick={() => setCreate(true)}>Crear campaña</AddButton>
        }
      />
      <div className="info-banner">
        <span>Control humano en cada envío</span>
        <p>
          Los correos deben aprobarse individualmente. Las llamadas requieren un
          guion, permisos y límites. Los trabajos se ejecutan dentro del horario
          permitido.
        </p>
      </div>
      {data.campaigns.length ? (
        <div className="campaign-grid">
          {data.campaigns.map((c) => {
            const jobs = data.jobs.filter(
                (j) => j.payload.campaign_id === c.id,
              ),
              done = jobs.filter((j) => j.status === "done").length;
            return (
              <article className="panel campaign-card" key={c.id}>
                <div className="campaign-top">
                  <span className="channel-icon">
                    {c.channel === "call" ? (
                      <Phone size={20} />
                    ) : (
                      <Mail size={20} />
                    )}
                  </span>
                  <Badge tone={c.status === "running" ? "green" : "neutral"}>
                    {
                      {
                        draft: "Borrador",
                        running: "En curso",
                        paused: "Pausada",
                        cancelled: "Cancelada",
                        completed: "Finalizada",
                      }[c.status]
                    }
                  </Badge>
                </div>
                <h2>{c.name}</h2>
                <p>{data.products.find((p) => p.id === c.product_id)?.name}</p>
                <div className="campaign-stats">
                  <div>
                    <small>Límite de contactos</small>
                    <b>{c.max_contacts}</b>
                  </div>
                  <div>
                    <small>Presupuesto</small>
                    <b>{money(c.budget)}</b>
                  </div>
                </div>
                <small>
                  Inicio {date(c.starts_at)}
                  <br />
                  Horario {c.start_hour}:00–{c.end_hour}:00 ·{" "}
                  {data.settings.timezone}
                </small>
                {jobs.length > 0 && (
                  <p>
                    {done} completados de {jobs.length} trabajos ·{" "}
                    {
                      jobs.filter((j) =>
                        ["failed", "uncertain"].includes(j.status),
                      ).length
                    }{" "}
                    por revisar
                  </p>
                )}
                <div className="card-actions">
                  {["draft", "paused"].includes(c.status) && (
                    <button
                      className="button primary"
                      onClick={() => setApprove(c)}
                    >
                      <Play size={14} />
                      {c.status === "paused" ? "Reanudar" : "Revisar e iniciar"}
                    </button>
                  )}
                  {c.status === "running" && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        run(() =>
                          api(`campaigns/${c.id}`, "POST", { action: "pause" }),
                        )
                      }
                    >
                      <Pause size={14} />
                      Pausar
                    </button>
                  )}
                  {!["completed", "cancelled"].includes(c.status) && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        run(() =>
                          api(`campaigns/${c.id}`, "POST", {
                            action: "cancel",
                          }),
                        )
                      }
                    >
                      <Square size={13} />
                      Cancelar
                    </button>
                  )}
                  {c.channel === "email" && c.status === "draft" && (
                    <button
                      className="text-link"
                      onClick={() =>
                        run(
                          () => api(`campaigns/${c.id}/drafts`),
                          "Hasta 2 borradores preparados. Revísalos en Correos; repite para el siguiente lote.",
                        )
                      }
                    >
                      Preparar borradores <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Panel title="Tus campañas">
          <Empty
            title="La primera conversación aún está por escribirse"
            detail="Crea una campaña con prospectos seleccionados y un producto definido. Empieza con una simulación."
            action={
              <button
                className="button secondary"
                onClick={() => setCreate(true)}
              >
                Crear mi primera campaña
              </button>
            }
          />
        </Panel>
      )}
      {create && (
        <Modal title="Crear campaña" onClose={() => setCreate(false)}>
          {!data.products.length ? (
            <Empty
              title="Primero define tu oferta"
              detail="Agrega un producto y, para llamadas, un guion desde Configuración."
              action={
                <Link href="/configuracion" className="button primary">
                  Configurar productos
                </Link>
              }
            />
          ) : (
            <Form
              fields={[
                { name: "name", label: "Nombre de la campaña", required: true },
                {
                  name: "product_id",
                  label: "Producto",
                  type: "select",
                  required: true,
                  options: data.products
                    .filter((p) => p.active)
                    .map((p) => ({ value: p.id, label: p.name })),
                },
                {
                  name: "channel",
                  label: "Canal",
                  type: "select",
                  required: true,
                  options: [
                    { value: "email", label: "Correo electrónico" },
                    { value: "call", label: "Llamadas con IA" },
                  ],
                },
                {
                  name: "script_id",
                  label: "Guion (obligatorio para llamadas)",
                  type: "select",
                  options: data.scripts.map((s) => ({
                    value: s.id,
                    label: s.name,
                  })),
                },
                {
                  name: "starts_at",
                  label: "Fecha de inicio",
                  type: "datetime-local",
                  required: true,
                },
                {
                  name: "max_contacts",
                  label: "Máximo de contactos",
                  type: "number",
                  min: 1,
                  max: 500,
                  required: true,
                },
                {
                  name: "budget",
                  label: "Presupuesto máximo (USD)",
                  type: "number",
                  min: 0.01,
                  step: "0.01",
                  required: true,
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
              ]}
              initial={{
                channel: "email",
                starts_at: datetimeInput(new Date().toISOString()),
                max_contacts: 5,
                budget: 5,
                start_hour: data.settings.start_hour,
                end_hour: data.settings.end_hour,
              }}
              onSubmit={async (v) => {
                await api("campaigns", "POST", {
                  ...v,
                  script_id: v.script_id || null,
                  starts_at: new Date(String(v.starts_at)).toISOString(),
                  prospect_ids: selected,
                });
                setCreate(false);
                setSelected([]);
                await run(async () => {}, "Campaña creada en borrador.");
              }}
            >
              <fieldset>
                <legend>Selecciona prospectos ({selected.length})</legend>
                <div className="checkbox-list">
                  {data.prospects
                    .filter((p) => p.status !== "No contactar")
                    .map((p) => (
                      <label key={p.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(p.id)}
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked
                                ? [...prev, p.id]
                                : prev.filter((id) => id !== p.id),
                            )
                          }
                        />
                        {p.name}
                        <Badge>{p.status}</Badge>
                      </label>
                    ))}
                </div>
              </fieldset>
            </Form>
          )}
        </Modal>
      )}
      {approve && (
        <Modal
          title={approve.demo ? "Iniciar simulación" : "Autorizar campaña real"}
          onClose={() => setApprove(null)}
        >
          <div className="detail-block">
            <h3>{approve.name}</h3>
            <p>
              Canal: {approve.channel === "call" ? "llamadas" : "correo"}.
              Límite: {approve.max_contacts} contactos. Presupuesto:{" "}
              {money(approve.budget)}.
            </p>
            <p>
              {approve.demo
                ? "Esta campaña utiliza adaptadores simulados y no enviará comunicaciones."
                : "Confirma que revisaste los destinatarios, las autorizaciones y los mensajes. La activación queda registrada."}
            </p>
            <button
              className="button primary"
              onClick={() =>
                run(async () => {
                  await api("campaigns/" + approve.id, "POST", {
                    action: "start",
                    approved: true,
                  });
                  setApprove(null);
                }, "Campaña activa. La cola respetará horarios y límites.")
              }
            >
              <Play size={16} />
              {approve.demo ? "Iniciar simulación" : "Aprobar e iniciar"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
