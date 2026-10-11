"use client";
import { useState } from "react";
import { Search, MapPin, Plus, Clock3 } from "lucide-react";
import type { AppState, SearchFilters } from "@/lib/domain";
import {
  api,
  Form,
  PageTitle,
  Panel,
  Empty,
  Badge,
  type Run,
  date,
} from "./ui";
interface Result {
  name: string;
  sector: string | null;
  city: string | null;
  size: string | null;
  source: string;
  source_id: string;
  demo: boolean;
  email: string | null;
}
export function CompanySearch({ data, run }: { data: AppState; run: Run }) {
  const [results, setResults] = useState<Result[] | null>(null),
    [filters, setFilters] = useState<SearchFilters | null>(null),
    [imported, setImported] = useState<string[]>([]);
  return (
    <>
      <PageTitle
        title="Encuentra tu próxima oportunidad."
        eyebrow="DIRECTORIO DE EMPRESAS"
        description="Explora negocios por ubicación y actividad. Tú decides cuáles investigar."
      />
      <div className="search-layout">
        <Panel title="Criterios de búsqueda">
          <Form
            fields={[
              {
                name: "keyword",
                label: "Palabras clave",
                hint: "Ejemplo: restaurantes, talleres, comercio",
              },
              { name: "city", label: "Ciudad" },
              { name: "municipality", label: "Municipio" },
              {
                name: "state_code",
                label: "Clave de entidad INEGI",
                required: true,
                hint: "14 = Jalisco. Puedes usar otras entidades.",
              },
              { name: "sector", label: "Sector (texto)" },
              { name: "activity", label: "Actividad económica" },
              {
                name: "size",
                label: "Personal ocupado",
                type: "select",
                options: [
                  "0 a 5 personas",
                  "6 a 10 personas",
                  "11 a 30 personas",
                  "31 a 50 personas",
                  "51 a 100 personas",
                  "101 a 250 personas",
                  "251 y más personas",
                ].map((v) => ({ value: v, label: v })),
              },
              {
                name: "page",
                label: "Página del directorio",
                type: "number",
                min: 1,
                max: 100,
              },
            ]}
            initial={{ city: data.settings.city, state_code: "14", page: 1 }}
            label="Buscar empresas"
            onSubmit={async (v) => {
              const f = v as unknown as SearchFilters;
              setFilters(f);
              const r = await api<{ companies: Result[] }>("search", "POST", f);
              setResults(r.companies);
            }}
          />
          <div className="source-note">
            <MapPin size={16} />
            <p>
              {data.settings.mode === "demo"
                ? "Catálogo ficticio para probar el flujo. No se consulta INEGI."
                : "Fuente: API oficial DENUE, INEGI. Filtros de ciudad, sector y tamaño aplicados al lote actual de 50 registros."}
            </p>
          </div>
        </Panel>
        <Panel
          title={
            results
              ? `${results.length} empresas encontradas`
              : "Resultados de búsqueda"
          }
          action={
            <Badge tone={data.settings.mode === "demo" ? "amber" : "blue"}>
              {data.settings.mode === "demo"
                ? "Datos ficticios"
                : "DENUE · INEGI"}
            </Badge>
          }
        >
          {results === null ? (
            <Empty
              title="Primero, define a quién buscas"
              detail="Combina una ubicación con la actividad de las empresas que quieres conocer."
            />
          ) : !results.length ? (
            <Empty
              title="No encontramos coincidencias en este lote"
              detail="Amplía los filtros o consulta la siguiente página del directorio."
            />
          ) : (
            <>
              <div className="result-list">
                {results.map((r) => (
                  <article key={r.source_id}>
                    <span className="avatar">
                      <Search size={18} />
                    </span>
                    <div>
                      <h3>{r.name}</h3>
                      <p>{r.sector || "Sin actividad registrada"}</p>
                      <small>
                        {r.city} · {r.size || "Tamaño no disponible"}
                      </small>
                    </div>
                    <button
                      className="button secondary"
                      disabled={
                        imported.includes(r.source_id) ||
                        data.prospects.some(
                          (p) =>
                            p.source_id === r.source_id &&
                            p.source === r.source,
                        )
                      }
                      onClick={() =>
                        run(async () => {
                          await api("prospects", "POST", r);
                          setImported((v) => [...v, r.source_id]);
                        }, "Prospecto guardado sin duplicados.")
                      }
                    >
                      <Plus size={15} />
                      {imported.includes(r.source_id) ||
                      data.prospects.some(
                        (p) =>
                          p.source_id === r.source_id && p.source === r.source,
                      )
                        ? "Registrado"
                        : "Registrar"}
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}{" "}
          {filters && (
            <div className="panel-footer">
              <button
                className="button secondary"
                onClick={() =>
                  run(
                    () =>
                      api("searches", "POST", {
                        name: `${filters.keyword || "Empresas"} · ${filters.city}`,
                        filters,
                        interval_hours: 24,
                      }),
                    "Búsqueda diaria programada.",
                  )
                }
              >
                <Clock3 size={16} />
                Programar esta búsqueda cada 24 h
              </button>
            </div>
          )}
        </Panel>
      </div>
      {data.searches.length > 0 && (
        <Panel title="Búsquedas programadas">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Búsqueda</th>
                  <th>Frecuencia</th>
                  <th>Próxima ejecución</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.searches.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.interval_hours} horas</td>
                    <td>{date(s.next_run)}</td>
                    <td>{s.active ? "Activa" : "Pausada"}</td>
                    <td>
                      <button
                        className="text-link"
                        onClick={() =>
                          run(() =>
                            api("searches/" + s.id, "PATCH", {
                              active: !s.active,
                            }),
                          )
                        }
                      >
                        {s.active ? "Pausar" : "Reanudar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
