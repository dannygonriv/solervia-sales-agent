"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, Download, Sparkles, ArrowLeft } from "lucide-react";
import { statuses, type AppState, type Prospect } from "@/lib/domain";
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
  type Field,
  type Run,
} from "./ui";
const companyFields: Field[] = [
  { name: "name", label: "Nombre comercial", required: true },
  { name: "legal_name", label: "Razón social" },
  { name: "sector", label: "Sector" },
  { name: "activity", label: "Actividad económica" },
  { name: "size", label: "Tamaño / empleados" },
  { name: "address", label: "Dirección" },
  { name: "city", label: "Ciudad", required: true },
  { name: "state", label: "Estado", required: true },
  { name: "email", label: "Correo corporativo", type: "email" },
  {
    name: "phone",
    label: "Teléfono",
    hint: "Para llamadas reales: +52 seguido del número.",
  },
  { name: "website", label: "Sitio web", type: "url" },
  { name: "linkedin", label: "LinkedIn corporativo", type: "url" },
  { name: "contact_name", label: "Responsable (si existe fuente legítima)" },
  { name: "source", label: "Fuente de información", required: true },
];
export function Prospects({ data, run }: { data: AppState; run: Run }) {
  const [modal, setModal] = useState(false),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("recent");
  let rows = data.prospects.filter(
    (p) =>
      (!status || p.status === status) &&
      `${p.name} ${p.sector} ${p.city}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  if (sort === "score")
    rows = [...rows].sort((a, b) => (b.score || 0) - (a.score || 0));
  if (sort === "name")
    rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <PageTitle
        title="Prospectos"
        description="Una vista clara de cada empresa y de la próxima conversación."
        action={
          <AddButton onClick={() => setModal(true)}>Nuevo prospecto</AddButton>
        }
      />
      <section className="panel">
        <div className="toolbar">
          <div className="searchbox">
            <Search size={17} />
            <input
              aria-label="Buscar prospectos"
              placeholder="Buscar por empresa, sector o ciudad…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Filtrar estado"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Ordenar prospectos"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Más recientes</option>
            <option value="score">Mayor prioridad</option>
            <option value="name">Nombre A–Z</option>
          </select>
          <a download href="/api/prospects/export" className="button secondary">
            <Download size={16} />
            CSV
          </a>
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Estado comercial</th>
                  <th>Prioridad</th>
                  <th>Contacto</th>
                  <th>Próxima acción</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link
                        href={"/prospectos/" + p.id}
                        className="company-cell"
                      >
                        <span className="avatar">
                          {p.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span>
                          <b>{p.name}</b>
                          <small>
                            {p.sector || "Sin sector"} · {p.city}
                          </small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Badge
                        tone={
                          p.status === "No contactar"
                            ? "red"
                            : p.status === "Interesado"
                              ? "green"
                              : "neutral"
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td>
                      {p.score !== null ? (
                        <span className="score">
                          {p.score}
                          <small>/100</small>
                        </span>
                      ) : (
                        <span className="muted">Por evaluar</span>
                      )}
                    </td>
                    <td>
                      <small>
                        {p.email || "Sin correo"}
                        <br />
                        {p.phone || "Sin teléfono"}
                      </small>
                    </td>
                    <td>
                      <small>
                        {p.next_action || "Revisar información"}
                        <br />
                        {p.followup_at ? date(p.followup_at) : ""}
                      </small>
                    </td>
                    <td>
                      <Link href={"/prospectos/" + p.id} className="text-link">
                        Abrir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              query || status
                ? "No hay coincidencias"
                : "Construye tu primera lista"
            }
            detail="Registra una empresa manualmente o explora el directorio de empresas."
            action={
              <Link className="button secondary" href="/buscar">
                Buscar empresas
              </Link>
            }
          />
        )}
      </section>
      {modal && (
        <Modal title="Nuevo prospecto" onClose={() => setModal(false)}>
          <p className="muted">
            {data.settings.mode === "demo"
              ? "Registro de demostración. Usa datos ficticios."
              : "Los contactos requieren revisión antes de cualquier envío."}
          </p>
          <Form
            fields={companyFields}
            initial={{
              city: data.settings.city,
              state: "Jalisco",
              source: "Registro manual",
            }}
            onSubmit={async (v) => {
              await api("prospects", "POST", {
                ...v,
                demo: data.settings.mode === "demo",
              });
              setModal(false);
              await run(async () => {}, "Prospecto guardado.");
            }}
          />
        </Modal>
      )}
    </>
  );
}
export function ProspectDetail({
  data,
  id,
  run,
}: {
  data: AppState;
  id: string;
  run: Run;
}) {
  const p = data.prospects.find((p) => p.id === id);
  const [modal, setModal] = useState<
    "edit" | "consent" | "company" | "draft" | null
  >(null);
  if (!p)
    return (
      <Empty
        title="Prospecto no disponible"
        detail="Comprueba el modo seleccionado o vuelve a la lista."
        action={<Link href="/prospectos">Volver a prospectos</Link>}
      />
    );
  const products = data.products.map((v) => ({ value: v.id, label: v.name }));
  return (
    <>
      <Link className="back-link" href="/prospectos">
        <ArrowLeft size={15} />
        Todos los prospectos
      </Link>
      <PageTitle
        eyebrow={p.sector || "FICHA COMERCIAL"}
        title={p.name}
        description={`${p.city || "Ciudad no registrada"} · Fuente: ${p.source}`}
        action={
          <button
            className="button primary"
            onClick={() =>
              run(() => api(`prospects/${id}/qualify`), "Análisis guardado.")
            }
          >
            <Sparkles size={16} />
            Calificar prospecto
          </button>
        }
      />
      <div className="detail-tags">
        <Badge tone="blue">{p.status}</Badge>
        {p.demo && <Badge tone="amber">Demostración</Badge>}
        {p.score !== null && (
          <Badge tone="green">Prioridad {p.score}/100</Badge>
        )}
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Información y contacto"
          action={
            <button className="text-link" onClick={() => setModal("company")}>
              Editar información
            </button>
          }
        >
          <div className="detail-block">
            <dl>
              {[
                ["Razón social", p.legal_name],
                ["Actividad", p.activity],
                ["Tamaño", p.size],
                ["Dirección", p.address],
                ["Correo", p.email],
                ["Teléfono", p.phone],
                ["Responsable", p.contact_name],
                ["Sitio web", p.website],
                ["Consulta", date(p.consulted_at)],
              ].map(([k, v]) => (
                <div className="dl-row" key={k}>
                  <dt>{k}</dt>
                  <dd>{v || "No disponible"}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>
        <Panel
          title="Próxima acción"
          action={
            <button className="text-link" onClick={() => setModal("edit")}>
              Editar seguimiento
            </button>
          }
        >
          <div className="detail-block">
            <h3>{p.next_action || "Revisar información de la empresa"}</h3>
            <p>
              {p.followup_at
                ? date(p.followup_at)
                : "Sin seguimiento programado"}
            </p>
            <div className="note">
              {p.notes ||
                "Agrega notas para dar contexto al siguiente contacto."}
            </div>
            <button
              className="button secondary"
              onClick={() => setModal("draft")}
            >
              Preparar correo
            </button>
          </div>
        </Panel>
        <Panel
          title="Autorización de contacto"
          action={
            <button className="text-link" onClick={() => setModal("consent")}>
              Revisar permisos
            </button>
          }
        >
          <div className="detail-block">
            <div className="detail-tags">
              <Badge tone={p.email_allowed ? "green" : "amber"}>
                Correo: {p.email_allowed ? "habilitado" : "pendiente"}
              </Badge>
              <Badge tone={p.call_allowed ? "green" : "amber"}>
                Llamadas: {p.call_allowed ? "habilitadas" : "pendientes"}
              </Badge>
            </div>
            <p>{p.legal_basis || "No hay base de contacto documentada."}</p>
            <small>
              {p.evidence || "Un dato público no constituye autorización."}
            </small>
            <p>
              Vigencia:{" "}
              {p.expires_at
                ? date(p.expires_at)
                : "Sin fecha de expiración registrada"}
            </p>
            <button
              className="button danger"
              onClick={() =>
                run(
                  () =>
                    api("suppression", "POST", {
                      prospect_id: id,
                      reason: "Exclusión manual del administrador",
                    }),
                  "Contacto excluido de todas las campañas.",
                )
              }
            >
              Marcar No contactar
            </button>
          </div>
        </Panel>
        <Panel title="Oportunidad comercial">
          {p.analysis ? (
            <div className="detail-block">
              <Badge>{p.analysis.recommendation}</Badge>
              <p>{p.analysis.reason}</p>
              <h3>Datos registrados</h3>
              <ul>
                {p.analysis.verified_facts.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
              <h3>Hipótesis · por validar</h3>
              <ul>
                {p.analysis.hypotheses.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
              <h3>Preguntas sugeridas</h3>
              <ul>
                {p.analysis.questions.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          ) : (
            <Empty
              title="Conoce mejor esta oportunidad"
              detail="Genera una calificación para separar lo que sabes de lo que necesitas validar."
            />
          )}
        </Panel>
      </div>
      <Panel title="Historial del prospecto">
        <div className="timeline">
          {data.activities
            .filter((a) => a.prospect_id === id)
            .map((a) => (
              <div key={a.id}>
                <span className="timeline-dot" />
                <p>
                  {a.description}
                  <small>{date(a.created_at)}</small>
                </p>
              </div>
            ))}
        </div>
        {data.calls
          .filter((c) => c.prospect_id === id)
          .map((c) => (
            <details key={c.id}>
              <summary>
                Llamada · {date(c.created_at)} ·{" "}
                {c.demo ? "simulada" : c.status}
              </summary>
              <pre>{c.transcript || "Transcripción pendiente"}</pre>
              <p>{c.summary}</p>
            </details>
          ))}
        {data.emails
          .filter((e) => e.prospect_id === id)
          .map((e) => (
            <details key={e.id}>
              <summary>
                Correo · {e.subject} · {e.status}
              </summary>
              <pre>{e.body}</pre>
              {e.reply && <p>Respuesta: {e.reply}</p>}
            </details>
          ))}
      </Panel>
      {modal && (
        <Modal
          title={
            {
              edit: "Seguimiento comercial",
              consent: "Permisos y evidencia",
              company: "Editar empresa",
              draft: "Preparar borrador",
            }[modal]
          }
          onClose={() => setModal(null)}
        >
          {modal === "company" ? (
            <Form
              fields={companyFields}
              initial={p as unknown as Record<string, unknown>}
              onSubmit={async (v) => {
                await api(`prospects/${id}/company`, "PATCH", {
                  ...v,
                  demo: p.demo,
                });
                setModal(null);
                await run(async () => {}, "Información guardada.");
              }}
            />
          ) : modal === "edit" ? (
            <Form
              fields={[
                {
                  name: "status",
                  label: "Estado",
                  type: "select",
                  options: statuses.map((s) => ({ value: s, label: s })),
                  required: true,
                },
                {
                  name: "product_id",
                  label: "Producto",
                  type: "select",
                  options: products,
                },
                { name: "next_action", label: "Próxima acción" },
                {
                  name: "followup_at",
                  label: "Fecha de seguimiento",
                  type: "datetime-local",
                },
                { name: "notes", label: "Notas", type: "textarea" },
              ]}
              initial={{
                ...p,
                followup_at: p.followup_at ? datetimeInput(p.followup_at) : "",
              }}
              onSubmit={async (v) => {
                await api(`prospects/${id}`, "PATCH", {
                  ...v,
                  product_id: v.product_id || null,
                  followup_at: v.followup_at
                    ? new Date(String(v.followup_at)).toISOString()
                    : null,
                });
                setModal(null);
                await run(async () => {}, "Seguimiento guardado.");
              }}
            />
          ) : modal === "consent" ? (
            <Form
              fields={[
                {
                  name: "email_allowed",
                  label: "Autorizar correo comercial",
                  type: "checkbox",
                },
                {
                  name: "call_allowed",
                  label: "Autorizar llamadas con IA",
                  type: "checkbox",
                },
                {
                  name: "legal_basis",
                  label: "Base de autorización / justificación",
                  type: "textarea",
                  required: true,
                },
                {
                  name: "evidence",
                  label: "Referencia de evidencia verificable",
                  type: "textarea",
                  required: true,
                },
                {
                  name: "expires_at",
                  label: "Vigencia hasta (opcional)",
                  type: "datetime-local",
                },
              ]}
              initial={{
                ...p,
                expires_at: p.expires_at ? datetimeInput(p.expires_at) : "",
              }}
              onSubmit={async (v) => {
                await api(`prospects/${id}/consent`, "POST", {
                  ...v,
                  expires_at: v.expires_at
                    ? new Date(String(v.expires_at)).toISOString()
                    : null,
                });
                setModal(null);
                await run(
                  async () => {},
                  "Permisos registrados en el historial.",
                );
              }}
            />
          ) : (
            <Form
              fields={[
                {
                  name: "product_id",
                  label: "Producto",
                  type: "select",
                  options: products,
                  required: true,
                },
              ]}
              initial={{ product_id: p.product_id }}
              label="Generar borrador"
              onSubmit={async (v) => {
                await api(`prospects/${id}/draft`, "POST", v);
                setModal(null);
                await run(async () => {}, "Borrador disponible en Correos.");
              }}
            />
          )}
        </Modal>
      )}
    </>
  );
}
export function CompanySummary({ p }: { p: Prospect }) {
  return (
    <>
      <b>{p.name}</b>
      <small>{p.sector}</small>
    </>
  );
}
