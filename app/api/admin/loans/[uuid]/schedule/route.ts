import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildFortnightSchedule } from "@/lib/payment-schedule";
import { loanUuidSchema } from "@/lib/payment-validation";

type LoanRow = RowDataPacket & {
  id: number;
  user_id: number;
  status: string;
  term_fortnights: number;
  installment_amount: number;
  amount_paid: number;
  disbursement_date: string | null;
};

type InstallmentRow = RowDataPacket & {
  id: number;
  installment_number: number;
  due_date: string;
  amount_paid: number;
};

type IdRow = RowDataPacket & { id: number };

export async function POST(
  _request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  let connection: PoolConnection | undefined;

  try {
    await requireApiUser(["admin", "gerencia"]);
    const { uuid: rawUuid } = await context.params;
    const uuid = loanUuidSchema.parse(rawUuid);

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [loanRows] = await connection.execute<LoanRow[]>(
      `SELECT id, user_id, status, term_fortnights, installment_amount,
              amount_paid, disbursement_date
         FROM loans
        WHERE uuid = ?
        LIMIT 1
        FOR UPDATE`,
      [uuid],
    );
    const loan = loanRows[0];

    if (!loan) throw new ApiError(404, "Crédito no encontrado.", "LOAN_NOT_FOUND");
    if (loan.status !== "activo" || !loan.disbursement_date) {
      throw new ApiError(
        409,
        "Sólo se puede actualizar el calendario de un crédito activo.",
        "LOAN_SCHEDULE_NOT_EDITABLE",
      );
    }
    if (Number(loan.amount_paid) !== 0) {
      throw new ApiError(
        409,
        "El calendario ya tiene pagos y no puede recalcularse.",
        "LOAN_SCHEDULE_HAS_PAYMENTS",
      );
    }

    const [activePayments] = await connection.execute<IdRow[]>(
      `SELECT id
         FROM loan_payments
        WHERE loan_id = ?
          AND status = 'aplicado'
        LIMIT 1
        FOR UPDATE`,
      [loan.id],
    );
    if (activePayments.length) {
      throw new ApiError(
        409,
        "Existe un pago aplicado y el calendario no puede recalcularse.",
        "LOAN_SCHEDULE_HAS_PAYMENTS",
      );
    }

    const [installments] = await connection.execute<InstallmentRow[]>(
      `SELECT id, installment_number, due_date, amount_paid
         FROM loan_installments
        WHERE loan_id = ?
        ORDER BY installment_number
        FOR UPDATE`,
      [loan.id],
    );
    const termFortnights = Number(loan.term_fortnights);
    if (
      installments.length !== termFortnights ||
      installments.some((installment) => Number(installment.amount_paid) !== 0)
    ) {
      throw new ApiError(
        409,
        "El calendario tiene datos inconsistentes y requiere revisión.",
        "LOAN_SCHEDULE_INCONSISTENT",
      );
    }

    const schedule = buildFortnightSchedule(
      loan.disbursement_date,
      termFortnights,
      Number(loan.installment_amount),
    );
    const alreadyUpdated = schedule.every(
      (item, index) => installments[index]?.due_date === item.dueDate,
    );

    if (alreadyUpdated) {
      await connection.commit();
      return NextResponse.json({
        ok: true,
        firstDueDate: schedule[0].dueDate,
        maturityDate: schedule[schedule.length - 1].dueDate,
        message: "El calendario ya comienza en la quincena inmediata siguiente.",
      });
    }

    for (const item of schedule) {
      const installment = installments[item.installmentNumber - 1];
      await connection.execute(
        `UPDATE loan_installments
            SET due_date = ?, status = 'pendiente', paid_at = NULL
          WHERE id = ?`,
        [item.dueDate, installment.id],
      );
    }

    await connection.execute(
      `UPDATE loans
          SET first_due_date = ?, maturity_date = ?
        WHERE id = ?`,
      [schedule[0].dueDate, schedule[schedule.length - 1].dueDate, loan.id],
    );

    await connection.execute(
      `INSERT INTO notifications
        (user_id, notification_type, title, message)
       VALUES (?, 'loan_schedule_updated', 'Calendario actualizado', ?)`,
      [
        loan.user_id,
        `Tu calendario fue actualizado. Tu primer pago vence el ${schedule[0].dueDate}.`,
      ],
    );

    await connection.commit();

    return NextResponse.json({
      ok: true,
      firstDueDate: schedule[0].dueDate,
      maturityDate: schedule[schedule.length - 1].dueDate,
      message: "El calendario se actualizó a la quincena inmediata siguiente.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
