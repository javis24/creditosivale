"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Application = {
  uuid: string;
  status: string;
  requestedAmount: number;
  termFortnights: number;
  fortnightPayment: number;
  totalPayment: number;
  purpose: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  clientName: string;
  phone: string | null;
  documentCount: number;
  verifiedCount: number;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const statusLabels: Record<string, string> = {
  todas: "Todas",
  en_revision: "En revisión",
  oferta_pendiente: "Oferta pendiente",
  aprobado: "Aprobadas",
  rechazado: "Rechazadas",
  borrador: "Borradores",
  cancelado: "Canceladas",
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Monterrey",
});

export default function LoanApplicationList() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [status, setStatus] = useState("en_revision");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadApplications = useCallback(
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

        const response = await fetch(`/api/admin/loan-applications?${params}`, {
          cache: "no-store",
          signal,
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "No se pudieron cargar las solicitudes.");
        }

        setApplications(result.applications);
        setPagination(result.pagination);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError(
          requestError instanceof Error ? requestError.message : "Ocurrió un error.",
        );
      } finally {
        setLoading(false);
      }
    },
    [query, status],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadApplications(1, controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadApplications]);

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
            aria-label="Buscar solicitudes"
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
        <span className="result-count">{pagination.total} solicitudes</span>
      </div>

      {error ? <div className="alert alert-error list-alert">{error}</div> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Solicitud</th>
              <th>Pago</th>
              <th>Documentos</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="empty-state">Cargando solicitudes…</td></tr>
            ) : applications.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  <strong>No hay solicitudes en este estado.</strong>
                  <span>Cambia el filtro o espera una nueva solicitud.</span>
                </td>
              </tr>
            ) : (
              applications.map((application) => (
                <tr key={application.uuid}>
                  <td>
                    <strong>{application.clientName}</strong>
                    <small>{application.phone || "Sin WhatsApp"}</small>
                  </td>
                  <td>
                    <strong>{money.format(application.requestedAmount)}</strong>
                    <small>
                      {application.submittedAt
                        ? dateTime.format(new Date(application.submittedAt))
                        : "Sin enviar"}
                    </small>
                  </td>
                  <td>
                    {application.fortnightPayment > 0
                      ? money.format(application.fortnightPayment)
                      : "Por definir"}
                    <small>{application.termFortnights} quincenas preferidas</small>
                  </td>
                  <td>
                    <strong>{application.verifiedCount}/{application.documentCount}</strong>
                    <small>verificados</small>
                  </td>
                  <td>
                    <span className={`status status-${application.status}`}>
                      {statusLabels[application.status] || application.status}
                    </span>
                  </td>
                  <td>
                    <Link
                      className="button button-secondary button-small"
                      href={`/dashboard/solicitudes/${application.uuid}`}
                    >
                      Revisar
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
            onClick={() => loadApplications(pagination.page - 1)}
            disabled={loading || pagination.page <= 1}
          >
            Anterior
          </button>
          <span>Página {pagination.page} de {pagination.totalPages}</span>
          <button
            className="button button-secondary"
            onClick={() => loadApplications(pagination.page + 1)}
            disabled={loading || pagination.page >= pagination.totalPages}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </section>
  );
}
