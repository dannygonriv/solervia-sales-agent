"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Search,
  Megaphone,
  Phone,
  Mail,
  CalendarDays,
  Activity as ActivityIcon,
  BarChart3,
  Settings,
  LogOut,
  ShieldCheck,
  OctagonX,
  Menu,
  ChevronRight,
  CheckCircle2,
  X,
} from "lucide-react";
import type { AppState } from "@/lib/domain";
import { api, Badge, type Run } from "./ui";
import { Dashboard, Statistics } from "./dashboard";
import { Prospects, ProspectDetail } from "./prospects";
import { CompanySearch } from "./search";
import { Campaigns } from "./campaigns";
import { Emails, Calls } from "./communications";
import { Calendar, Activity } from "./operations";
import { SettingsPage } from "./settings";
const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/prospectos", label: "Prospectos", icon: Users },
  { href: "/buscar", label: "Buscar empresas", icon: Search },
  { href: "/campanas", label: "Campañas", icon: Megaphone },
  { href: "/llamadas", label: "Llamadas", icon: Phone },
  { href: "/correos", label: "Correos", icon: Mail },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/actividad", label: "Actividad", icon: ActivityIcon },
  { href: "/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];
export function Workspace() {
  const pathname = usePathname(),
    [data, setData] = useState<AppState | null>(null),
    [message, setMessage] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  const refresh = useCallback(
    async () => setData(await api<AppState>("state", "GET")),
    [],
  );
  useEffect(() => {
    let active = true;
    api<AppState>("state", "GET")
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setMessage({ text: e.message, error: true });
      });
    return () => {
      active = false;
    };
  }, []);
  const run: Run = async (action, success) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      if (success) setMessage({ text: success, error: false });
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Error inesperado.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };
  const current = navigation.find((n) =>
    n.href === "/" ? pathname === "/" : pathname.startsWith(n.href),
  );
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (open ? "is-open" : "")}>
        <Link href="/" className="brand">
          <span className="brand-mark">
            s<span>·</span>
          </span>
          <span>
            solervia<small>SALES AGENT</small>
          </span>
        </Link>
        <div className="workspace-label">WORKSPACE PRIVADO</div>
        <nav>
          {navigation.map((n, i) => (
            <Link
              onClick={() => setOpen(false)}
              href={n.href}
              className={
                (current?.href === n.href ? "active " : "") +
                (i === 9 ? "nav-settings" : "")
              }
              key={n.href}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.href === "/prospectos" && data && (
                <small>{data.prospects.length}</small>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={17} />
            <span>
              Tu operación, bajo control
              <small>Acceso exclusivo de Solervia</small>
            </span>
          </div>
          <button
            onClick={() =>
              run(async () => {
                await api("logout");
                window.location.href = "/login";
              })
            }
            className="profile"
          >
            <span className="profile-avatar">S</span>
            <span>
              Administrador<small>Solervia</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {open && (
        <button
          className="mobile-backdrop"
          aria-label="Cerrar navegación"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button menu-button"
              aria-label="Abrir menú"
              onClick={() => setOpen(!open)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{current?.label || "Prospecto"}</b>
          </div>
          <div className="topbar-actions">
            <span className="location">Guadalajara, MX</span>
            <Badge
              tone={data?.settings.mode === "production" ? "green" : "amber"}
            >
              <span className="status-dot" />
              {data?.settings.mode === "production"
                ? "Producción"
                : "Modo demostración"}
            </Badge>
          </div>
        </header>
        <main>
          {data?.settings.emergency && (
            <div className="emergency-banner">
              <OctagonX size={20} />
              <span>
                Parada de emergencia activa. Los nuevos contactos están
                bloqueados.
              </span>
              <Link href="/configuracion">Revisar configuración</Link>
            </div>
          )}
          {data?.settings.mode === "demo" && (
            <div className="demo-notice">
              <ShieldCheck size={15} />
              <span>
                Estás en un entorno de demostración. No se realizan llamadas,
                envíos ni cargos externos.
              </span>
            </div>
          )}
          {message && (
            <div
              className={"toast " + (message.error ? "error" : "success")}
              role={message.error ? "alert" : "status"}
            >
              {message.error ? (
                <OctagonX size={18} />
              ) : (
                <CheckCircle2 size={18} />
              )}
              <span>{message.text}</span>
              <button
                className="icon-button"
                aria-label="Cerrar aviso"
                onClick={() => setMessage(null)}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {busy && <div className="loading-bar" aria-label="Procesando" />}
          {!data ? (
            <div className="loading-state">
              {message?.error
                ? "No se pudo cargar el workspace."
                : "Preparando tu workspace…"}
              {message?.error && (
                <button
                  className="button secondary"
                  onClick={() => run(refresh)}
                >
                  Reintentar
                </button>
              )}
            </div>
          ) : pathname === "/" ? (
            <Dashboard data={data} />
          ) : pathname === "/prospectos" ? (
            <Prospects data={data} run={run} />
          ) : pathname.startsWith("/prospectos/") ? (
            <ProspectDetail id={pathname.split("/")[2]} data={data} run={run} />
          ) : pathname === "/buscar" ? (
            <CompanySearch data={data} run={run} />
          ) : pathname === "/campanas" ? (
            <Campaigns data={data} run={run} />
          ) : pathname === "/llamadas" ? (
            <Calls data={data} run={run} />
          ) : pathname === "/correos" ? (
            <Emails data={data} run={run} />
          ) : pathname === "/calendario" ? (
            <Calendar data={data} run={run} />
          ) : pathname === "/actividad" ? (
            <Activity data={data} run={run} />
          ) : pathname === "/estadisticas" ? (
            <Statistics data={data} />
          ) : pathname === "/configuracion" ? (
            <SettingsPage data={data} run={run} />
          ) : (
            <p>Página no encontrada.</p>
          )}
          <footer className="workspace-footer">
            <span>Solervia Sales Agent · Relaciones antes que volumen.</span>
            <button
              disabled={busy || !data || data.settings.emergency}
              onClick={() =>
                run(() => api("emergency"), "Todas las campañas se pausaron.")
              }
            >
              <OctagonX size={14} />
              Detener campañas
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
}
