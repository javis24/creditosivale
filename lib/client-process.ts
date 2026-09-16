export const clientProcessSteps = [
  "Cuenta",
  "Solicitud",
  "Documentos",
  "Evaluación",
  "Entrega",
  "Pagos",
] as const;

export type ClientProcessKey =
  | "cuenta"
  | "solicitud"
  | "documentos"
  | "revision"
  | "oferta_pendiente"
  | "autorizado"
  | "activo"
  | "liquidado"
  | "rechazado"
  | "cancelado";

export type ClientProcess = {
  key: ClientProcessKey;
  title: string;
  description: string;
  currentStep: number;
  tone: "neutral" | "warning" | "success" | "danger";
};

export type ClientProcessInput = {
  applicationStatus?: string | null;
  loanStatus?: string | null;
  documentCount?: number | null;
  verifiedDocumentCount?: number | null;
  requiredDocumentCount?: number | null;
  paidInstallments?: number | null;
  termFortnights?: number | null;
  nextDueDate?: string | null;
};

export function getClientProcess(input: ClientProcessInput): ClientProcess {
  const documentCount = Number(input.documentCount || 0);
  const verifiedCount = Number(input.verifiedDocumentCount || 0);
  const requiredCount = Number(input.requiredDocumentCount || 4);
  const paidInstallments = Number(input.paidInstallments || 0);
  const termFortnights = Number(input.termFortnights || 0);

  if (input.loanStatus === "liquidado") {
    return {
      key: "liquidado",
      title: "Crédito liquidado",
      description: "El cliente terminó sus pagos y puede solicitar un nuevo préstamo.",
      currentStep: 6,
      tone: "success",
    };
  }

  if (input.loanStatus === "activo") {
    const progress = termFortnights
      ? `Lleva ${paidInstallments} de ${termFortnights} quincenas pagadas.`
      : "El crédito se encuentra en etapa de pagos.";
    return {
      key: "activo",
      title: "Crédito activo",
      description: input.nextDueDate
        ? `${progress} Próximo vencimiento: ${input.nextDueDate}.`
        : progress,
      currentStep: 6,
      tone: "warning",
    };
  }

  if (input.loanStatus === "pendiente_desembolso" || input.applicationStatus === "aprobado") {
    return {
      key: "autorizado",
      title: "Autorizado, pendiente de entrega",
      description: "Falta confirmar la entrega del dinero para generar el calendario de pagos.",
      currentStep: 5,
      tone: "success",
    };
  }

  if (input.loanStatus === "cancelado" || input.applicationStatus === "cancelado") {
    return {
      key: "cancelado",
      title: "Proceso cancelado",
      description: "La solicitud o el crédito fue cancelado.",
      currentStep: input.loanStatus === "cancelado" ? 5 : 4,
      tone: "danger",
    };
  }

  if (input.applicationStatus === "rechazado") {
    return {
      key: "rechazado",
      title: "Solicitud no autorizada",
      description: "La evaluación terminó con una resolución negativa.",
      currentStep: 4,
      tone: "danger",
    };
  }

  if (input.applicationStatus === "oferta_pendiente") {
    return {
      key: "oferta_pendiente",
      title: "Oferta pendiente de aceptación",
      description: "El cliente debe entrar a su cuenta, aceptar la oferta y firmar el pagaré.",
      currentStep: 4,
      tone: "warning",
    };
  }

  if (input.applicationStatus === "en_revision") {
    const documentsReady = verifiedCount >= requiredCount;
    return {
      key: documentsReady ? "revision" : "documentos",
      title: documentsReady ? "Lista para resolución" : "Documentos en revisión",
      description: documentsReady
        ? "Los documentos requeridos están verificados; ya se puede resolver la solicitud."
        : `${verifiedCount} de ${requiredCount} documentos requeridos están verificados.`,
      currentStep: documentsReady ? 4 : 3,
      tone: "warning",
    };
  }

  if (input.applicationStatus === "borrador") {
    if (documentCount > 0) {
      return {
        key: "documentos",
        title: "Carga de documentos incompleta",
        description: `${documentCount} de ${requiredCount} documentos requeridos fueron cargados. Falta terminar y enviar la solicitud.`,
        currentStep: 3,
        tone: "warning",
      };
    }

    return {
      key: "solicitud",
      title: "Solicitud iniciada",
      description: "El cliente eligió monto y plazo, pero todavía no carga o envía sus documentos.",
      currentStep: 2,
      tone: "warning",
    };
  }

  return {
    key: "cuenta",
    title: "Cuenta creada",
    description: "El cliente todavía no inicia una solicitud de préstamo.",
    currentStep: 1,
    tone: "neutral",
  };
}
