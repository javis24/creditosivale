"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function ClientForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const confirmation = String(formData.get("confirmPassword") || "");

    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    formData.delete("confirmPassword");
    const payload = Object.fromEntries(formData.entries());
    setLoading(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, role: "cliente" }),
      });
      const result = await response.json();

      if (!response.ok) {
        const validationMessage = result.errors
          ? Object.values(result.errors).flat().find(Boolean)
          : null;
        setError(String(validationMessage || result.message || "No fue posible crear el cliente."));
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      router.push("/dashboard/clientes?created=1");
      router.refresh();
    } catch {
      setError("No fue posible conectarse. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="client-form" onSubmit={submit} noValidate>
      {error ? <div className="alert alert-error form-alert" role="alert">{error}</div> : null}

      <section className="form-section">
        <div className="form-section-heading">
          <span>1</span>
          <div>
            <h2>Datos personales</h2>
            <p>Información principal para identificar al cliente.</p>
          </div>
        </div>
        <div className="form-grid form-grid-3">
          <label className="field">
            <span>Nombre(s) *</span>
            <input name="firstName" autoComplete="given-name" required />
          </label>
          <label className="field">
            <span>Apellido paterno *</span>
            <input name="paternalLastName" autoComplete="family-name" required />
          </label>
          <label className="field">
            <span>Apellido materno</span>
            <input name="maternalLastName" />
          </label>
          <label className="field">
            <span>Fecha de nacimiento *</span>
            <input type="date" name="birthDate" autoComplete="bday" required />
          </label>
          <label className="field">
            <span>Género *</span>
            <select name="gender" defaultValue="no_especificado" required>
              <option value="no_especificado">No especificado</option>
              <option value="mujer">Mujer</option>
              <option value="hombre">Hombre</option>
            </select>
          </label>
          <label className="field">
            <span>Estado civil *</span>
            <select name="maritalStatus" defaultValue="soltero" required>
              <option value="soltero">Soltero(a)</option>
              <option value="casado">Casado(a)</option>
              <option value="union_libre">Unión libre</option>
              <option value="divorciado">Divorciado(a)</option>
              <option value="viudo">Viudo(a)</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <label className="field">
            <span>CURP</span>
            <input name="curp" maxLength={18} className="uppercase" />
          </label>
          <label className="field">
            <span>RFC</span>
            <input name="rfc" maxLength={13} className="uppercase" />
          </label>
          <label className="field">
            <span>Número de INE</span>
            <input name="ineNumber" maxLength={30} />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading">
          <span>2</span>
          <div>
            <h2>Contacto y acceso</h2>
            <p>El cliente podrá ingresar después con estas credenciales.</p>
          </div>
        </div>
        <div className="form-grid form-grid-2">
          <label className="field">
            <span>Teléfono *</span>
            <input name="phone" type="tel" autoComplete="tel" placeholder="871 123 4567" required />
          </label>
          <label className="field">
            <span>Correo electrónico *</span>
            <input name="email" type="email" autoComplete="email" placeholder="cliente@correo.com" required />
          </label>
          <label className="field">
            <span>Contraseña temporal *</span>
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
            <small>8 caracteres, con mayúscula, minúscula y número.</small>
          </label>
          <label className="field">
            <span>Confirmar contraseña *</span>
            <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading">
          <span>3</span>
          <div>
            <h2>Actividad económica</h2>
            <p>Datos que se utilizarán más adelante al evaluar una solicitud.</p>
          </div>
        </div>
        <div className="form-grid form-grid-3">
          <label className="field">
            <span>Ocupación *</span>
            <input name="occupation" required />
          </label>
          <label className="field">
            <span>Empresa o negocio</span>
            <input name="companyName" />
          </label>
          <label className="field">
            <span>Ingreso mensual *</span>
            <div className="input-prefix"><span>$</span><input name="monthlyIncome" type="number" min="0" step="0.01" required /></div>
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading">
          <span>4</span>
          <div>
            <h2>Domicilio</h2>
            <p>Dirección actual del cliente.</p>
          </div>
        </div>
        <div className="form-grid form-grid-3">
          <label className="field field-span-2">
            <span>Calle *</span>
            <input name="street" autoComplete="address-line1" required />
          </label>
          <label className="field">
            <span>Número exterior *</span>
            <input name="exteriorNumber" required />
          </label>
          <label className="field">
            <span>Número interior</span>
            <input name="interiorNumber" />
          </label>
          <label className="field field-span-2">
            <span>Colonia *</span>
            <input name="neighborhood" required />
          </label>
          <label className="field">
            <span>Código postal *</span>
            <input name="postalCode" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" required />
          </label>
          <label className="field">
            <span>Ciudad *</span>
            <input name="city" defaultValue="Gómez Palacio" autoComplete="address-level2" required />
          </label>
          <label className="field">
            <span>Estado *</span>
            <input name="state" defaultValue="Durango" autoComplete="address-level1" required />
          </label>
          <label className="field">
            <span>País *</span>
            <input name="country" defaultValue="México" autoComplete="country-name" required />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading">
          <span>5</span>
          <div>
            <h2>Contacto de emergencia</h2>
            <p>Información opcional para completar el expediente inicial.</p>
          </div>
        </div>
        <div className="form-grid form-grid-2">
          <label className="field">
            <span>Nombre completo</span>
            <input name="emergencyContactName" />
          </label>
          <label className="field">
            <span>Teléfono</span>
            <input name="emergencyContactPhone" type="tel" />
          </label>
          <label className="field field-span-2">
            <span>Notas internas</span>
            <textarea name="notes" rows={4} maxLength={2000} />
          </label>
        </div>
      </section>

      <div className="form-actions">
        <Link href="/dashboard/clientes" className="button button-secondary">Cancelar</Link>
        <button className="button button-primary" disabled={loading}>
          {loading ? "Guardando…" : "Guardar cliente"}
        </button>
      </div>
    </form>
  );
}
