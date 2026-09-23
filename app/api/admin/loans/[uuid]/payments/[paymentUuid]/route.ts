import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  calculateLoanAfterCancellation,
  reverseInstallmentAllocation,
} from "@/lib/payment-cancellation";
import { cancelPaymentSchema, loanUuidSchema } from "@/lib/payment-validation";

type LoanRow = RowDataPacket & {
  id: number;
  user_id: number;
  status: string;
  total_due: number;
};

type PaymentRow = RowDataPacket & {
  id: number;
  amount: number;
  status: "aplicado" | "cancelado";
};

type AllocationRow = RowDataPacket & {
  installment_id: number;
  amount: number;
  amount_due: number;
  amount_paid: number;
  paid_at: string | null;
};

type PaymentTotalRow = RowDataPacket & {
  applied_total: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ uuid: string; paymentUuid: string }> },
) {
  let connection: PoolConnection | undefined;

  try {
    const actor = await requireApiUser(["admin", "gerencia"]);
    const params = await context.params;
    const loanUuid = loanUuidSchema.parse(params.uuid);
    const paymentUuid = loanUuidSchema.parse(params.paymentUuid);
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Los datos enviados no son válidos.", "INVALID_JSON");
    });
    const { reason } = cancelPaymentSchema.parse(body);

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [loanRows] = await connection.execute<LoanRow[]>(
      `SELECT id, user_id, status, total_due
         FROM loans
        WHERE uuid = ?
        LIMIT 1
        FOR UPDATE`,
      [loanUuid],
    );
    const loan = loanRows[0];

    if (!loan) throw new ApiError(404, "Crédito no encontrado.", "LOAN_NOT_FOUND");
    if (![
      "activo",
      "liquidado",
    ].includes(loan.status)) {
      throw new ApiError(
        409,
        "Este crédito no permite cancelar pagos.",
        "LOAN_PAYMENT_CANCELLATION_NOT_ALLOWED",
      );
    }

    const [paymentRows] = await connection.execute<PaymentRow[]>(
      `SELECT id, amount, status
         FROM loan_payments
        WHERE uuid = ?
          AND loan_id = ?
        LIMIT 1
        FOR UPDATE`,
      [paymentUuid, loan.id],
    );
    const payment = paymentRows[0];

    if (!payment) {
      throw new ApiError(404, "Pago no encontrado.", "PAYMENT_NOT_FOUND");
    }
    if (payment.status === "cancelado") {
      throw new ApiError(409, "Este pago ya fue cancelado.", "PAYMENT_ALREADY_CANCELLED");
    }

    const [allocations] = await connection.execute<AllocationRow[]>(
      `SELECT lpa.installment_id, lpa.amount,
              li.amount_due, li.amount_paid, li.paid_at
         FROM loan_payment_allocations lpa
         INNER JOIN loan_installments li ON li.id = lpa.installment_id
        WHERE lpa.payment_id = ?
        ORDER BY li.installment_number
        FOR UPDATE`,
      [payment.id],
    );

    const allocationTotal = roundMoney(
      allocations.reduce((total, allocation) => total + Number(allocation.amount), 0),
    );
    if (
      !allocations.length ||
      Math.abs(allocationTotal - roundMoney(Number(payment.amount))) > 0.01
    ) {
      throw new ApiError(
        409,
        "El pago tiene aplicaciones inconsistentes y no puede cancelarse automáticamente.",
        "PAYMENT_ALLOCATION_INCONSISTENT",
      );
    }

    for (const allocation of allocations) {
      const allocationAmount = Number(allocation.amount);
      const currentPaid = Number(allocation.amount_paid);
      if (allocationAmount > currentPaid + 0.001) {
        throw new ApiError(
          409,
          "El calendario no coincide con el pago. Ejecuta la revisión de base de datos.",
          "INSTALLMENT_PAYMENT_INCONSISTENT",
        );
      }

      const reversed = reverseInstallmentAllocation({
        amountDue: Number(allocation.amount_due),
        amountPaid: currentPaid,
        allocationAmount,
      });

      await connection.execute(
        `UPDATE loan_installments
            SET amount_paid = ?, status = ?, paid_at = ?
          WHERE id = ?`,
        [
          reversed.amountPaid,
          reversed.status,
          reversed.status === "pagado" ? allocation.paid_at : null,
          allocation.installment_id,
        ],
      );
    }

    await connection.execute(
      `UPDATE loan_payments
          SET status = 'cancelado',
              cancellation_reason = ?,
              cancelled_at = NOW(),
              cancelled_by = ?
        WHERE id = ?`,
      [reason, actor.id, payment.id],
    );

    const [totalRows] = await connection.execute<PaymentTotalRow[]>(
      `SELECT COALESCE(SUM(amount), 0) AS applied_total
         FROM loan_payments
        WHERE loan_id = ?
          AND status = 'aplicado'`,
      [loan.id],
    );

    let updatedLoan;
    try {
      updatedLoan = calculateLoanAfterCancellation({
        totalDue: Number(loan.total_due),
        appliedPayments: Number(totalRows[0]?.applied_total || 0),
      });
    } catch {
      throw new ApiError(
        409,
        "Los totales del crédito son inconsistentes y requieren revisión.",
        "LOAN_TOTALS_INCONSISTENT",
      );
    }

    await connection.execute(
      `UPDATE loans
          SET amount_paid = ?,
              balance = ?,
              status = ?,
              liquidated_at = ?
        WHERE id = ?`,
      [
        updatedLoan.amountPaid,
        updatedLoan.balance,
        updatedLoan.status,
        updatedLoan.status === "liquidado" ? new Date() : null,
        loan.id,
      ],
    );

    const cancelledAmount = roundMoney(Number(payment.amount));
    const message =
      `Se corrigió un pago de $ ${cancelledAmount.toFixed(2)} registrado por error. ` +
      `Tu saldo pendiente actualizado es $ ${updatedLoan.balance.toFixed(2)}.`;
    await connection.execute(
      `INSERT INTO notifications
        (user_id, notification_type, title, message)
       VALUES (?, 'loan_payment_cancelled', 'Corrección de pago', ?)`,
      [loan.user_id, message],
    );

    await connection.commit();

    return NextResponse.json({
      ok: true,
      message: "El pago se canceló y el saldo fue recalculado correctamente.",
      payment: { uuid: paymentUuid, status: "cancelado" },
      loan: updatedLoan,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
