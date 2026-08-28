import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { requirePageUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type SummaryRow = RowDataPacket & {
  pending: number;
  approved: number;
  rejected: number;
};

export default async function DashboardPage() {
  const user = await requirePageUser();
  if (user.role === "cliente") redirect("/mi-cuenta");
  const [rows] = await getDb().execute<SummaryRow[]>(
    `SELECT
       SUM(status = 'en_revision') AS pending,
       SUM(status = 'aprobado') AS approved,
       SUM(status = 'rechazado') AS rejected
       FROM loan_applications`,
  );
  const summary = rows[0] || { pending: 0, approved: 0, rejected: 0 };

  return (
    <main className="page-container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Panel principal</p>
          <h1>Hola, {user.name.split(" ")[0]}</h1>
          <p className="muted">
            Revisa solicitudes y administra los expedientes de tus clientes.
          </p>
        </div>
        <Link className="button button-primary" href="/dashboard/solicitudes">
          Revisar solicitudes
        </Link>
      </div>

      <section className="summary-grid">
        <article className="summary-card summary-card-accent">
          <span className="summary-icon">!</span>
          <p>Pendientes</p>
          <strong>{Number(summary.pending || 0)} en revisión</strong>
          <small>Esperan validación documental y resolución</small>
        </article>
        <article className="summary-card">
          <span className="summary-icon">✓</span>
          <p>Autorizadas</p>
          <strong>{Number(summary.approved || 0)} solicitudes</strong>
          <small>Listas para el futuro proceso de dispersión</small>
        </article>
        <article className="summary-card summary-card-muted">
          <span className="summary-icon">×</span>
          <p>No autorizadas</p>
          <strong>{Number(summary.rejected || 0)} solicitudes</strong>
          <small>Resoluciones registradas con su motivo</small>
        </article>
      </section>

      <section className="panel getting-started">
        <div>
          <p className="eyebrow">Flujo administrativo</p>
          <h2>Valida primero, decide después</h2>
          <p className="muted">
            Abre una solicitud, revisa cada documento y registra una resolución trazable.
          </p>
        </div>
        <Link className="button button-secondary" href="/dashboard/solicitudes">
          Ir a solicitudes
        </Link>
      </section>
    </main>
  );
}
