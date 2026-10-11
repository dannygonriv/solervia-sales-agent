"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Plus, ArrowUpRight, Inbox } from "lucide-react";
export const money = (v: unknown) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
export const date = (v: string | null | undefined) =>
  v
    ? new Intl.DateTimeFormat("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Mexico_City",
      }).format(new Date(v))
    : "Sin fecha";
export const datetimeInput = (v?: string | null) => {
  const d = v ? new Date(v) : new Date(Date.now() + 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export async function api<T = Record<string, unknown>>(
  path: string,
  method = "POST",
  data?: unknown,
): Promise<T> {
  const res = await fetch("/api/" + path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await res.json();
  if (res.status === 401) window.location.href = "/login";
  if (!res.ok)
    throw new Error(result.error || "No fue posible completar la operación.");
  return result;
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={24} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow || "SOLERVIA SALES AGENT"}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
export function AddButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="button primary" onClick={onClick}>
      <Plus size={17} />
      {children}
    </button>
  );
}
export function Arrow() {
  return <ArrowUpRight size={16} />;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} className="modal">
      <div className="modal-head">
        <h2>{title}</h2>
        <button aria-label="Cerrar" className="icon-button" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export interface Field {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "number"
    | "textarea"
    | "select"
    | "datetime-local"
    | "checkbox"
    | "password"
    | "url";
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  min?: number;
  max?: number;
  step?: string;
}
export function Form({
  fields,
  initial = {},
  onSubmit,
  label = "Guardar",
  children,
}: {
  fields: Field[];
  initial?: Record<string, unknown>;
  onSubmit: (v: Record<string, unknown>) => Promise<unknown>;
  label?: string;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const fd = new FormData(e.currentTarget),
          values: Record<string, unknown> = {};
        for (const f of fields)
          values[f.name] =
            f.type === "checkbox"
              ? fd.has(f.name)
              : f.type === "number"
                ? Number(fd.get(f.name))
                : String(fd.get(f.name) || "");
        try {
          await onSubmit(values);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Error al guardar.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.name} className={f.type === "textarea" ? "full" : ""}>
            <span>{f.label}</span>
            {f.type === "select" ? (
              <select
                name={f.name}
                aria-label={f.label}
                required={f.required}
                defaultValue={String(initial[f.name] ?? "")}
              >
                <option value="">Seleccionar</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                name={f.name}
                aria-label={f.label}
                defaultValue={String(initial[f.name] ?? "")}
                required={f.required}
                rows={4}
              />
            ) : f.type === "checkbox" ? (
              <input
                name={f.name}
                aria-label={f.label}
                type="checkbox"
                defaultChecked={Boolean(initial[f.name])}
              />
            ) : (
              <input
                name={f.name}
                aria-label={f.label}
                type={f.type || "text"}
                required={f.required}
                defaultValue={String(initial[f.name] ?? "")}
                min={f.min}
                max={f.max}
                step={f.step}
              />
            )}{" "}
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}
      </div>
      {children}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-footer">
        <button className="button primary" disabled={busy}>
          {busy ? "Guardando…" : label}
        </button>
      </div>
    </form>
  );
}
export type Run = (
  action: () => Promise<unknown>,
  success?: string,
) => Promise<void>;
