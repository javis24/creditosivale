export type InstallmentScheduleItem = {
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function parseIsoDate(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("La fecha debe tener el formato AAAA-MM-DD.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const test = new Date(Date.UTC(year, month - 1, day));

  if (
    test.getUTCFullYear() !== year ||
    test.getUTCMonth() !== month - 1 ||
    test.getUTCDate() !== day
  ) {
    throw new Error("La fecha no es válida.");
  }

  return { year, month, day };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function monthEndPaymentDate(year: number, month: number) {
  return isoDate(year, month, Math.min(30, daysInMonth(year, month)));
}

export function firstFortnightDueDate(disbursementDate: string) {
  const { year, month, day } = parseIsoDate(disbursementDate);

  if (day <= 6) return isoDate(year, month, 15);
  if (day <= 21) return monthEndPaymentDate(year, month);

  const next = addMonth(year, month);
  return isoDate(next.year, next.month, 15);
}

function nextFortnightDueDate(currentDate: string) {
  const { year, month, day } = parseIsoDate(currentDate);

  if (day === 15) return monthEndPaymentDate(year, month);

  const next = addMonth(year, month);
  return isoDate(next.year, next.month, 15);
}

export function buildFortnightSchedule(
  disbursementDate: string,
  termFortnights: number,
  installmentAmount: number,
): InstallmentScheduleItem[] {
  if (!Number.isInteger(termFortnights) || termFortnights < 1 || termFortnights > 48) {
    throw new Error("El plazo del crédito no es válido.");
  }

  if (!Number.isFinite(installmentAmount) || installmentAmount <= 0) {
    throw new Error("El pago quincenal no es válido.");
  }

  const schedule: InstallmentScheduleItem[] = [];
  let dueDate = firstFortnightDueDate(disbursementDate);

  for (let index = 1; index <= termFortnights; index += 1) {
    schedule.push({
      installmentNumber: index,
      dueDate,
      amountDue: Number(installmentAmount.toFixed(2)),
    });
    dueDate = nextFortnightDueDate(dueDate);
  }

  return schedule;
}

