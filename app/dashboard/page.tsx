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
  active_loans: number;
  pending_delivery: number;
  outstanding_balance: number;
};

export default async function DashboardPage() {
  const user = await requirePageUser();
  if (user.role === "cliente") redirect("/mi-cuenta");
  const [rows] = await getDb().execute<SummaryRow[]>(
    `SELECT
       SUM(status = 'en_revision') AS pending,
       SUM(status = 'aprobado') AS approved,
       SUM(status = 'rechazado') AS rejected,
       (SELECT COUNT(*) FROM loans WHERE status = 'activo') AS active_loans,
       (SELECT COUNT(*) FROM loans WHERE status = 'pendiente_desembolso')
         AS pending_delivery,
       (SELECT COALESCE(SUM(balance), 0) FROM loans WHERE status = 'activo')
         AS outstanding_balance
       FROM loan_applications`,
  );
  const summary = rows[0] || {
    pending: 0,
    approved: 0,
    rejected: 0,
    active_loans: 0,
    pending_delivery: 0,
    outstanding_balance: 0,
  };

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
          <p>Por entregar</p>
          <strong>{Number(summary.pending_delivery || 0)} créditos</strong>
          <small>Autorizados pendientes de activar</small>
        </article>
        <article className="summary-card">
          <span className="summary-icon">$</span>
          <p>Cartera activa</p>
          <strong>{Number(summary.active_loans || 0)} créditos</strong>
          <small>
            {new Intl.NumberFormat("es-MX", {
              style: "currency",
              currency: "MXN",
            }).format(Number(summary.outstanding_balance || 0))} por cobrar
          </small>
        </article>
        <article className="summary-card summary-card-muted">
          <span className="summary-icon">✓</span>
          <p>Autorizadas</p>
          <strong>{Number(summary.approved || 0)} solicitudes</strong>
          <small>{Number(summary.rejected || 0)} no autorizadas</small>
        </article>
      </section>

      <section className="panel getting-started">
        <div>
          <p className="eyebrow">Flujo administrativo</p>
          <h2>Del expediente al historial de pagos</h2>
          <p className="muted">
            Revisa solicitudes, activa créditos y registra cada pago en orden.
          </p>
        </div>
        <Link className="button button-secondary" href="/dashboard/creditos">
          Ir a créditos
        </Link>
      </section>
    </main>
  );
}
