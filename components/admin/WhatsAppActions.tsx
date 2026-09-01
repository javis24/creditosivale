"use client";

import { normalizeMexicanWhatsapp } from "@/lib/phone";

type BaseProps = {
  phone: string | null;
  clientName: string;
};

type PaymentReminderProps = BaseProps & {
  amount: number;
  dueDate: string;
  installmentNumber: number;
  termFortnights: number;
};

type ApprovalNoticeProps = BaseProps & {
  approvedAmount: number;
  installmentAmount: number;
  termFortnights: number;
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const date = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "long",
  timeZone: "America/Monterrey",
});

function whatsappNumber(phone: string | null) {
  if (!phone) return null;
  const normalized = normalizeMexicanWhatsapp(phone);
  return /^\d{10}$/.test(normalized) ? `52${normalized}` : null;
}

function whatsappUrl(phone: string | null, message: string) {
  const number = whatsappNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "cliente";
}

function WhatsAppButton({
  url,
  children,
}: {
  url: string | null;
  children: React.ReactNode;
}) {
  if (!url) {
    return (
      <span className="button button-whatsapp button-disabled" title="WhatsApp no válido">
        WhatsApp no disponible
      </span>
    );
  }

  return (
    <a
      className="button button-whatsapp"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

export function WhatsAppPaymentReminder({
  phone,
  clientName,
  amount,
  dueDate,
  installmentNumber,
  termFortnights,
}: PaymentReminderProps) {
  const message =
    `Hola ${firstName(clientName)}, te recordamos que tu próximo pago de ` +
    `Crédito Sí Vale corresponde al pago ${installmentNumber} de ${termFortnights}, ` +
    `por ${money.format(amount)} MXN, con fecha límite el ` +
    `${date.format(new Date(`${dueDate}T12:00:00-06:00`))}. ` +
    "Si ya realizaste tu pago, por favor ignora este mensaje. Gracias.";

  return (
    <WhatsAppButton url={whatsappUrl(phone, message)}>
      Recordar próximo pago
    </WhatsAppButton>
  );
}

export function WhatsAppApprovalNotice({
  phone,
  clientName,
  approvedAmount,
  installmentAmount,
  termFortnights,
}: ApprovalNoticeProps) {
  const message =
    `Hola ${firstName(clientName)}, ¡tenemos buenas noticias! Tu crédito de ` +
    `Crédito Sí Vale por ${money.format(approvedAmount)} MXN fue autorizado. ` +
    `Tu pago será de ${money.format(installmentAmount)} MXN durante ` +
    `${termFortnights} quincenas. Nos comunicaremos contigo para coordinar la entrega.`;

  return (
    <WhatsAppButton url={whatsappUrl(phone, message)}>
      Avisar crédito autorizado
    </WhatsAppButton>
  );
}
