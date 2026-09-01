import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loanUuidSchema } from "@/lib/payment-validation";

export const dynamic = "force-dynamic";

type LoanRow = RowDataPacket & {
  id: number;
  uuid: string;
  application_uuid: string;
  status: string;
  principal: number;
  term_fortnights: number;
  installment_amount: number;
  total_due: number;
  amount_paid: number;
  balance: number;
  disbursement_date: string | null;
  first_due_date: string | null;
  maturity_date: string | null;
  activated_at: string | null;
  liquidated_at: string | null;
  client_name: string;
  client_uuid: string;
  phone: string | null;
  activated_by_name: string | null;
};

type InstallmentRow = RowDataPacket & {
  uuid: string;
  installment_number: number;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  status: string;
  paid_at: string | null;
};

type PaymentRow = RowDataPacket & {
  uuid: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  receiver_name: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  try {
    const actor = await requireApiUser(["admin", "gerencia", "vendedor"]);
    const { uuid: rawUuid } = await context.params;
    const uuid = loanUuidSchema.parse(rawUuid);
    const db = getDb();

    const [rows] = await db.execute<LoanRow[]>(
      `SELECT l.id, l.uuid, la.uuid AS application_uuid, l.status,
              l.principal, l.term_fortnights, l.installment_amount,
              l.total_due, l.amount_paid, l.balance,
              l.disbursement_date, l.first_due_date, l.maturity_date,
              l.activated_at, l.liquidated_at,
              u.uuid AS client_uuid,
              TRIM(CONCAT_WS(' ', u.first_name, u.paternal_last_name,
                                  u.maternal_last_name)) AS client_name,
              u.phone,
              TRIM(CONCAT_WS(' ', activator.first_name,
                                  activator.paternal_last_name,
                                  activator.maternal_last_name)) AS activated_by_name
         FROM loans l
         INNER JOIN loan_applications la ON la.id = l.application_id
         INNER JOIN users u ON u.id = l.user_id
         LEFT JOIN users activator ON activator.id = l.activated_by
        WHERE l.uuid = ?
        LIMIT 1`,
      [uuid],
    );
    const loan = rows[0];

    if (!loan) throw new ApiError(404, "Crédito no encontrado.", "LOAN_NOT_FOUND");

    const [[installments], [payments]] = await Promise.all([
      db.execute<InstallmentRow[]>(
        `SELECT uuid, installment_number, due_date, amount_due,
                amount_paid, status, paid_at
           FROM loan_installments
          WHERE loan_id = ?
          ORDER BY installment_number`,
        [loan.id],
      ),
      db.execute<PaymentRow[]>(
        `SELECT lp.uuid, lp.amount, lp.payment_date, lp.payment_method,
                lp.reference, lp.notes, lp.created_at,
                TRIM(CONCAT_WS(' ', u.first_name, u.paternal_last_name,
                                    u.maternal_last_name)) AS receiver_name
           FROM loan_payments lp
           INNER JOIN users u ON u.id = lp.received_by
          WHERE lp.loan_id = ?
          ORDER BY lp.payment_date DESC, lp.created_at DESC`,
        [loan.id],
      ),
    ]);

    return NextResponse.json({
      ok: true,
      permissions: { canManage: ["admin", "gerencia"].includes(actor.role) },
      loan: {
        uuid: loan.uuid,
        applicationUuid: loan.application_uuid,
        status: loan.status,
        principal: Number(loan.principal),
        termFortnights: Number(loan.term_fortnights),
        installmentAmount: Number(loan.installment_amount),
        totalDue: Number(loan.total_due),
        amountPaid: Number(loan.amount_paid),
        balance: Number(loan.balance),
        disbursementDate: loan.disbursement_date,
        firstDueDate: loan.first_due_date,
        maturityDate: loan.maturity_date,
        activatedAt: loan.activated_at,
        liquidatedAt: loan.liquidated_at,
        activatedByName: loan.activated_by_name,
        client: {
          uuid: loan.client_uuid,
          name: loan.client_name,
          phone: loan.phone,
        },
        installments: installments.map((item) => ({
          uuid: item.uuid,
          installmentNumber: Number(item.installment_number),
          dueDate: item.due_date,
          amountDue: Number(item.amount_due),
          amountPaid: Number(item.amount_paid),
          status: item.status,
          paidAt: item.paid_at,
        })),
        payments: payments.map((payment) => ({
          uuid: payment.uuid,
          amount: Number(payment.amount),
          paymentDate: payment.payment_date,
          paymentMethod: payment.payment_method,
          reference: payment.reference,
          notes: payment.notes,
          createdAt: payment.created_at,
          receiverName: payment.receiver_name,
        })),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
