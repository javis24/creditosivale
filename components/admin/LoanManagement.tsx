"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  WhatsAppApprovalNotice,
  WhatsAppPaymentReminder,
} from "@/components/admin/WhatsAppActions";

type Installment = {
  uuid: string;
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: string;
  paidAt: string | null;
};

type Payment = {
  uuid: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  receiverName: string;
};

type Loan = {
  uuid: string;
  applicationUuid: string;
  status: string;
  principal: number;
  termFortnights: number;
  installmentAmount: number;
  totalDue: number;
  amountPaid: number;
  balance: number;
  disbursementDate: string | null;
  firstDueDate: string | null;
  maturityDate: string | null;
  activatedAt: string | null;
  liquidatedAt: string | null;
  activatedByName: string | null;
  client: {
    uuid: string;
    name: string;
    phone: string | null;
  };
  installments: Installment[];
  payments: Payment[];
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const date = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeZone: "America/Monterrey",
});

const statusLabels: Record<string, string> = {
  pendiente_desembolso: "Por entregar",
  activo: "Activo",
  liquidado: "Liquidado",
  cancelado: "Cancelado",
};

const installmentLabels: Record<string, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagado: "Pagado",
  vencido: "Vencido",
};

const paymentMethodLabels: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  deposito: "Depósito",
  otro: "Otro",
};

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  return value ? date.format(new Date(`${value}T12:00:00-06:00`)) : "Pendiente";
}

export default function LoanManagement({ uuid }: { uuid: string }) {
  const [loan, setLoan] = useState<Loan | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [disbursementDate, setDisbursementDate] = useState(todayLocal());
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayLocal());
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadLoan = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/loans/${uuid}`, {
        cache: "no-store",
        signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo cargar el crédito.");

      setLoan(result.loan);
      setCanManage(result.permissions.canManage);
      setAmount((current) =>
        current || String(Math.min(result.loan.installmentAmount, result.loan.balance)),
      );
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "Ocurrió un error.");
    } finally {
      setLoading(false);
    }
  }, [uuid]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadLoan(controller.signal), 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadLoan]);

  const currentInstallment = useMemo(
    () => loan?.installments.find((item) => item.amountPaid < item.amountDue) || null,
    [loan],
  );

  async function activateLoan(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/loans/${uuid}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disbursementDate }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo activar el crédito.");

      setMessage(result.message);
      await loadLoan();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ocurrió un error.");
    } finally {
      setSaving(false);
    }
  }

  async function registerPayment(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/loans/${uuid}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          paymentDate,
          paymentMethod,
          reference,
          notes,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo registrar el pago.");

      setMessage(result.message);
      setReference("");
      setNotes("");
      setAmount("");
      await loadLoan();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ocurrió un error.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !loan) {
    return <div className="panel review-loading">Cargando crédito…</div>;
  }

  if (!loan) {
    return <div className="alert alert-error">{error || "Crédito no encontrado."}</div>;
  }

  const progress = loan.totalDue
    ? Math.min(100, Math.round((loan.amountPaid / loan.totalDue) * 100))
    : 0;

  return (
    <div className="loan-management">
      <div className="review-topbar">
        <Link href="/dashboard/creditos" className="button button-secondary">
          ← Volver a créditos
        </Link>
        <span className={`status status-${loan.status}`}>
          {statusLabels[loan.status] || loan.status}
        </span>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <section className="panel loan-hero">
        <div>
          <p className="eyebrow">Crédito de {loan.client.name}</p>
          <h1>{money.format(loan.balance)} pendientes</h1>
          <p className="muted">
            {loan.client.phone || "Sin WhatsApp"} · Folio {loan.uuid}
          </p>
        </div>
        <div className="loan-progress-copy">
          <strong>{progress}% pagado</strong>
          <span>{money.format(loan.amountPaid)} de {money.format(loan.totalDue)}</span>
        </div>
        <div className="loan-progress-bar" aria-label={`${progress}% pagado`}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="loan-stat-grid">
        <article className="panel loan-stat">
          <span>Pago quincenal</span>
          <strong>{money.format(loan.installmentAmount)}</strong>
        </article>
        <article className="panel loan-stat">
          <span>Quincena actual</span>
          <strong>
            {currentInstallment
              ? `${currentInstallment.installmentNumber} de ${loan.termFortnights}`
              : "Completado"}
          </strong>
        </article>
        <article className="panel loan-stat">
          <span>Próximo vencimiento</span>
          <strong>{formatDate(currentInstallment?.dueDate || null)}</strong>
        </article>
        <article className="panel loan-stat">
          <span>Fecha final</span>
          <strong>{formatDate(loan.maturityDate)}</strong>
        </article>
      </section>

      {loan.status === "pendiente_desembolso" ? (
        <section className="panel whatsapp-action-panel">
          <div>
            <p className="eyebrow">Aviso por WhatsApp</p>
            <h2>Notificar autorización</h2>
            <p className="muted">
              Envía al cliente el monto autorizado, pago quincenal y plazo.
            </p>
          </div>
          <WhatsAppApprovalNotice
            phone={loan.client.phone}
            clientName={loan.client.name}
            approvedAmount={loan.principal}
            installmentAmount={loan.installmentAmount}
            termFortnights={loan.termFortnights}
          />
        </section>
      ) : null}

      {loan.status === "activo" && currentInstallment ? (
        <section className="panel whatsapp-action-panel">
          <div>
            <p className="eyebrow">Recordatorio por WhatsApp</p>
            <h2>Próximo pago: {formatDate(currentInstallment.dueDate)}</h2>
            <p className="muted">
              Pago {currentInstallment.installmentNumber} de {loan.termFortnights} por{" "}
              {money.format(
                Math.max(0, currentInstallment.amountDue - currentInstallment.amountPaid),
              )}.
            </p>
          </div>
          <WhatsAppPaymentReminder
            phone={loan.client.phone}
            clientName={loan.client.name}
            amount={Math.max(
              0,
              currentInstallment.amountDue - currentInstallment.amountPaid,
            )}
            dueDate={currentInstallment.dueDate}
            installmentNumber={currentInstallment.installmentNumber}
            termFortnights={loan.termFortnights}
          />
        </section>
      ) : null}

      {loan.status === "pendiente_desembolso" ? (
        <section className="panel loan-action-panel">
          <div>
            <p className="eyebrow">Entrega del crédito</p>
            <h2>Activar y generar calendario</h2>
            <p className="muted">
              Confirma la fecha real en que se entregó el dinero al cliente.
            </p>
          </div>
          {canManage ? (
            <form className="inline-action-form" onSubmit={activateLoan}>
              <label className="field">
                <span>Fecha de entrega</span>
                <input
                  type="date"
                  value={disbursementDate}
                  max={todayLocal()}
                  onChange={(event) => setDisbursementDate(event.target.value)}
                  required
                />
              </label>
              <button className="button button-approve" disabled={saving}>
                {saving ? "Activando…" : "Activar crédito"}
              </button>
            </form>
          ) : (
            <p className="muted">Tu rol permite consultar, pero no activar créditos.</p>
          )}
        </section>
      ) : null}

      {loan.status === "activo" && canManage ? (
        <section className="panel payment-form-panel">
          <div>
            <p className="eyebrow">Cobranza</p>
            <h2>Registrar pago</h2>
            <p className="muted">
              El pago se aplica automáticamente a las quincenas más antiguas.
            </p>
          </div>
          <form className="payment-form-grid" onSubmit={registerPayment}>
            <label className="field">
              <span>Monto</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={loan.balance}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Fecha del pago</span>
              <input
                type="date"
                max={todayLocal()}
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Forma de pago</span>
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                {Object.entries(paymentMethodLabels).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Referencia (opcional)</span>
              <input
                value={reference}
                maxLength={120}
                onChange={(event) => setReference(event.target.value)}
              />
            </label>
            <label className="field payment-notes">
              <span>Notas (opcional)</span>
              <textarea
                rows={3}
                value={notes}
                maxLength={500}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <button className="button button-primary payment-submit" disabled={saving}>
              {saving ? "Registrando…" : "Registrar pago"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="panel loan-history-panel">
        <div className="section-heading-inline">
          <div>
            <p className="eyebrow">Calendario</p>
            <h2>Quincenas del crédito</h2>
          </div>
          <strong>{loan.installments.filter((item) => item.status === "pagado").length}/{loan.termFortnights} pagadas</strong>
        </div>
        {loan.installments.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quincena</th>
                  <th>Vencimiento</th>
                  <th>Cargo</th>
                  <th>Pagado</th>
                  <th>Pendiente</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {loan.installments.map((item) => {
                  const overdue =
                    item.status !== "pagado" && item.dueDate < todayLocal();
                  const visibleStatus = overdue ? "vencido" : item.status;
                  return (
                    <tr key={item.uuid}>
                      <td><strong>{item.installmentNumber} de {loan.termFortnights}</strong></td>
                      <td>{formatDate(item.dueDate)}</td>
                      <td>{money.format(item.amountDue)}</td>
                      <td>{money.format(item.amountPaid)}</td>
                      <td>{money.format(Math.max(0, item.amountDue - item.amountPaid))}</td>
                      <td>
                        <span className={`status status-${visibleStatus}`}>
                          {installmentLabels[visibleStatus]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-copy">El calendario se generará al activar el crédito.</p>
        )}
      </section>

      <section className="panel loan-history-panel">
        <div className="section-heading-inline">
          <div>
            <p className="eyebrow">Movimientos</p>
            <h2>Historial de pagos</h2>
          </div>
          <strong>{loan.payments.length} movimientos</strong>
        </div>
        {loan.payments.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Forma</th>
                  <th>Referencia</th>
                  <th>Registró</th>
                </tr>
              </thead>
              <tbody>
                {loan.payments.map((payment) => (
                  <tr key={payment.uuid}>
                    <td>{formatDate(payment.paymentDate)}</td>
                    <td><strong>{money.format(payment.amount)}</strong></td>
                    <td>{paymentMethodLabels[payment.paymentMethod]}</td>
                    <td>{payment.reference || "—"}</td>
                    <td>{payment.receiverName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-copy">Aún no se han registrado pagos.</p>
        )}
      </section>
    </div>
  );
}
