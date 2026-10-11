"use client";
import Link from "next/link";
import {
  Users,
  Phone,
  Mail,
  CalendarDays,
  ArrowRight,
  Search,
  CheckCircle2,
  Target,
} from "lucide-react";
import type { AppState } from "@/lib/domain";
import { Badge, date, Empty, money, PageTitle, Panel } from "./ui";
export function Metrics({ data }: { data: AppState }) {
  const contacted = new Set([
      ...data.calls.map((c) => c.prospect_id),
      ...data.emails
        .filter((e) =>
          ["sent", "delivered", "replied", "simulated"].includes(e.status),
        )
        .map((e) => e.prospect_id),
    ]),
    responded = new Set([
      ...data.emails
        .filter((e) => e.status === "replied")
        .map((e) => e.prospect_id),
      ...data.calls.filter((c) => !!c.interest).map((c) => c.prospect_id),
    ]),
    confirmed = data.meetings.filter((m) =>
      ["confirmed", "simulated"].includes(m.status),
    ),
    interested = data.prospects.filter((p) =>
      [
        "Interesado",
        "Reunión propuesta",
        "Reunión confirmada",
        "Cliente",
      ].includes(p.status),
    ).length;
  const metrics = [
    {
      label: "Prospectos",
      value: data.prospects.length,
      note: `${data.prospects.filter((p) => p.status === "Nuevo").length} nuevos por investigar`,
      icon: Users,
    },
    {
      label: "Contactados",
      value: contacted.size,
      note: `${interested} interesados`,
      icon: Target,
    },
    {
      label: "Reuniones",
      value: confirmed.length,
      note: `${data.meetings.filter((m) => m.status === "proposed").length} propuestas pendientes`,
      icon: CalendarDays,
    },
    {
      label: "Costo estimado",
      value: money(data.costs.actual),
      note: `${money(data.costs.reserved)} reservados · USD`,
      icon: CheckCircle2,
    },
  ];
  return (
    <>
      <div className="metrics">
        {metrics.map((m) => (
          <div className="metric" key={m.label}>
            <div className="metric-label">
              {m.label}
              <m.icon size={17} />
            </div>
            <strong>{m.value}</strong>
            <small>{m.note}</small>
          </div>
        ))}
      </div>
      <div className="submetrics">
        <span>
          <Phone size={15} />
          {data.calls.length} llamadas registradas
        </span>
        <span>
          <Mail size={15} />
          {
            data.emails.filter((e) =>
              ["sent", "delivered", "replied", "simulated"].includes(e.status),
            ).length
          }{" "}
          correos enviados
        </span>
        <span>
          Respuesta{" "}
          <b>
            {contacted.size
              ? Math.round((responded.size / contacted.size) * 100)
              : 0}
            %
          </b>
        </span>
        <span>
          Conversión a cliente{" "}
          <b>
            {data.prospects.length
              ? Math.round(
                  (data.prospects.filter((p) => p.status === "Cliente").length /
                    data.prospects.length) *
                    100,
                )
              : 0}
            %
          </b>
        </span>
      </div>
    </>
  );
}
export function Dashboard({ data }: { data: AppState }) {
  const priority = [...data.prospects]
    .filter((p) => p.score !== null)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5);
  return (
    <>
      <PageTitle
        eyebrow="TU CENTRO DE OPERACIONES"
        title="Una buena conversación empieza aquí."
        description="Encuentra oportunidades, prepara el contacto y da seguimiento con intención."
        action={
          <Link href="/buscar" className="button primary">
            <Search size={17} />
            Buscar empresas
          </Link>
        }
      />
      <Metrics data={data} />
      <div className="dashboard-grid">
        <Panel
          title="Tu próximo paso"
          action={<Badge tone="blue">Flujo comercial</Badge>}
        >
          <div className="steps">
            {[
              {
                n: "01",
                title: "Encuentra empresas",
                text: "Explora negocios en tu mercado y registra los que encajen.",
                href: "/buscar",
                done: data.prospects.length > 0,
              },
              {
                n: "02",
                title: "Conoce la oportunidad",
                text: "Califica prospectos y revisa las hipótesis comerciales.",
                href: "/prospectos",
                done: priority.length > 0,
              },
              {
                n: "03",
                title: "Inicia una conversación",
                text: "Aprueba el canal, el mensaje y los límites de tu campaña.",
                href: "/campanas",
                done: data.campaigns.length > 0,
              },
            ].map((s) => (
              <Link href={s.href} className="step" key={s.n}>
                <span className={"step-number " + (s.done ? "done" : "")}>
                  {s.done ? <CheckCircle2 size={18} /> : s.n}
                </span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </Panel>
        <Panel
          title="Próximas reuniones"
          action={
            <Link href="/calendario" className="text-link">
              Ver calendario <ArrowRight size={14} />
            </Link>
          }
        >
          {data.meetings
            .filter((m) => new Date(m.starts_at) > new Date())
            .slice(0, 3).length ? (
            data.meetings
              .filter((m) => new Date(m.starts_at) > new Date())
              .slice(0, 3)
              .map((m) => (
                <div className="list-item" key={m.id}>
                  <CalendarDays size={20} />
                  <div>
                    <strong>
                      {data.prospects.find((p) => p.id === m.prospect_id)?.name}
                    </strong>
                    <p>{date(m.starts_at)}</p>
                    <Badge>
                      {m.status === "proposed"
                        ? "Por confirmar"
                        : m.demo
                          ? "Simulada"
                          : "Confirmada"}
                    </Badge>
                  </div>
                </div>
              ))
          ) : (
            <Empty
              title="Espacio para nuevas conversaciones"
              detail="Las reuniones que propongas aparecerán aquí con su estado de confirmación."
            />
          )}
        </Panel>
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Prospectos prioritarios"
          action={
            <Link href="/prospectos" className="text-link">
              Ver todos <ArrowRight size={14} />
            </Link>
          }
        >
          {priority.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Estado</th>
                    <th>Prioridad</th>
                  </tr>
                </thead>
                <tbody>
                  {priority.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={"/prospectos/" + p.id}>
                          <b>{p.name}</b>
                          <small>{p.sector || "Sin sector"}</small>
                        </Link>
                      </td>
                      <td>
                        <Badge>{p.status}</Badge>
                      </td>
                      <td>
                        <span className="score">{p.score}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Tu cartera comienza con una empresa"
              detail="Busca y califica tu primer prospecto. Aquí verás las oportunidades con mayor compatibilidad."
            />
          )}
        </Panel>
        <Panel title="Actividad reciente">
          {data.activities.length ? (
            <div className="timeline">
              {data.activities.slice(0, 5).map((a) => (
                <div key={a.id}>
                  <span className="timeline-dot" />
                  <p>
                    {a.description}
                    <small>{date(a.created_at)}</small>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Todo listo para empezar"
              detail="Cada registro, análisis y contacto dejará aquí un historial verificable."
            />
          )}
        </Panel>
      </div>
    </>
  );
}
export function Statistics({ data }: { data: AppState }) {
  return (
    <>
      <PageTitle
        title="Estadísticas"
        description="Indicadores calculados a partir de los registros del modo actual."
      />
      <Metrics data={data} />
      <div className="dashboard-grid">
        <Panel title="Distribución del pipeline">
          <div className="bars">
            {[
              "Nuevo",
              "Pendiente de revisión",
              "Contactado",
              "Interesado",
              "Reunión confirmada",
              "Cliente",
              "No contactar",
            ].map((status) => {
              const n = data.prospects.filter(
                (p) => p.status === status,
              ).length;
              return (
                <div key={status}>
                  <div>
                    <span>{status}</span>
                    <b>{n}</b>
                  </div>
                  <div className="bar">
                    <i
                      style={{
                        width: `${data.prospects.length ? (n / data.prospects.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Presupuesto y costos">
          <div className="detail-block">
            <p>
              Importes en USD. Las reservas son topes estimados, no cargos
              confirmados.
            </p>
            <dl>
              <dt>Presupuesto diario</dt>
              <dd>{money(data.settings.daily_budget)}</dd>
              <dt>Llamada / minuto</dt>
              <dd>{money(data.settings.call_minute_cost)}</dd>
              <dt>Correo / envío</dt>
              <dd>{money(data.settings.email_cost)}</dd>
              <dt>Reserva / solicitud IA</dt>
              <dd>{money(data.settings.ai_request_cap)}</dd>
              <dt>Histórico reservado</dt>
              <dd>{money(data.costs.reserved)}</dd>
              <dt>Estimación registrada</dt>
              <dd>{money(data.costs.actual)}</dd>
            </dl>
            <p>
              La tasa de respuesta cuenta prospectos con respuesta registrada o
              interés en una llamada. La conversión usa clientes / total de
              prospectos. Los precios configurados deben cotejarse con cada
              proveedor.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
