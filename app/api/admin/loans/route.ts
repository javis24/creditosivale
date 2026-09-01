import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loanStatusSchema } from "@/lib/payment-validation";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.union([loanStatusSchema, z.literal("todos")]).default("todos"),
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

type CountRow = RowDataPacket & { total: number };

type LoanRow = RowDataPacket & {
  uuid: string;
  status: string;
  principal: number;
  installment_amount: number;
  term_fortnights: number;
  total_due: number;
  amount_paid: number;
  balance: number;
  disbursement_date: string | null;
  maturity_date: string | null;
  next_due_date: string | null;
  next_due_balance: number | null;
  paid_installments: number;
  client_name: string;
  phone: string | null;
};

export async function GET(request: Request) {
  try {
    await requireApiUser(["admin", "gerencia", "vendedor"]);
    const url = new URL(request.url);
    const query = querySchema.parse({
      status: url.searchParams.get("status") || undefined,
      q: url.searchParams.get("q") || undefined,
      page: url.searchParams.get("page") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });

    const conditions: string[] = [];
    const parameters: Array<string | number> = [];

    if (query.status !== "todos") {
      conditions.push(`l.status = '${query.status}'`);
    }

    if (query.q) {
      const search = `%${query.q}%`;
      conditions.push(`(
        CONCAT_WS(' ', u.first_name, u.paternal_last_name, u.maternal_last_name) LIKE ?
        OR u.phone LIKE ?
        OR l.uuid LIKE ?
      )`);
      parameters.push(search, search, search);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    const db = getDb();

    const [[countRows], [rows]] = await Promise.all([
      db.execute<CountRow[]>(
        `SELECT COUNT(*) AS total
           FROM loans l
           INNER JOIN users u ON u.id = l.user_id
           ${where}`,
        parameters,
      ),
      db.execute<LoanRow[]>(
        `SELECT l.uuid, l.status, l.principal, l.installment_amount,
                l.term_fortnights, l.total_due, l.amount_paid, l.balance,
                l.disbursement_date, l.maturity_date,
                TRIM(CONCAT_WS(' ', u.first_name, u.paternal_last_name,
                                    u.maternal_last_name)) AS client_name,
                u.phone,
                (
                  SELECT MIN(li.due_date)
                    FROM loan_installments li
                   WHERE li.loan_id = l.id
                     AND li.amount_paid < li.amount_due
                ) AS next_due_date,
                (
                  SELECT li.amount_due - li.amount_paid
                    FROM loan_installments li
                   WHERE li.loan_id = l.id
                     AND li.amount_paid < li.amount_due
                   ORDER BY li.installment_number
                   LIMIT 1
                ) AS next_due_balance,
                (
                  SELECT COUNT(*)
                    FROM loan_installments li
                   WHERE li.loan_id = l.id
                     AND li.status = 'pagado'
                ) AS paid_installments
           FROM loans l
           INNER JOIN users u ON u.id = l.user_id
           ${where}
          ORDER BY FIELD(l.status, 'activo', 'pendiente_desembolso',
                         'liquidado', 'cancelado'),
                   COALESCE(l.disbursement_date, DATE(l.created_at)) DESC
          LIMIT ? OFFSET ?`,
        [...parameters, query.limit, offset],
      ),
    ]);

    const total = Number(countRows[0]?.total || 0);
    return NextResponse.json({
      ok: true,
      loans: rows.map((row) => ({
        uuid: row.uuid,
        status: row.status,
        principal: Number(row.principal),
        installmentAmount: Number(row.installment_amount),
        termFortnights: Number(row.term_fortnights),
        totalDue: Number(row.total_due),
        amountPaid: Number(row.amount_paid),
        balance: Number(row.balance),
        disbursementDate: row.disbursement_date,
        maturityDate: row.maturity_date,
        nextDueDate: row.next_due_date,
        nextDueBalance:
          row.next_due_balance === null ? null : Number(row.next_due_balance),
        paidInstallments: Number(row.paid_installments),
        clientName: row.client_name,
        phone: row.phone,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
