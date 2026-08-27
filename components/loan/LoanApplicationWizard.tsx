

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import FaceCapture from "@/components/loan/FaceCapture";
import SignatureCanvas from "@/components/loan/SignatureCanvas";

type DocumentType =
  | "ine_front"
  | "ine_back"
  | "face_photo"
  | "address_proof"
  | "signature";

type CreditOption = {
  amount: number;
  termFortnights: number;
  fortnightPayment: number;
  totalPayment: number;
};

type ApplicationDocument = {
  type: DocumentType;
  originalName: string;
  verificationStatus: string;
  uploadedAt: string;
};

type LoanApplication = {
  uuid: string;
  status: "borrador" | "en_revision" | "aprobado" | "rechazado" | "cancelado";
  requestedAmount: number;
  termFortnights: number;
  fortnightPayment: number;
  totalPayment: number;
  purpose: string | null;
  documents: ApplicationDocument[];
};

const documentLabels: Record<DocumentType, string> = {
  ine_front: "INE por el frente",
  ine_back: "INE por la parte trasera",
  face_photo: "Fotografía del rostro",
  address_proof: "Comprobante de domicilio",
  signature: "Firma",
};

const requiredIdentityDocuments: DocumentType[] = [
  "ine_front",
  "ine_back",
  "face_photo",
  "address_proof",
];

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

export default function LoanApplicationWizard() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [options, setOptions] = useState<CreditOption[]>([]);
  const [application, setApplication] = useState<LoanApplication | null>(null);
  const [amount, setAmount] = useState(0);
  const [term, setTerm] = useState(0);
  const [purpose, setPurpose] = useState("");
  const [files, setFiles] = useState<Partial<Record<DocumentType, File>>>({});
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [biometricConsent, setBiometricConsent] = useState(false);
  const [promissoryAccepted, setPromissoryAccepted] = useState(false);
  const [promissoryText, setPromissoryText] = useState("");
  const [noteHash, setNoteHash] = useState("");
  const [preparingNote, setPreparingNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetch("/api/credit-options", { cache: "no-store", signal: controller.signal }),
      fetch("/api/loan-applications", { cache: "no-store", signal: controller.signal }),
    ])
      .then(async ([optionsResponse, applicationResponse]) => {
        const optionsResult = await optionsResponse.json();
        const applicationResult = await applicationResponse.json();

        if (!optionsResponse.ok) throw new Error(optionsResult.message);
        if (!applicationResponse.ok) throw new Error(applicationResult.message);

        const loadedOptions: CreditOption[] = optionsResult.options;
        setOptions(loadedOptions);

        const loadedApplication = applicationResult.application as LoanApplication | null;

        if (loadedApplication?.status === "en_revision") {
          setApplication(loadedApplication);
          setSuccessMessage(
            "Tu solicitud de crédito está en proceso de autorización.",
          );
          setStep(4);
        } else if (loadedApplication?.status === "aprobado") {
          setApplication(loadedApplication);
          setSuccessMessage("Tu solicitud fue autorizada.");
          setStep(4);
        } else if (loadedApplication?.status === "borrador") {
          setApplication(loadedApplication);
          setAmount(loadedApplication.requestedAmount);
          setTerm(loadedApplication.termFortnights);
          setPurpose(loadedApplication.purpose || "");

          const uploaded = new Set(
            loadedApplication.documents.map((document) => document.type),
          );
          const identityComplete = requiredIdentityDocuments.every((type) =>
            uploaded.has(type),
          );
          if (identityComplete) {
            setPrivacyConsent(true);
            setBiometricConsent(true);
            setPreparingNote(true);
          }
          setStep(identityComplete ? 3 : 2);
        } else if (loadedOptions.length) {
          setAmount(loadedOptions[0].amount);
          setTerm(loadedOptions[0].termFortnights);
        }
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudo cargar la solicitud.",
        );
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (step !== 3 || !application?.uuid) return;

    const controller = new AbortController();

    fetch(`/api/loan-applications/${application.uuid}/promissory-note`, {
      method: "POST",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        setPromissoryText(result.text);
        setNoteHash(result.hash);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No fue posible preparar el pagaré.",
        );
      })
      .finally(() => setPreparingNote(false));

    return () => controller.abort();
  }, [step, application?.uuid]);

  const amounts = useMemo(
    () => [...new Set(options.map((option) => option.amount))],
    [options],
  );

  const availableOptions = options.filter((option) => option.amount === amount);
  const selectedOption = options.find(
    (option) => option.amount === amount && option.termFortnights === term,
  );
  const uploadedTypes = new Set(
    application?.documents?.map((document) => document.type) || [],
  );

  function selectAmount(newAmount: number) {
    const firstOption = options.find((option) => option.amount === newAmount);
    setAmount(newAmount);
    setTerm(firstOption?.termFortnights || 0);
  }

  function selectFile(type: DocumentType, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      setError(`${documentLabels[type]} no puede pesar más de 4 MB.`);
      return;
    }

    setFiles((current) => ({ ...current, [type]: file }));
    setError("");
  }

  async function saveQuote() {
    if (!selectedOption || purpose.trim().length < 5) {
      setError("Selecciona un monto, un plazo y escribe el destino del préstamo.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/loan-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          termFortnights: term,
          purpose,
        }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.message);

      setApplication(result.application);
      setPromissoryText("");
      setNoteHash("");
      setPromissoryAccepted(false);
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible guardar la cotización.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadDocument(type: DocumentType, file: File) {
    if (!application) throw new Error("Primero guarda la cotización.");

    const formData = new FormData();
    formData.append("documentType", type);
    formData.append("file", file);
    formData.append("privacyConsent", String(privacyConsent));
    formData.append("biometricConsent", String(biometricConsent));
    if (type === "signature") {
      if (!noteHash) throw new Error("Espera a que el pagaré termine de cargar.");
      formData.append("noteHash", noteHash);
    }

    const response = await fetch(
      `/api/loan-applications/${application.uuid}/documents`,
      { method: "POST", body: formData },
    );
    const result = await response.json();

    if (!response.ok) throw new Error(result.message);

    setApplication((current) => {
      if (!current) return current;
      const withoutReplaced = current.documents.filter(
        (document) => document.type !== type,
      );
      return {
        ...current,
        documents: [...withoutReplaced, result.document],
      };
    });
  }

  async function saveDocuments() {
    if (!privacyConsent || !biometricConsent) {
      setError(
        "Debes aceptar el aviso de privacidad y autorizar la fotografía facial.",
      );
      return;
    }

    const missing = requiredIdentityDocuments.filter(
      (type) => !uploadedTypes.has(type) && !files[type],
    );

    if (missing.length) {
      setError(`Falta: ${missing.map((type) => documentLabels[type]).join(", ")}.`);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const documentsToUpload = requiredIdentityDocuments.filter(
        (type) => files[type],
      );

      for (const [index, type] of documentsToUpload.entries()) {
        setUploadProgress(
          `Guardando ${documentLabels[type]} (${index + 1}/${documentsToUpload.length})…`,
        );
        await uploadDocument(type, files[type] as File);
      }

      setUploadProgress("");
      setPreparingNote(true);
      setStep(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible guardar los documentos.",
      );
    } finally {
      setUploadProgress("");
      setSaving(false);
    }
  }

  async function submitApplication() {
    if (!application) return;

    if (!promissoryAccepted) {
      setError("Debes aceptar los términos del pagaré.");
      return;
    }

    if (!noteHash || !promissoryText) {
      setError("Espera a que el pagaré termine de cargar.");
      return;
    }

    const signatureAlreadyUploaded = uploadedTypes.has("signature");
    const signature = files.signature;

    if (!signatureAlreadyUploaded && !signature) {
      setError("Dibuja tu firma antes de enviar la solicitud.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (signature) {
        setUploadProgress("Protegiendo tu firma…");
        await uploadDocument("signature", signature);
      }

      setUploadProgress("Enviando solicitud…");
      const response = await fetch(
        `/api/loan-applications/${application.uuid}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            privacyConsent: true,
            biometricConsent: true,
            promissoryAccepted: true,
            noteHash,
          }),
        },
      );
      const result = await response.json();

      if (!response.ok) throw new Error(result.message);

      setSuccessMessage(result.message);
      setStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No fue posible enviar la solicitud.",
      );
    } finally {
      setUploadProgress("");
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="loan-wizard loading-card">Cargando opciones de crédito…</section>;
  }

  return (
    <section className="loan-wizard">
      <div className="wizard-progress" aria-label="Progreso de la solicitud">
        {["Cotización", "Documentos", "Firma", "Envío"].map((label, index) => {
          const number = (index + 1) as 1 | 2 | 3 | 4;
          return (
            <div key={label} className={number <= step ? "wizard-step active" : "wizard-step"}>
              <span>{number < step ? "✓" : number}</span>
              <small>{label}</small>
            </div>
          );
        })}
      </div>

      {error ? <div className="alert alert-error wizard-alert">{error}</div> : null}

      {step === 1 ? (
        <div className="wizard-card">
          <div className="wizard-heading">
            <p className="eyebrow">Paso 1 de 4</p>
            <h1>Elige tu préstamo</h1>
            <p className="muted">Selecciona el monto y las quincenas disponibles.</p>
          </div>

          <div className="amount-grid">
            {amounts.map((optionAmount) => (
              <button
                key={optionAmount}
                type="button"
                className={optionAmount === amount ? "amount-option selected" : "amount-option"}
                onClick={() => selectAmount(optionAmount)}
              >
                {money.format(optionAmount)}
              </button>
            ))}
          </div>

          <div className="term-section">
            <strong>¿En cuántas quincenas?</strong>
            <div className="term-grid">
              {availableOptions.map((option) => (
                <button
                  key={option.termFortnights}
                  type="button"
                  className={term === option.termFortnights ? "term-option selected" : "term-option"}
                  onClick={() => setTerm(option.termFortnights)}
                >
                  <strong>{option.termFortnights}</strong>
                  <span>{money.format(option.fortnightPayment)} por quincena</span>
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>¿Para qué necesitas el préstamo?</span>
            <textarea
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Ejemplo: gastos médicos, reparación del automóvil…"
            />
          </label>

          {selectedOption ? (
            <div className="quote-summary">
              <div><span>Recibes</span><strong>{money.format(selectedOption.amount)}</strong></div>
              <div><span>Pago quincenal</span><strong>{money.format(selectedOption.fortnightPayment)}</strong></div>
              <div><span>Número de pagos</span><strong>{selectedOption.termFortnights}</strong></div>
              <div><span>Total a pagar</span><strong>{money.format(selectedOption.totalPayment)}</strong></div>
            </div>
          ) : null}

          <div className="wizard-actions">
            <Link href="/mi-cuenta" className="button button-secondary">Cancelar</Link>
            <button className="button button-primary" onClick={saveQuote} disabled={saving}>
              {saving ? "Guardando…" : "Continuar con documentos"}
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="wizard-card">
          <div className="wizard-heading">
            <p className="eyebrow">Paso 2 de 4</p>
            <h1>Identidad y domicilio</h1>
            <p className="muted">Las imágenes deben ser legibles, completas y sin reflejos.</p>
          </div>

          <div className="consent-box">
            <label>
              <input
                type="checkbox"
                checked={privacyConsent}
                onChange={(event) => setPrivacyConsent(event.target.checked)}
              />
              <span>
                Leí y acepto el <Link href="/aviso-privacidad" target="_blank">aviso de privacidad</Link>
                para el tratamiento de mis datos de identificación, financieros y documentos.
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={biometricConsent}
                onChange={(event) => setBiometricConsent(event.target.checked)}
              />
              <span>
                Autorizo expresamente la captura y tratamiento de mi fotografía facial
                para verificar mi identidad en esta solicitud.
              </span>
            </label>
          </div>

          <div className="document-grid">
            <DocumentUpload
              type="ine_front"
              label="INE por el frente"
              helper="Fotografía completa y claramente legible."
              uploaded={uploadedTypes.has("ine_front")}
              selected={files.ine_front?.name}
              onChange={selectFile}
            />
            <DocumentUpload
              type="ine_back"
              label="INE por la parte trasera"
              helper="Incluye códigos y toda la superficie de la credencial."
              uploaded={uploadedTypes.has("ine_back")}
              selected={files.ine_back?.name}
              onChange={selectFile}
            />
            <DocumentUpload
              type="address_proof"
              label="Comprobante de domicilio"
              helper="Recibo reciente de agua, luz, gas o teléfono. Puede ser imagen o PDF."
              uploaded={uploadedTypes.has("address_proof")}
              selected={files.address_proof?.name}
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={selectFile}
            />
          </div>

          <div className="face-document-card">
            <div>
              <span className="document-number">04</span>
              <h3>Fotografía del rostro</h3>
              <p>No realizamos reconocimiento facial automático ni prueba de vida.</p>
              {uploadedTypes.has("face_photo") ? <span className="uploaded-badge">Ya guardada</span> : null}
            </div>
            <FaceCapture
              onChange={(file) =>
                setFiles((current) => ({ ...current, face_photo: file || undefined }))
              }
            />
          </div>

          <div className="wizard-actions">
            <button type="button" className="button button-secondary" onClick={() => setStep(1)}>
              Regresar
            </button>
            <button className="button button-primary" onClick={saveDocuments} disabled={saving}>
              {uploadProgress || (saving ? "Guardando…" : "Guardar y continuar")}
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 && application ? (
        <div className="wizard-card">
          <div className="wizard-heading">
            <p className="eyebrow">Paso 3 de 4</p>
            <h1>Revisa y firma</h1>
            <p className="muted">Verifica cuidadosamente los términos antes de continuar.</p>
          </div>

          {preparingNote ? (
            <div className="loading-card">Preparando el pagaré…</div>
          ) : promissoryText ? (
            <pre className="promissory-note">{promissoryText}</pre>
          ) : null}

          <label className="acceptance-check">
            <input
              type="checkbox"
              checked={promissoryAccepted}
              onChange={(event) => setPromissoryAccepted(event.target.checked)}
            />
            <span>
              Confirmo que revisé la cotización, que mis documentos son auténticos
              y que acepto los términos mostrados.
            </span>
          </label>

          {noteHash ? (
            <SignatureCanvas
              onChange={(file) =>
                setFiles((current) => ({ ...current, signature: file || undefined }))
              }
            />
          ) : null}

          <div className="wizard-actions">
            <button type="button" className="button button-secondary" onClick={() => setStep(2)}>
              Regresar
            </button>
            <button
              className="button button-primary"
              onClick={submitApplication}
              disabled={saving || preparingNote || !noteHash}
            >
              {uploadProgress || (saving ? "Enviando…" : "Firmar y enviar solicitud")}
            </button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="wizard-card submission-success">
          <div className="success-icon">✓</div>
          <p className="eyebrow">Solicitud recibida</p>
          <h1>Estamos revisando tu información</h1>
          <p>{successMessage || "Tu crédito está en proceso de autorización."}</p>
          {application ? <small>Folio: {application.uuid}</small> : null}
          <Link href="/mi-cuenta" className="button button-primary">
            Regresar a mi cuenta
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function DocumentUpload({
  type,
  label,
  helper,
  uploaded,
  selected,
  accept = "image/jpeg,image/png,image/webp",
  onChange,
}: {
  type: DocumentType;
  label: string;
  helper: string;
  uploaded: boolean;
  selected?: string;
  accept?: string;
  onChange: (type: DocumentType, event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="document-card">
      <span className="document-number">{type === "ine_front" ? "01" : type === "ine_back" ? "02" : "03"}</span>
      <h3>{label}</h3>
      <p>{helper}</p>
      {uploaded ? <span className="uploaded-badge">Ya guardado</span> : null}
      {selected ? <span className="selected-file">{selected}</span> : null}
      <span className="button button-secondary">{uploaded ? "Reemplazar" : "Seleccionar archivo"}</span>
      <input
        type="file"
        accept={accept}
        capture={type === "address_proof" ? undefined : "environment"}
        onChange={(event) => onChange(type, event)}
      />
    </label>
  );
}
