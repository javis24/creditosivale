import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type CreditOptionRow = RowDataPacket & {
  amount: number;
  term_fortnights: number;
  fortnight_payment: number;
};

export async function GET() {
  try {
    await requireApiUser();

    const [rows] = await getDb().execute<CreditOptionRow[]>(
      `SELECT amount, term_fortnights, fortnight_payment
         FROM credit_options
        WHERE status = 'activo'
        ORDER BY amount ASC, term_fortnights ASC`,
    );

    return NextResponse.json({
      ok: true,
      options: rows.map((row) => ({
        amount: Number(row.amount),
        termFortnights: Number(row.term_fortnights),
        fortnightPayment: Number(row.fortnight_payment),
        totalPayment: Number(row.term_fortnights) * Number(row.fortnight_payment),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
