"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Loan = {
  uuid: string;
  status: string;
  principal: number;
  installmentAmount: number;
  termFortnights: number;
  totalDue: number;
  amountPaid: number;
  balance: number;
  disbursementDate: string | null;
  maturityDate: string | null;
  nextDueDate: string | null;
  nextDueBalance: number | null;
  paidInstallments: number;
  clientName: string;
  phone: string | null;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const statusLabels: Record<string, string> = {
  todos: "Todos",
  pendiente_desembolso: "Por entregar",
  activo: "Activos",
  liquidado: "Liquidados",
  cancelado: "Cancelados",
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const date = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeZone: "America/Monterrey",
});

function formatDate(value: string | null) {
  return value ? date.format(new Date(`${value}T12:00:00-06:00`)) : "Pendiente";
}

export default function LoanPortfolioList() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [status, setStatus] = useState("todos");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLoans = useCallback(
    async (page: number, signal?: AbortSignal) => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          status,
          page: String(page),
          limit: "20",
        });
        if (query) params.set("q", query);

        const response = await fetch(`/api/admin/loans?${params}`, {
          cache: "no-store",
          signal,
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "No se pudo cargar la cartera.");
        }

        setLoans(result.loans);
        setPagination(result.pagination);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Ocurrió un error.");
      } finally {
        setLoading(false);
      }
    },
    [query, status],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadLoans(1, controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadLoans]);

  function search(event: FormEvent) {
    event.preventDefault();
    setQuery(input.trim());
  }

  return (
    <section className="panel table-panel">
      <div className="application-toolbar">
        <form className="search-form" onSubmit={search}>
          <input
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Cliente, WhatsApp o folio"
            aria-label="Buscar créditos"
          />
          <button className="button button-secondary">Buscar</button>
        </form>
        <label className="compact-field">
          <span>Estado</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        <span className="result-count">{pagination.total} créditos</span>
      </div>

      {error ? <div className="alert alert-error list-alert">{error}</div> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Crédito</th>
              <th>Avance</th>
              <th>Próximo pago</th>
              <th>Saldo</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="empty-state">Cargando cartera…</td></tr>
            ) : loans.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  <strong>No hay créditos con este filtro.</strong>
                  <span>Los créditos autorizados aparecerán aquí.</span>
                </td>
              </tr>
            ) : (
              loans.map((loan) => (
                <tr key={loan.uuid}>
                  <td>
                    <strong>{loan.clientName}</strong>
                    <small>{loan.phone || "Sin WhatsApp"}</small>
                  </td>
                  <td>
                    <strong>{money.format(loan.principal)}</strong>
                    <small>{money.format(loan.installmentAmount)} por quincena</small>
                  </td>
                  <td>
                    <strong>{loan.paidInstallments}/{loan.termFortnights}</strong>
                    <small>quincenas pagadas</small>
                  </td>
                  <td>
                    <strong>
                      {loan.nextDueBalance === null
                        ? "—"
                        : money.format(loan.nextDueBalance)}
                    </strong>
                    <small>{formatDate(loan.nextDueDate)}</small>
                  </td>
                  <td>
                    <strong>{money.format(loan.balance)}</strong>
                    <small>de {money.format(loan.totalDue)}</small>
                  </td>
                  <td>
                    <span className={`status status-${loan.status}`}>
                      {statusLabels[loan.status] || loan.status}
                    </span>
                  </td>
                  <td>
                    <Link
                      className="button button-secondary button-small"
                      href={`/dashboard/creditos/${loan.uuid}`}
                    >
                      Administrar
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 ? (
        <div className="pagination">
          <button
            className="button button-secondary"
            onClick={() => loadLoans(pagination.page - 1)}
            disabled={loading || pagination.page <= 1}
          >
            Anterior
          </button>
          <span>Página {pagination.page} de {pagination.totalPages}</span>
          <button
            className="button button-secondary"
            onClick={() => loadLoans(pagination.page + 1)}
            disabled={loading || pagination.page >= pagination.totalPages}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </section>
  );
}
