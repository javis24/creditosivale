"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formData.get("fullName"),
          birthDate: formData.get("birthDate"),
          address: formData.get("address"),
          whatsapp: formData.get("whatsapp"),
          postalCode: formData.get("postalCode"),
          password,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        const validationMessage = result.errors
          ? Object.values(result.errors).flat().find(Boolean)
          : null;
        setError(String(validationMessage || result.message || "No fue posible crear la cuenta."));
        return;
      }

      router.replace(result.redirectTo);
      router.refresh();
    } catch {
      setError("No fue posible conectarse. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="public-form-page">
      <section className="public-form-copy">
        <Link href="/login" className="public-brand">
          <span className="brand-mark brand-mark-small">CS</span>
          <strong>Crédito Sí Vale</strong>
        </Link>
        <p className="eyebrow">Crea tu cuenta</p>
        <h1>Solicita tu préstamo en línea.</h1>
        <p className="muted">
          Primero necesitamos algunos datos básicos. Después podrás completar
          tu solicitud y subir tus documentos oficiales de forma segura.
        </p>
        <ol className="public-steps">
          <li className="active"><span>1</span> Crear cuenta</li>
          <li><span>2</span> Solicitar préstamo</li>
          <li><span>3</span> Subir documentos</li>
        </ol>
      </section>

      <section className="public-form-panel">
        <form className="register-card" onSubmit={handleSubmit} noValidate>
          <div>
            <p className="eyebrow">Paso 1 de 3</p>
            <h2>Datos para comenzar</h2>
            <p className="muted">Todos los campos son obligatorios.</p>
          </div>

          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

          <label className="field">
            <span>Nombre completo</span>
            <input
              name="fullName"
              autoComplete="name"
              placeholder="Nombre y apellidos"
              minLength={5}
              required
            />
          </label>

          <label className="field">
            <span>Fecha de nacimiento</span>
            <input name="birthDate" type="date" autoComplete="bday" required />
          </label>

          <label className="field">
            <span>Dirección completa</span>
            <textarea
              name="address"
              autoComplete="street-address"
              placeholder="Calle, número y colonia"
              rows={3}
              minLength={10}
              required
            />
          </label>

          <div className="form-grid form-grid-2">
            <label className="field">
              <span>Número de WhatsApp</span>
              <input
                name="whatsapp"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="871 123 4567"
                required
              />
              <small>Este número será tu usuario para iniciar sesión.</small>
            </label>

            <label className="field">
              <span>Código postal</span>
              <input
                name="postalCode"
                inputMode="numeric"
                autoComplete="postal-code"
                pattern="[0-9]{5}"
                maxLength={5}
                placeholder="35000"
                required
              />
            </label>
          </div>

          <div className="form-grid form-grid-2">
            <label className="field">
              <span>Contraseña</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <small>Mayúscula, minúscula, número y mínimo 8 caracteres.</small>
            </label>

            <label className="field">
              <span>Confirmar contraseña</span>
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
          </div>

          <button className="button button-primary button-block" disabled={loading}>
            {loading ? "Creando cuenta…" : "Crear cuenta y continuar"}
          </button>

          <p className="form-note">
            ¿Ya tienes una cuenta? <Link href="/login">Inicia sesión</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
