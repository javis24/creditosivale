import Link from "next/link";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requirePageUser();
  const isClient = user.role === "cliente";

  return (
    <main className="page-container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Panel principal</p>
          <h1>Hola, {user.name.split(" ")[0]}</h1>
          <p className="muted">
            {isClient
              ? "Tu cuenta ya se encuentra activa."
              : "Administra los expedientes de tus clientes desde aquí."}
          </p>
        </div>
        {!isClient ? (
          <Link className="button button-primary" href="/dashboard/clientes/nuevo">
            Registrar cliente
          </Link>
        ) : null}
      </div>

      <section className="summary-grid">
        <article className="summary-card summary-card-accent">
          <span className="summary-icon">01</span>
          <p>Primera fase</p>
          <strong>Acceso seguro</strong>
          <small>Sesiones y permisos por rol listos</small>
        </article>
        <article className="summary-card">
          <span className="summary-icon">02</span>
          <p>Módulo activo</p>
          <strong>Clientes</strong>
          <small>Alta y consulta de expedientes</small>
        </article>
        <article className="summary-card summary-card-muted">
          <span className="summary-icon">03</span>
          <p>Siguiente fase</p>
          <strong>Préstamos y pagos</strong>
          <small>Preparado para integrarse después</small>
        </article>
      </section>

      {!isClient ? (
        <section className="panel getting-started">
          <div>
            <p className="eyebrow">Comienza aquí</p>
            <h2>Crea el primer expediente de cliente</h2>
            <p className="muted">
              Captura sus datos de contacto, identificación, actividad económica y domicilio.
            </p>
          </div>
          <Link className="button button-secondary" href="/dashboard/clientes">
            Ver clientes
          </Link>
        </section>
      ) : null}
    </main>
  );
}
