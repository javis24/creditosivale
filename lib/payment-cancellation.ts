export type InstallmentAfterCancellation = {
  amountPaid: number;
  status: "pendiente" | "parcial" | "pagado";
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function reverseInstallmentAllocation(input: {
  amountDue: number;
  amountPaid: number;
  allocationAmount: number;
}): InstallmentAfterCancellation {
  const amountDue = roundMoney(input.amountDue);
  const amountPaid = roundMoney(input.amountPaid);
  const allocationAmount = roundMoney(input.allocationAmount);

  if (amountDue <= 0 || amountPaid < 0 || allocationAmount <= 0) {
    throw new Error("Los importes de la aplicación no son válidos.");
  }

  if (allocationAmount > amountPaid) {
    throw new Error("La aplicación a cancelar supera lo pagado en la quincena.");
  }

  const newAmountPaid = Math.max(0, roundMoney(amountPaid - allocationAmount));
  const status =
    newAmountPaid <= 0
      ? "pendiente"
      : newAmountPaid >= amountDue
        ? "pagado"
        : "parcial";

  return { amountPaid: newAmountPaid, status };
}

export function calculateLoanAfterCancellation(input: {
  totalDue: number;
  appliedPayments: number;
}) {
  const totalDue = roundMoney(input.totalDue);
  const amountPaid = roundMoney(input.appliedPayments);

  if (totalDue <= 0 || amountPaid < 0 || amountPaid > totalDue) {
    throw new Error("Los totales del crédito no son válidos.");
  }

  const balance = Math.max(0, roundMoney(totalDue - amountPaid));

  return {
    amountPaid,
    balance,
    status: balance <= 0 ? ("liquidado" as const) : ("activo" as const),
  };
}
