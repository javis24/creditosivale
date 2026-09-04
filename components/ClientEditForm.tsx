"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ClientDetail = {
  uuid: string;
  first_name: string;
  paternal_last_name: string;
  maternal_last_name: string | null;
  email: string | null;
  phone: string;
  status: "activo" | "inactivo" | "bloqueado";
  birth_date: string;
  curp: string | null;
  rfc: string | null;
  ine_number: string | null;
  gender: "mujer" | "hombre" | "no_especificado";
  marital_status: "soltero" | "casado" | "union_libre" | "divorciado" | "viudo" | "otro" | null;
  occupation: string | null;
  company_name: string | null;
  monthly_income: number | null;
  address: string | null;
  street: string | null;
  exterior_number: string | null;
  interior_number: string | null;
  neighborhood: string | null;
  postal_code: string;
  city: string | null;
  state: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  application_count: number;
  loan_count: number;
  payment_count: number;
};

function validationMessage(result: { message?: string; errors?: Record<string, string[]> }) {
  const firstError = result.errors
    ? Object.values(result.errors).flat().find(Boolean)
    : null;

  return String(firstError || result.message || "No fue posible completar la operación.");
}

export default function ClientEditForm({ uuid }: { uuid: string }) {
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadClient() {
      try {
        const response = await fetch(`/api/users/${uuid}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json();

        if (!response.ok) throw new Error(result.message || "No se pudo cargar el cliente.");
        setClient(result.user);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Ocurrió un error.");
      } finally {
        setLoading(false);
      }
    }

    void loadClient();
    return () => controller.abort();
  }, [uuid]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const formData = new FormData(event.currentTarget);
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch(`/api/users/${uuid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(validationMessage(result));
      setSuccess(result.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ocurrió un error.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteClient() {
    if (confirmation !== "ELIMINAR") return;

    setError("");
    setSuccess("");
    setDeleting(true);

    try {
      const response = await fetch(`/api/users/${uuid}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(validationMessage(result));
      router.replace("/dashboard/clientes?deleted=1");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ocurrió un error.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setDeleting(false);
    }
  }

  if (loading) return <section className="panel review-loading">Cargando expediente…</section>;
  if (!client) return <div className="alert alert-error">{error || "Cliente no encontrado."}</div>;

  const hasHistory = Number(client.application_count) > 0;

  return (
    <div className="client-admin-editor">
      {error ? <div className="alert alert-error form-alert" role="alert">{error}</div> : null}
      {success ? <div className="alert alert-success form-alert" role="status">{success}</div> : null}

      <form className="client-form" onSubmit={save} noValidate>
        <section className="panel form-section">
          <div className="form-section-heading">
            <span>1</span>
            <div><h2>Datos personales</h2><p>Identidad y estado de acceso del cliente.</p></div>
          </div>
          <div className="form-grid form-grid-3">
            <label className="field"><span>Nombre(s) *</span><input name="firstName" defaultValue={client.first_name} required /></label>
            <label className="field"><span>Apellido paterno</span><input name="paternalLastName" defaultValue={client.paternal_last_name} /></label>
            <label className="field"><span>Apellido materno</span><input name="maternalLastName" defaultValue={client.maternal_last_name || ""} /></label>
            <label className="field"><span>Fecha de nacimiento *</span><input type="date" name="birthDate" defaultValue={client.birth_date} required /></label>
            <label className="field">
              <span>Género *</span>
              <select name="gender" defaultValue={client.gender || "no_especificado"}>
                <option value="no_especificado">No especificado</option>
                <option value="mujer">Mujer</option>
                <option value="hombre">Hombre</option>
              </select>
            </label>
            <label className="field">
              <span>Estado civil</span>
              <select name="maritalStatus" defaultValue={client.marital_status || ""}>
                <option value="">Sin especificar</option>
                <option value="soltero">Soltero(a)</option>
                <option value="casado">Casado(a)</option>
                <option value="union_libre">Unión libre</option>
                <option value="divorciado">Divorciado(a)</option>
                <option value="viudo">Viudo(a)</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label className="field"><span>CURP</span><input name="curp" maxLength={18} className="uppercase" defaultValue={client.curp || ""} /></label>
            <label className="field"><span>RFC</span><input name="rfc" maxLength={13} className="uppercase" defaultValue={client.rfc || ""} /></label>
            <label className="field"><span>Número de INE</span><input name="ineNumber" maxLength={30} defaultValue={client.ine_number || ""} /></label>
          </div>
        </section>

        <section className="panel form-section">
          <div className="form-section-heading">
            <span>2</span>
            <div><h2>Contacto y acceso</h2><p>El WhatsApp continuará siendo el usuario para iniciar sesión.</p></div>
          </div>
          <div className="form-grid form-grid-3">
            <label className="field"><span>WhatsApp *</span><input name="phone" type="tel" defaultValue={client.phone} required /></label>
            <label className="field"><span>Correo electrónico</span><input name="email" type="email" defaultValue={client.email || ""} /></label>
            <label className="field">
              <span>Estado de la cuenta *</span>
              <select name="status" defaultValue={client.status}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
              <small>Una cuenta inactiva o bloqueada no puede iniciar sesión.</small>
            </label>
          </div>
        </section>

        <section className="panel form-section">
          <div className="form-section-heading">
            <span>3</span>
            <div><h2>Actividad económica</h2><p>Datos utilizados durante la evaluación del crédito.</p></div>
          </div>
          <div className="form-grid form-grid-3">
            <label className="field"><span>Ocupación</span><input name="occupation" defaultValue={client.occupation || ""} /></label>
            <label className="field"><span>Empresa o negocio</span><input name="companyName" defaultValue={client.company_name || ""} /></label>
            <label className="field"><span>Ingreso mensual *</span><div className="input-prefix"><span>$</span><input name="monthlyIncome" type="number" min="0" step="0.01" defaultValue={client.monthly_income || 0} required /></div></label>
          </div>
        </section>

        <section className="panel form-section">
          <div className="form-section-heading">
            <span>4</span>
            <div><h2>Domicilio</h2><p>Puedes conservar la dirección general o completar los campos separados.</p></div>
          </div>
          <div className="form-grid form-grid-3">
            <label className="field field-span-2"><span>Dirección general</span><textarea name="address" rows={3} defaultValue={client.address || ""} /></label>
            <label className="field"><span>Código postal *</span><input name="postalCode" inputMode="numeric" maxLength={5} defaultValue={client.postal_code} required /></label>
            <label className="field field-span-2"><span>Calle</span><input name="street" defaultValue={client.street || ""} /></label>
            <label className="field"><span>Número exterior</span><input name="exteriorNumber" defaultValue={client.exterior_number || ""} /></label>
            <label className="field"><span>Número interior</span><input name="interiorNumber" defaultValue={client.interior_number || ""} /></label>
            <label className="field field-span-2"><span>Colonia</span><input name="neighborhood" defaultValue={client.neighborhood || ""} /></label>
            <label className="field"><span>Ciudad</span><input name="city" defaultValue={client.city || ""} /></label>
            <label className="field"><span>Estado</span><input name="state" defaultValue={client.state || ""} /></label>
            <label className="field"><span>País *</span><input name="country" defaultValue={client.country || "México"} required /></label>
          </div>
        </section>

        <section className="panel form-section">
          <div className="form-section-heading">
            <span>5</span>
            <div><h2>Contacto de emergencia</h2><p>Información complementaria del expediente.</p></div>
          </div>
          <div className="form-grid form-grid-2">
            <label className="field"><span>Nombre completo</span><input name="emergencyContactName" defaultValue={client.emergency_contact_name || ""} /></label>
            <label className="field"><span>Teléfono</span><input name="emergencyContactPhone" type="tel" defaultValue={client.emergency_contact_phone || ""} /></label>
            <label className="field field-span-2"><span>Notas internas</span><textarea name="notes" rows={4} maxLength={2000} defaultValue={client.notes || ""} /></label>
          </div>
        </section>

        <div className="form-actions">
          <Link href="/dashboard/clientes" className="button button-secondary">Cancelar</Link>
          <button className="button button-primary" disabled={saving || deleting}>{saving ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      </form>

      <section className="panel client-danger-zone">
        <div>
          <p className="eyebrow">Zona de peligro</p>
          <h2>Eliminar cuenta definitivamente</h2>
          <p className="muted">
            {hasHistory
              ? "Este cliente ya tiene historial financiero y no puede eliminarse. Puedes cambiar su estado a Inactivo."
              : "Se eliminarán su cuenta, perfil y datos bancarios. Esta acción no se puede deshacer."}
          </p>
          <div className="client-history-summary">
            <span>{Number(client.application_count)} solicitudes</span>
            <span>{Number(client.loan_count)} créditos</span>
            <span>{Number(client.payment_count)} pagos</span>
          </div>
        </div>
        <div className="client-delete-confirmation">
          <label className="field">
            <span>Escribe ELIMINAR para confirmar</span>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={hasHistory || deleting}
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            className="button button-danger"
            onClick={deleteClient}
            disabled={hasHistory || confirmation !== "ELIMINAR" || deleting || saving}
          >
            {deleting ? "Eliminando…" : "Eliminar cliente"}
          </button>
        </div>
      </section>
    </div>
  );
}
