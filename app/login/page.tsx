"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json();
      router.replace(result.user.role === "cliente" ? "/mi-cuenta" : "/dashboard");
    });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: form.get("identifier"),
          password: form.get("password"),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.message || "No fue posible iniciar sesión.");
        return;
      }

      router.replace(result.redirectTo);
      router.refresh();
    } catch {
      setError("No fue posible conectarse. Revisa tu conexión e intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="brand-mark" aria-hidden="true">CS</div>
        <p className="eyebrow">Administración de préstamos</p>
        <h1>Clientes y créditos, en un solo lugar.</h1>
        <p>
          Una base clara para administrar expedientes, préstamos, pagos y
          recordatorios de Crédito Sí Vale.
        </p>
        <div className="auth-feature-list">
          <span>Expedientes organizados</span>
          <span>Acceso por roles</span>
          <span>Datos protegidos</span>
        </div>
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div>
            <p className="eyebrow">Bienvenido</p>
            <h2>Iniciar sesión</h2>
            <p className="muted">Ingresa con tu número de WhatsApp y contraseña.</p>
          </div>

          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

          <label className="field">
            <span>WhatsApp o correo</span>
            <input
              type="text"
              name="identifier"
              placeholder="871 123 4567"
              autoComplete="username"
              inputMode="tel"
              required
            />
          </label>

          <label className="field">
            <span>Contraseña</span>
            <input
              type="password"
              name="password"
              placeholder="Tu contraseña"
              autoComplete="current-password"
              minLength={8}
              required
            />
          </label>

          <button className="button button-primary button-block" disabled={loading}>
            {loading ? "Ingresando…" : "Entrar al sistema"}
          </button>

          <p className="form-note">
            ¿Es tu primera vez? <Link href="/registro">Crear una cuenta</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
