"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Client = {
  uuid: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  occupation: string | null;
  monthlyIncome: number | null;
  city: string | null;
  state: string | null;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export default function ClientList() {
  const [clients, setClients] = useState<Client[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadClients = useCallback(async (page: number, signal?: AbortSignal) => {
    await Promise.resolve();
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        role: "cliente",
        page: String(page),
        limit: "20",
      });
      if (query) params.set("q", query);

      const response = await fetch(`/api/users?${params}`, {
        cache: "no-store",
        signal,
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.message || "No se pudieron cargar los clientes.");

      setClients(result.users);
      setPagination(result.pagination);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "Ocurrió un error.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void loadClients(1, controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadClients]);

  function search(event: FormEvent) {
    event.preventDefault();
    setQuery(input.trim());
  }

  return (
    <section className="panel table-panel">
      <div className="toolbar">
        <form className="search-form" onSubmit={search}>
          <input
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Buscar por nombre, correo o teléfono"
            aria-label="Buscar clientes"
          />
          <button className="button button-secondary">Buscar</button>
        </form>
        <span className="result-count">{pagination.total} clientes</span>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Contacto</th>
              <th>Ocupación</th>
              <th>Ingreso mensual</th>
              <th>Ubicación</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="empty-state">Cargando clientes…</td></tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  <strong>Aún no hay clientes.</strong>
                  <span>Registra el primer expediente para comenzar.</span>
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <tr key={client.uuid}>
                  <td><strong>{client.name}</strong><small>{client.email || "Sin correo"}</small></td>
                  <td>{client.phone || "Sin teléfono"}</td>
                  <td>{client.occupation || "—"}</td>
                  <td>{client.monthlyIncome == null ? "—" : money.format(client.monthlyIncome)}</td>
                  <td>{[client.city, client.state].filter(Boolean).join(", ") || "—"}</td>
                  <td><span className={`status status-${client.status}`}>{client.status}</span></td>
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
            onClick={() => loadClients(pagination.page - 1)}
            disabled={loading || pagination.page <= 1}
          >
            Anterior
          </button>
          <span>Página {pagination.page} de {pagination.totalPages}</span>
          <button
            className="button button-secondary"
            onClick={() => loadClients(pagination.page + 1)}
            disabled={loading || pagination.page >= pagination.totalPages}
          >
            Siguiente
          </button>
        </div>
      ) : null}

      {!loading && clients.length === 0 ? (
        <Link className="button button-primary empty-action" href="/dashboard/clientes/nuevo">
          Registrar cliente
        </Link>
      ) : null}
    </section>
  );
}
