import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { buildFortnightSchedule } from "@/lib/payment-schedule";
import { activateLoanSchema, loanUuidSchema } from "@/lib/payment-validation";

type LoanRow = RowDataPacket & {
  id: number;
  user_id: number;
  status: string;
  term_fortnights: number;
  installment_amount: number;
};

function todayInMexico() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(
  request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  let connection: PoolConnection | undefined;

  try {
    const actor = await requireApiUser(["admin", "gerencia"]);
    const { uuid: rawUuid } = await context.params;
    const uuid = loanUuidSchema.parse(rawUuid);
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Los datos enviados no son válidos.", "INVALID_JSON");
    });
    const data = activateLoanSchema.parse(body);

    if (data.disbursementDate > todayInMexico()) {
      throw new ApiError(
        400,
        "La fecha de entrega no puede estar en el futuro.",
        "FUTURE_DISBURSEMENT_DATE",
      );
    }

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute<LoanRow[]>(
      `SELECT id, user_id, status, term_fortnights, installment_amount
         FROM loans
        WHERE uuid = ?
        LIMIT 1
        FOR UPDATE`,
      [uuid],
    );
    const loan = rows[0];

    if (!loan) throw new ApiError(404, "Crédito no encontrado.", "LOAN_NOT_FOUND");
    if (loan.status !== "pendiente_desembolso") {
      throw new ApiError(
        409,
        "Este crédito ya fue activado o no puede dispersarse.",
        "LOAN_ALREADY_ACTIVATED",
      );
    }

    const schedule = buildFortnightSchedule(
      data.disbursementDate,
      Number(loan.term_fortnights),
      Number(loan.installment_amount),
    );

    for (const installment of schedule) {
      await connection.execute(
        `INSERT INTO loan_installments (
           uuid, loan_id, installment_number, due_date, amount_due
         ) VALUES (?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          loan.id,
          installment.installmentNumber,
          installment.dueDate,
          installment.amountDue,
        ],
      );
    }

    await connection.execute(
      `UPDATE loans
          SET status = 'activo',
              disbursement_date = ?,
              first_due_date = ?,
              maturity_date = ?,
              activated_by = ?,
              activated_at = NOW()
        WHERE id = ?`,
      [
        data.disbursementDate,
        schedule[0].dueDate,
        schedule[schedule.length - 1].dueDate,
        actor.id,
        loan.id,
      ],
    );

    await connection.execute(
      `INSERT INTO notifications
        (user_id, notification_type, title, message)
       VALUES (?, 'loan_activated', 'Crédito entregado', ?)`,
      [
        loan.user_id,
        `Tu crédito quedó activo. Tu primer pago vence el ${schedule[0].dueDate}.`,
      ],
    );

    await connection.commit();

    return NextResponse.json({
      ok: true,
      status: "activo",
      firstDueDate: schedule[0].dueDate,
      maturityDate: schedule[schedule.length - 1].dueDate,
      message: "Crédito activado y calendario generado correctamente.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
