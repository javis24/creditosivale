import type { ClientProcessKey } from "@/lib/client-process";

export type ProcessWhatsAppMessageInput = {
  process: ClientProcessKey;
  clientName: string;
  amount?: number | null;
  installmentAmount?: number | null;
  termFortnights?: number | null;
  installmentNumber?: number | null;
  dueDate?: string | null;
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const date = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  timeZone: "America/Monterrey",
});

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "cliente";
}

function formatAmount(value?: number | null) {
  return value && value > 0 ? money.format(value) : null;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return date.format(new Date(`${value}T12:00:00-06:00`));
}

export function buildProcessWhatsAppMessage(input: ProcessWhatsAppMessageInput) {
  const greeting = `Hola ${firstName(input.clientName)},`;
  const amount = formatAmount(input.amount);
  const installment = formatAmount(input.installmentAmount);
  const dueDate = formatDate(input.dueDate);

  switch (input.process) {
    case "cuenta":
      return `${greeting} tu cuenta de Crédito Sí Vale ya está lista. Entra con tu número de WhatsApp para iniciar tu solicitud de préstamo.`;
    case "solicitud":
      return `${greeting} vemos que iniciaste tu solicitud de Crédito Sí Vale. Entra a tu cuenta para completar los datos y continuar con tus documentos.`;
    case "documentos":
      return `${greeting} tu solicitud está en la etapa de documentos. Revisa tu cuenta para confirmar si falta algún archivo o si necesitas corregirlo para continuar.`;
    case "revision":
      return `${greeting} tus documentos fueron recibidos y tu solicitud de Crédito Sí Vale está en evaluación. Te avisaremos en cuanto tengamos una resolución.`;
    case "oferta_pendiente":
      return `${greeting} tenemos una oferta de Crédito Sí Vale${amount ? ` por ${amount}` : ""}${installment ? `, con pagos de ${installment}` : ""}${input.termFortnights ? ` durante ${input.termFortnights} quincenas` : ""}. Entra a tu cuenta para revisarla, aceptarla y firmar el pagaré.`;
    case "autorizado":
      return `${greeting} ¡tu crédito de Crédito Sí Vale${amount ? ` por ${amount}` : ""} fue autorizado!${installment ? ` Tu pago será de ${installment}` : ""}${input.termFortnights ? ` durante ${input.termFortnights} quincenas` : ""}. Verifica en tu cuenta los datos de la tarjeta donde recibirás el depósito. Nos comunicaremos contigo para coordinar la entrega.`;
    case "activo":
      return `${greeting} te recordamos que tu próximo pago de Crédito Sí Vale${input.installmentNumber && input.termFortnights ? ` corresponde al pago ${input.installmentNumber} de ${input.termFortnights}` : ""}${installment ? ` por ${installment}` : ""}${dueDate ? `, con fecha límite el ${dueDate}` : ""}. Si ya pagaste, ignora este mensaje. Gracias.`;
    case "liquidado":
      return `${greeting} ¡felicidades! Tu crédito de Crédito Sí Vale quedó liquidado. Ya puedes entrar a tu cuenta y solicitar un nuevo préstamo cuando lo necesites.`;
    case "rechazado":
      return `${greeting} concluyó la revisión de tu solicitud de Crédito Sí Vale y en esta ocasión no fue autorizada. Entra a tu cuenta para consultar el estado o comunícate con nosotros si tienes dudas.`;
    case "cancelado":
      return `${greeting} tu proceso de Crédito Sí Vale aparece como cancelado. Si deseas aclararlo o iniciar otro proceso, comunícate con nosotros.`;
  }
}
