import { randomUUID } from "node:crypto";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loanUuidSchema, registerPaymentSchema } from "@/lib/payment-validation";

type LoanRow = RowDataPacket & {
  id: number;
  user_id: number;
  status: string;
  total_due: number;
  amount_paid: number;
  balance: number;
};

type InstallmentRow = RowDataPacket & {
  id: number;
  amount_due: number;
  amount_paid: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

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
    const data = registerPaymentSchema.parse(body);
    const amount = roundMoney(data.amount);

    if (data.paymentDate > todayInMexico()) {
      throw new ApiError(
        400,
        "La fecha del pago no puede estar en el futuro.",
        "FUTURE_PAYMENT_DATE",
      );
    }

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [loanRows] = await connection.execute<LoanRow[]>(
      `SELECT id, user_id, status, total_due, amount_paid, balance
         FROM loans
        WHERE uuid = ?
        LIMIT 1
        FOR UPDATE`,
      [uuid],
    );
    const loan = loanRows[0];

    if (!loan) throw new ApiError(404, "Crédito no encontrado.", "LOAN_NOT_FOUND");
    if (loan.status !== "activo") {
      throw new ApiError(
        409,
        "Sólo se pueden registrar pagos en un crédito activo.",
        "LOAN_NOT_ACTIVE",
      );
    }

    const balance = roundMoney(Number(loan.balance));
    if (amount > balance) {
      throw new ApiError(
        400,
        `El pago no puede ser mayor al saldo de $ ${balance.toFixed(2)}.`,
        "PAYMENT_EXCEEDS_BALANCE",
      );
    }

    const [installments] = await connection.execute<InstallmentRow[]>(
      `SELECT id, amount_due, amount_paid
         FROM loan_installments
        WHERE loan_id = ?
          AND amount_paid < amount_due
        ORDER BY installment_number
        FOR UPDATE`,
      [loan.id],
    );

    if (!installments.length) {
      throw new ApiError(
        409,
        "El crédito no tiene quincenas pendientes.",
        "NO_PENDING_INSTALLMENTS",
      );
    }

    const paymentUuid = randomUUID();
    const [paymentResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO loan_payments (
         uuid, loan_id, amount, payment_date, payment_method,
         reference, notes, received_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paymentUuid,
        loan.id,
        amount,
        data.paymentDate,
        data.paymentMethod,
        data.reference || null,
        data.notes || null,
        actor.id,
      ],
    );

    let remaining = amount;
    for (const installment of installments) {
      if (remaining <= 0) break;

      const pending = roundMoney(
        Number(installment.amount_due) - Number(installment.amount_paid),
      );
      const allocation = roundMoney(Math.min(remaining, pending));
      const newPaid = roundMoney(Number(installment.amount_paid) + allocation);
      const completed = newPaid >= roundMoney(Number(installment.amount_due));

      await connection.execute(
        `INSERT INTO loan_payment_allocations
          (payment_id, installment_id, amount)
         VALUES (?, ?, ?)`,
        [paymentResult.insertId, installment.id, allocation],
      );
      await connection.execute(
        `UPDATE loan_installments
            SET amount_paid = ?,
                status = ?,
                paid_at = CASE WHEN ? = 1 THEN NOW() ELSE NULL END
          WHERE id = ?`,
        [newPaid, completed ? "pagado" : "parcial", completed ? 1 : 0, installment.id],
      );

      remaining = roundMoney(remaining - allocation);
    }

    if (remaining > 0) {
      throw new ApiError(
        409,
        "No fue posible distribuir el pago en el calendario.",
        "PAYMENT_ALLOCATION_FAILED",
      );
    }

    const newAmountPaid = roundMoney(Number(loan.amount_paid) + amount);
    const newBalance = roundMoney(Number(loan.total_due) - newAmountPaid);
    const liquidated = newBalance <= 0;

    await connection.execute(
      `UPDATE loans
          SET amount_paid = ?,
              balance = ?,
              status = ?,
              liquidated_at = CASE WHEN ? = 1 THEN NOW() ELSE NULL END
        WHERE id = ?`,
      [
        newAmountPaid,
        Math.max(0, newBalance),
        liquidated ? "liquidado" : "activo",
        liquidated ? 1 : 0,
        loan.id,
      ],
    );

    const message = liquidated
      ? "Tu crédito quedó liquidado. Ya puedes solicitar un nuevo préstamo."
      : `Recibimos tu pago de $ ${amount.toFixed(2)}. Saldo pendiente: $ ${newBalance.toFixed(2)}.`;
    await connection.execute(
      `INSERT INTO notifications
        (user_id, notification_type, title, message)
       VALUES (?, ?, ?, ?)`,
      [
        loan.user_id,
        liquidated ? "loan_liquidated" : "loan_payment_received",
        liquidated ? "Crédito liquidado" : "Pago registrado",
        message,
      ],
    );

    await connection.commit();

    return NextResponse.json({
      ok: true,
      payment: { uuid: paymentUuid, amount, paymentDate: data.paymentDate },
      loan: {
        status: liquidated ? "liquidado" : "activo",
        amountPaid: newAmountPaid,
        balance: Math.max(0, newBalance),
      },
      message,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
