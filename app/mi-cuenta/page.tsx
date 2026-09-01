import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import ClientLogoutButton from "@/components/ClientLogoutButton";
import { requirePageUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const metadata = { title: "Mi cuenta" };
export const dynamic = "force-dynamic";

type ApplicationRow = RowDataPacket & {
  uuid: string;
  status: "borrador" | "en_revision" | "aprobado" | "rechazado" | "cancelado";
  requested_amount: number;
  rejection_reason: string | null;
};

type NotificationRow = RowDataPacket & {
  title: string;
  message: string;
  created_at: string;
};

type LoanRow = RowDataPacket & {
  id: number;
  uuid: string;
  status: "pendiente_desembolso" | "activo" | "liquidado" | "cancelado";
  principal: number;
  term_fortnights: number;
  installment_amount: number;
  total_due: number;
  amount_paid: number;
  balance: number;
  disbursement_date: string | null;
  maturity_date: string | null;
  liquidated_at: string | null;
  created_at: string;
};

type InstallmentRow = RowDataPacket & {
  installment_number: number;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  status: string;
  paid_at: string | null;
};

type PaymentRow = RowDataPacket & {
  uuid: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const date = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeZone: "America/Monterrey",
});

const loanStatusLabels: Record<string, string> = {
  pendiente_desembolso: "Autorizado, pendiente de entrega",
  activo: "Activo",
  liquidado: "Liquidado",
  cancelado: "Cancelado",
};

const paymentMethodLabels: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  deposito: "Depósito",
  otro: "Otro",
};

function formatDate(value: string | null) {
  return value ? date.format(new Date(`${value}T12:00:00-06:00`)) : "Pendiente";
}

function currentWeek(disbursementDate: string | null, maxWeeks: number) {
  if (!disbursementDate) return null;
  const start = new Date(`${disbursementDate}T12:00:00-06:00`).getTime();
  const elapsed = Math.max(0, Date.now() - start);
  return Math.min(maxWeeks, Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1);
}

export default async function ClientAccountPage() {
  const user = await requirePageUser();
  if (user.role !== "cliente") redirect("/dashboard");

  const db = getDb();
  const [[applications], [notifications], [loans]] = await Promise.all([
    db.execute<ApplicationRow[]>(
      `SELECT uuid, status, requested_amount, rejection_reason
         FROM loan_applications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [user.id],
    ),
    db.execute<NotificationRow[]>(
      `SELECT title, message, created_at
         FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 3`,
      [user.id],
    ),
    db.execute<LoanRow[]>(
      `SELECT id, uuid, status, principal, term_fortnights,
              installment_amount, total_due, amount_paid, balance,
              disbursement_date, maturity_date, liquidated_at, created_at
         FROM loans
        WHERE user_id = ?
        ORDER BY FIELD(status, 'activo', 'pendiente_desembolso',
                       'liquidado', 'cancelado'),
                 created_at DESC
        LIMIT 12`,
      [user.id],
    ),
  ]);

  const application = applications[0];
  const loan =
    loans.find((item) => ["activo", "pendiente_desembolso"].includes(item.status)) ||
    loans[0];

  let installments: InstallmentRow[] = [];
  let payments: PaymentRow[] = [];
  if (loan) {
    [[installments], [payments]] = await Promise.all([
      db.execute<InstallmentRow[]>(
        `SELECT installment_number, due_date, amount_due, amount_paid,
                status, paid_at
           FROM loan_installments
          WHERE loan_id = ?
          ORDER BY installment_number`,
        [loan.id],
      ),
      db.execute<PaymentRow[]>(
        `SELECT uuid, amount, payment_date, payment_method, reference
           FROM loan_payments
          WHERE loan_id = ?
          ORDER BY payment_date DESC, created_at DESC`,
        [loan.id],
      ),
    ]);
  }

  const nextInstallment =
    installments.find((item) => Number(item.amount_paid) < Number(item.amount_due)) ||
    null;
  const paidInstallments = installments.filter((item) => item.status === "pagado").length;
  const hasOpenLoan = loans.some((item) =>
    ["activo", "pendiente_desembolso"].includes(item.status),
  );
  const hasOpenApplication = ["borrador", "en_revision"].includes(
    application?.status || "",
  );
  const canApply = !hasOpenLoan && !hasOpenApplication;
  const week = loan
    ? currentWeek(loan.disbursement_date, Number(loan.term_fortnights) * 2)
    : null;

  return (
    <main className="client-portal">
      <header className="client-header">
        <Link href="/mi-cuenta" className="public-brand">
          <span className="brand-mark brand-mark-small">CS</span>
          <strong>Crédito Sí Vale</strong>
        </Link>
        <ClientLogoutButton />
      </header>

      <section className="client-welcome">
        <div>
          <p className="eyebrow">Mi cuenta</p>
          <h1>Hola, {user.name.split(" ")[0]}</h1>
          <p className="muted">
            {loan?.status === "activo"
              ? "Consulta tu siguiente pago, avance e historial."
              : loan?.status === "pendiente_desembolso"
                ? "Tu crédito fue autorizado y está pendiente de entrega."
                : loan?.status === "liquidado"
                  ? "Terminaste tu crédito. Ya puedes solicitar uno nuevo."
                  : application?.status === "en_revision"
                    ? "Tu solicitud está en proceso de autorización."
                    : "Tu cuenta está lista para solicitar un préstamo."}
          </p>
        </div>
        {canApply ? (
          <Link className="button button-primary" href="/solicitar-prestamo">
            Solicitar nuevo préstamo
          </Link>
        ) : application?.status === "borrador" ? (
          <Link className="button button-primary" href="/solicitar-prestamo">
            Continuar solicitud
          </Link>
        ) : null}
      </section>

      {notifications.map((notification, index) => (
        <section className="client-notification" key={`${notification.created_at}-${index}`}>
          <span>✓</span>
          <div>
            <strong>{notification.title}</strong>
            <p>{notification.message}</p>
          </div>
        </section>
      ))}

      {loan ? (
        <>
          <section className="panel client-loan-card">
            <div className="client-loan-heading">
              <div>
                <p className="eyebrow">Mi crédito</p>
                <h2>{money.format(Number(loan.balance))} pendientes</h2>
                <span className={`status status-${loan.status}`}>
                  {loanStatusLabels[loan.status]}
                </span>
              </div>
              <div className="client-loan-progress">
                <strong>
                  {loan.total_due
                    ? Math.round((Number(loan.amount_paid) / Number(loan.total_due)) * 100)
                    : 0}%
                </strong>
                <span>pagado</span>
              </div>
            </div>

            <div className="client-loan-stat-grid">
              <div>
                <span>Pago quincenal</span>
                <strong>{money.format(Number(loan.installment_amount))}</strong>
              </div>
              <div>
                <span>Semana del crédito</span>
                <strong>{week ? `${week} de ${Number(loan.term_fortnights) * 2}` : "Por iniciar"}</strong>
              </div>
              <div>
                <span>Quincena actual</span>
                <strong>
                  {nextInstallment
                    ? `${nextInstallment.installment_number} de ${loan.term_fortnights}`
                    : loan.status === "liquidado" ? "Completada" : "Por iniciar"}
                </strong>
              </div>
              <div>
                <span>Próximo pago</span>
                <strong>
                  {nextInstallment
                    ? money.format(
                        Number(nextInstallment.amount_due) -
                          Number(nextInstallment.amount_paid),
                      )
                    : "—"}
                </strong>
                <small>{formatDate(nextInstallment?.due_date || null)}</small>
              </div>
            </div>
          </section>

          <section className="panel client-history-panel">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">Calendario</p>
                <h2>Avance de mis quincenas</h2>
              </div>
              <strong>{paidInstallments}/{loan.term_fortnights} pagadas</strong>
            </div>
            {installments.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Quincena</th>
                      <th>Fecha</th>
                      <th>Importe</th>
                      <th>Pagado</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installments.map((item) => {
                      const overdue =
                        item.status !== "pagado" &&
                        item.due_date < new Date().toISOString().slice(0, 10);
                      return (
                        <tr key={item.installment_number}>
                          <td><strong>{item.installment_number}</strong></td>
                          <td>{formatDate(item.due_date)}</td>
                          <td>{money.format(Number(item.amount_due))}</td>
                          <td>{money.format(Number(item.amount_paid))}</td>
                          <td>
                            <span className={`status status-${overdue ? "vencido" : item.status}`}>
                              {overdue ? "Vencido" : item.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-copy">
                El calendario aparecerá cuando el crédito sea entregado.
              </p>
            )}
          </section>

          <section className="panel client-history-panel">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">Movimientos</p>
                <h2>Mi historial de pagos</h2>
              </div>
              <strong>{payments.length} pagos</strong>
            </div>
            {payments.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Monto</th>
                      <th>Forma</th>
                      <th>Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.uuid}>
                        <td>{formatDate(payment.payment_date)}</td>
                        <td><strong>{money.format(Number(payment.amount))}</strong></td>
                        <td>{paymentMethodLabels[payment.payment_method]}</td>
                        <td>{payment.reference || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-copy">Aún no hay pagos registrados.</p>
            )}
          </section>

          <section className="panel client-history-panel">
            <div className="section-heading-inline">
              <div>
                <p className="eyebrow">Créditos anteriores</p>
                <h2>Historial de préstamos</h2>
              </div>
            </div>
            <div className="client-loan-history-list">
              {loans.map((item) => (
                <article key={item.uuid}>
                  <div>
                    <strong>{money.format(Number(item.principal))}</strong>
                    <span>{loanStatusLabels[item.status]}</span>
                  </div>
                  <div>
                    <strong>{money.format(Number(item.amount_paid))} pagados</strong>
                    <span>{formatDate(item.liquidated_at?.slice(0, 10) || item.disbursement_date)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="client-progress-grid">
          <article className="progress-card complete">
            <span>✓</span>
            <small>Paso 1</small>
            <strong>Cuenta creada</strong>
            <p>Tus datos básicos quedaron registrados.</p>
          </article>
          <article className={application ? "progress-card complete" : "progress-card current"}>
            <span>{application ? "✓" : "2"}</span>
            <small>Paso 2</small>
            <strong>Solicitar préstamo</strong>
            <p>Selecciona monto, plazo y pago quincenal.</p>
          </article>
          <article className={application?.status === "en_revision" ? "progress-card current" : "progress-card"}>
            <span>3</span>
            <small>Paso 3</small>
            <strong>Autorización</strong>
            <p>
              {application?.status === "rechazado"
                ? application.rejection_reason || "La solicitud no fue autorizada."
                : "El equipo revisará tus documentos."}
            </p>
          </article>
        </section>
      )}
    </main>
  );
}
