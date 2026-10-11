"use client";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
export default function Login() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand light">
          <span className="brand-mark">
            s<span>·</span>
          </span>
          <span>
            solervia<small>SALES AGENT</small>
          </span>
        </div>
        <div>
          <span className="eyebrow">MENOS TAREAS. MÁS CONVERSACIONES.</span>
          <h1>
            Las buenas relaciones
            <br />
            empiezan con una
            <br />
            <em>oportunidad.</em>
          </h1>
          <p>
            Un espacio para encontrar empresas, entender sus necesidades y dar
            el siguiente paso.
          </p>
        </div>
        <span className="login-caption">
          SOLERVIA PRODUCTS + SOLERVIA CUSTOM
        </span>
      </section>
      <section className="login-form">
        <div className="login-box">
          <span className="login-shield">
            <ShieldCheck size={24} />
          </span>
          <h2>
            Tu operación comercial,
            <br />
            en un solo lugar.
          </h2>
          <p>Inicia sesión en el workspace privado de Solervia.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(e.currentTarget);
              try {
                const res = await fetch("/api/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    email: form.get("email"),
                    password: form.get("password"),
                  }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                window.location.href = "/";
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Error al iniciar sesión.",
                );
                setBusy(false);
              }
            }}
          >
            <label>
              Correo del administrador
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="tu@solervia.com"
              />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Tu contraseña"
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? "Iniciando sesión…" : "Entrar al workspace"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="login-private">
            <ShieldCheck size={14} />
            Herramienta interna · Acceso restringido
          </p>
        </div>
      </section>
    </main>
  );
}
