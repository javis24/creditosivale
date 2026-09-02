"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WhatsAppApprovalNotice,
  WhatsAppOfferNotice,
} from "@/components/admin/WhatsAppActions";

type Document = {
  id: number;
  type: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  verificationStatus: "pendiente" | "verificado" | "rechazado";
  rejectionReason: string | null;
  verifiedAt: string | null;
  reviewerName: string | null;
  uploadedAt: string;
  viewUrl: string;
};

type Application = {
  uuid: string;
  status: "borrador" | "en_revision" | "oferta_pendiente" | "aprobado" | "rechazado" | "cancelado";
  flowVersion: number;
  requestedAmount: number;
  offeredAmount: number | null;
  termFortnights: number;
  offeredTermFortnights: number | null;
  fortnightPayment: number;
  offeredFortnightPayment: number | null;
  totalPayment: number;
  offeredTotalPayment: number | null;
  purpose: string | null;
  promissoryNoteText: string | null;
  promissoryNoteHash: string | null;
  signedAt: string | null;
  submittedAt: string | null;
  offeredAt: string | null;
  offerAcceptedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  reviewNotes: string | null;
  reviewerName: string | null;
  loan: {
    uuid: string;
    status: string;
  } | null;
  client: {
    uuid: string;
    name: string;
    phone: string | null;
    email: string | null;
    birthDate: string;
    address: string | null;
    postalCode: string;
    occupation: string | null;
    monthlyIncome: number;
  };
  documents: Document[];
};

type CreditOption = {
  amount: number;
  termFortnights: number;
  fortnightPayment: number;
  totalPayment: number;
};

const documentLabels: Record<string, string> = {
  ine_front: "INE por el frente",
  ine_back: "INE por la parte trasera",
  face_photo: "Fotografía del rostro",
  address_proof: "Comprobante de domicilio",
  signature: "Firma del cliente",
};

const statusLabels: Record<string, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  oferta_pendiente: "Oferta pendiente de firma",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export default function LoanApplicationReview({ uuid }: { uuid: string }) {
  const [application, setApplication] = useState<Application | null>(null);
  const [canDecide, setCanDecide] = useState(false);
  const [creditOptions, setCreditOptions] = useState<CreditOption[]>([]);
  const [selectedOffer, setSelectedOffer] = useState("");
  const [documentReasons, setDocumentReasons] = useState<Record<number, string>>({});
  const [rejectionReason, setRejectionReason] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadApplication = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/loan-applications/${uuid}`, {
        cache: "no-store",
        signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo cargar la solicitud.");
      setApplication(result.application);
      setCanDecide(result.permissions.canDecide);
      const loadedOptions: CreditOption[] = result.creditOptions || [];
      setCreditOptions(loadedOptions);
      setSelectedOffer((current) => {
        if (current) return current;
        const requested = loadedOptions.find(
          (option) =>
            option.amount === result.application.requestedAmount &&
            option.termFortnights === result.application.termFortnights,
        );
        const fallback = loadedOptions[loadedOptions.length - 1];
        const option = requested || fallback;
        return option ? `${option.amount}-${option.termFortnights}` : "";
      });
      setNotes(result.application.reviewNotes || "");
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "Ocurrió un error.");
    } finally {
      setLoading(false);
    }
  }, [uuid]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadApplication(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadApplication]);

  const requiredDocumentTypes = useMemo(
    () =>
      application?.flowVersion === 2
        ? ["ine_front", "ine_back", "face_photo", "address_proof"]
        : ["ine_front", "ine_back", "face_photo", "address_proof", "signature"],
    [application?.flowVersion],
  );

  const allDocumentsVerified = useMemo(() => {
    if (!application) return false;
    const verified = new Set(
      application.documents
        .filter((document) => document.verificationStatus === "verificado")
        .map((document) => document.type),
    );
    return requiredDocumentTypes.every((type) => verified.has(type));
  }, [application, requiredDocumentTypes]);

  async function reviewDocument(document: Document, status: "verificado" | "rechazado") {
    const reason = (documentReasons[document.id] || "").trim();
    if (status === "rechazado" && reason.length < 5) {
      setError(`Escribe el motivo para rechazar ${documentLabels[document.type]}.`);
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/loan-applications/${uuid}/documents/${document.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, reason }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo revisar el documento.");
      setMessage(result.message);
      await loadApplication();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ocurrió un error.");
    } finally {
      setSaving(false);
    }
  }

  async function decide(action: "aprobar" | "ofertar" | "rechazar") {
    if (action === "rechazar" && rejectionReason.trim().length < 10) {
      setError("Escribe el motivo del rechazo con al menos 10 caracteres.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const option = creditOptions.find(
        (item) => `${item.amount}-${item.termFortnights}` === selectedOffer,
      );
      if (action === "ofertar" && !option) {
        throw new Error("Selecciona una oferta del tarifario.");
      }

      const response = await fetch(`/api/admin/loan-applications/${uuid}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: rejectionReason,
          notes,
          offeredAmount: option?.amount,
          offeredTermFortnights: option?.termFortnights,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo guardar la decisión.");
      setMessage(result.message);
      await loadApplication();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ocurrió un error.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !application) {
    return <div className="panel review-loading">Cargando expediente…</div>;
  }

  if (!application) {
    return <div className="alert alert-error">{error || "Solicitud no encontrada."}</div>;
  }

  const reviewable = application.status === "en_revision";

  return (
    <div className="review-layout">
      <div className="review-topbar">
        <Link href="/dashboard/solicitudes" className="button button-secondary">
          ← Volver a solicitudes
        </Link>
        <span className={`status status-${application.status}`}>
          {statusLabels[application.status]}
        </span>
      </div>

      {error ? <div className="alert alert-error review-alert">{error}</div> : null}
      {message ? <div className="alert alert-success review-alert">{message}</div> : null}

      <section className="panel review-hero">
        <div>
          <p className="eyebrow">Expediente de crédito</p>
          <h1>{application.client.name}</h1>
          <p className="muted">Folio: {application.uuid}</p>
        </div>
        <div className="review-contact">
          <strong>{application.client.phone || "Sin WhatsApp"}</strong>
          <span>{application.client.email || "Sin correo"}</span>
        </div>
      </section>

      <section className="review-grid">
        <article className="panel review-section">
          <p className="eyebrow">
            {application.flowVersion === 2 ? "Petición del cliente" : "Cotización firmada"}
          </p>
          <div className="review-quote-grid">
            <div><span>Monto solicitado</span><strong>{money.format(application.requestedAmount)}</strong></div>
            <div>
              <span>{application.flowVersion === 2 ? "Plazo preferido" : "Pago quincenal"}</span>
              <strong>
                {application.flowVersion === 2
                  ? `${application.termFortnights} quincenas`
                  : money.format(application.fortnightPayment)}
              </strong>
            </div>
            {application.flowVersion === 1 ? (
              <>
                <div><span>Plazo</span><strong>{application.termFortnights} quincenas</strong></div>
                <div><span>Total</span><strong>{money.format(application.totalPayment)}</strong></div>
              </>
            ) : null}
          </div>
          <dl className="review-data-list">
            <div><dt>Destino</dt><dd>{application.purpose || "No especificado"}</dd></div>
            <div><dt>Domicilio</dt><dd>{application.client.address || "No especificado"}</dd></div>
            <div><dt>Código postal</dt><dd>{application.client.postalCode}</dd></div>
            <div><dt>Ocupación</dt><dd>{application.client.occupation || "No especificada"}</dd></div>
            <div><dt>Ingreso mensual</dt><dd>{money.format(application.client.monthlyIncome)}</dd></div>
          </dl>
        </article>

        <article className="panel review-section">
          <p className="eyebrow">
            {application.promissoryNoteText ? "Pagaré firmado" : "Firma final"}
          </p>
          {application.promissoryNoteText ? (
            <pre className="admin-promissory-note">{application.promissoryNoteText}</pre>
          ) : (
            <p className="muted">
              {application.flowVersion === 2
                ? "El pagaré se generará cuando el cliente reciba y acepte la oferta final."
                : "No se encontró el pagaré."}
            </p>
          )}
          {application.promissoryNoteHash ? (
            <small className="hash-copy">SHA-256: {application.promissoryNoteHash}</small>
          ) : null}
        </article>
      </section>

      <section className="review-documents-section">
        <div className="section-heading-inline">
          <div>
            <p className="eyebrow">Validación documental</p>
            <h2>Documentos y firma</h2>
          </div>
          <strong>
            {application.documents.filter(
              (document) =>
                requiredDocumentTypes.includes(document.type) &&
                document.verificationStatus === "verificado",
            ).length}/{requiredDocumentTypes.length} verificados
          </strong>
        </div>

        <div className="admin-document-grid">
          {application.documents.map((document) => (
            <article className="panel admin-document-card" key={document.id}>
              <div className="admin-document-heading">
                <div>
                  <h3>{documentLabels[document.type] || document.type}</h3>
                  <small>{document.originalName}</small>
                </div>
                <span className={`document-status document-status-${document.verificationStatus}`}>
                  {document.verificationStatus}
                </span>
              </div>

              <iframe
                className="document-preview-frame"
                src={document.viewUrl}
                title={documentLabels[document.type] || document.originalName}
              />

              <a
                href={document.viewUrl}
                target="_blank"
                rel="noreferrer"
                className="button button-secondary"
              >
                Abrir en otra pestaña
              </a>

              {document.rejectionReason ? (
                <p className="document-rejection-reason">{document.rejectionReason}</p>
              ) : null}

              {canDecide && reviewable ? (
                <div className="document-review-actions">
                  <input
                    value={documentReasons[document.id] || ""}
                    onChange={(event) =>
                      setDocumentReasons((current) => ({
                        ...current,
                        [document.id]: event.target.value,
                      }))
                    }
                    placeholder="Motivo si se rechaza"
                    maxLength={500}
                  />
                  <div>
                    <button
                      className="button button-approve"
                      disabled={saving}
                      onClick={() => reviewDocument(document, "verificado")}
                    >
                      Verificar
                    </button>
                    <button
                      className="button button-danger"
                      disabled={saving}
                      onClick={() => reviewDocument(document, "rechazado")}
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel decision-panel">
        <div>
          <p className="eyebrow">Resolución</p>
          <h2>Decisión de crédito</h2>
          {!canDecide ? (
            <p className="muted">Tu rol permite consultar, pero no resolver solicitudes.</p>
          ) : !reviewable ? (
            <p className="muted">
              Resuelta por {application.reviewerName || "personal autorizado"}.
              {application.rejectionReason ? ` Motivo: ${application.rejectionReason}` : ""}
            </p>
          ) : (
            <p className="muted">
              {application.flowVersion === 2
                ? "Selecciona una opción activa que no supere el monto solicitado. El cliente deberá aceptarla y firmar el pagaré final."
                : "La autorización conserva exactamente el monto, plazo y pagos aceptados por el cliente."}
            </p>
          )}
        </div>

        {canDecide && reviewable ? (
          <div className="decision-fields">
            {application.flowVersion === 2 ? (
              <label className="field">
                <span>Monto y plazo que puedes ofrecer</span>
                <select
                  value={selectedOffer}
                  onChange={(event) => setSelectedOffer(event.target.value)}
                >
                  <option value="">Selecciona una opción</option>
                  {creditOptions.map((option) => (
                    <option
                      key={`${option.amount}-${option.termFortnights}`}
                      value={`${option.amount}-${option.termFortnights}`}
                    >
                      {money.format(option.amount)} · {option.termFortnights} quincenas · {money.format(option.fortnightPayment)} por pago
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field">
              <span>Notas internas (opcional)</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                maxLength={1000}
              />
            </label>
            <label className="field">
              <span>Motivo si se rechaza</span>
              <textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                rows={3}
                maxLength={500}
              />
            </label>
            {!allDocumentsVerified ? (
              <div className="decision-warning">
                Verifica los {requiredDocumentTypes.length} documentos requeridos antes de continuar.
              </div>
            ) : null}
            <div className="decision-actions">
              <button
                className="button button-danger"
                onClick={() => decide("rechazar")}
                disabled={saving}
              >
                Rechazar solicitud
              </button>
              <button
                className="button button-approve"
                onClick={() => decide(application.flowVersion === 2 ? "ofertar" : "aprobar")}
                disabled={
                  saving ||
                  !allDocumentsVerified ||
                  (application.flowVersion === 2 && !selectedOffer)
                }
              >
                {saving
                  ? "Guardando…"
                  : application.flowVersion === 2
                    ? "Enviar oferta al cliente"
                    : "Autorizar crédito"}
              </button>
            </div>
          </div>
        ) : null}

        {application.status === "oferta_pendiente" &&
        application.offeredAmount &&
        application.offeredTermFortnights &&
        application.offeredFortnightPayment &&
        application.offeredTotalPayment ? (
          <div className="decision-fields">
            <div className="alert alert-success">
              Oferta enviada: {money.format(application.offeredAmount)} a{" "}
              {application.offeredTermFortnights} quincenas de{" "}
              {money.format(application.offeredFortnightPayment)}. El cliente debe
              aceptarla y firmarla desde su cuenta.
            </div>
            <WhatsAppOfferNotice
              phone={application.client.phone}
              clientName={application.client.name}
              offeredAmount={application.offeredAmount}
              installmentAmount={application.offeredFortnightPayment}
              termFortnights={application.offeredTermFortnights}
            />
          </div>
        ) : null}

        {application.loan ? (
          <div className="decision-fields">
            <div className="alert alert-success">
              El crédito ya forma parte de la cartera.
            </div>
            <Link
              className="button button-primary"
              href={`/dashboard/creditos/${application.loan.uuid}`}
            >
              Administrar crédito
            </Link>
            <WhatsAppApprovalNotice
              phone={application.client.phone}
              clientName={application.client.name}
              approvedAmount={application.offeredAmount || application.requestedAmount}
              installmentAmount={application.offeredFortnightPayment || application.fortnightPayment}
              termFortnights={application.offeredTermFortnights || application.termFortnights}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
