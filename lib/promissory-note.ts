import { ApiError } from "@/lib/api-error";

export type PromissoryApplication = {
  uuid: string;
  requested_amount: number;
  term_fortnights: number;
  fortnight_payment: number;
  total_payment: number;
  full_name: string;
  address: string | null;
  postal_code: string | null;
};

function requiredBusinessSetting(name: string) {
  const value = process.env[name]?.trim();

  if (!value || value.startsWith("CAMBIA_")) {
    throw new ApiError(
      503,
      `Falta configurar ${name} antes de firmar solicitudes.`,
      "BUSINESS_CONFIGURATION_REQUIRED",
    );
  }

  return value;
}

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(value);
}

export function getPromissoryBusinessSettings() {
  return {
    lenderName: requiredBusinessSetting("LENDER_LEGAL_NAME"),
    paymentPlace: requiredBusinessSetting("LENDER_PAYMENT_PLACE"),
  };
}

export function buildPromissoryNote(input: {
  application: PromissoryApplication;
  lenderName: string;
  paymentPlace: string;
}) {
  const date = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeZone: "America/Monterrey",
  }).format(new Date());
  const { application, lenderName, paymentPlace } = input;

  return [
    "PAGARÉ ELECTRÓNICO SUJETO A AUTORIZACIÓN Y DISPERSIÓN DEL CRÉDITO",
    `Folio de solicitud: ${application.uuid}`,
    `Lugar y fecha de suscripción: ${paymentPlace}, ${date}`,
    "",
    `Suscriptor: ${application.full_name}`,
    `Domicilio declarado: ${application.address || "No especificado"}, C.P. ${application.postal_code || "No especificado"}`,
    "",
    `En caso de que el crédito solicitado por ${money(Number(application.requested_amount))} sea autorizado y los recursos sean efectivamente entregados, prometo pagar incondicionalmente a la orden de ${lenderName}, en ${paymentPlace}, la suma total de ${money(Number(application.total_payment))}.`,
    `El pago se realizará en ${application.term_fortnights} exhibiciones quincenales de ${money(Number(application.fortnight_payment))} cada una, los días 15 y 30 conforme al calendario definitivo que se entregue al momento de la autorización y dispersión.`,
    "",
    "La firma capturada en esta solicitud acredita la aceptación de los términos mostrados. La solicitud no representa por sí misma autorización ni entrega de recursos. El documento definitivo y su calendario deberán conservar su integridad, trazabilidad y accesibilidad durante toda su vigencia.",
  ].join("\n");
}
