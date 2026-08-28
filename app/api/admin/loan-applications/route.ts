import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "@/lib/api-error";
import { adminApplicationStatusSchema } from "@/lib/admin-loan-validation";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.union([adminApplicationStatusSchema, z.literal("todas")]).default("en_revision"),
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

type CountRow = RowDataPacket & { total: number };

type ApplicationRow = RowDataPacket & {
  uuid: string;
  status: string;
  requested_amount: number;
  term_fortnights: number;
  fortnight_payment: number;
  total_payment: number;
  purpose: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  client_name: string;
  phone: string | null;
  document_count: number;
  verified_count: number;
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

    // El valor está validado por un enum cerrado antes de incorporarlo al SQL.
    if (query.status !== "todas") {
      conditions.push(`la.status = '${query.status}'`);
    }

    if (query.q) {
      conditions.push(`(
        CONCAT_WS(' ', u.first_name, u.paternal_last_name, u.maternal_last_name) LIKE ?
        OR u.phone LIKE ?
        OR la.uuid LIKE ?
      )`);
      const search = `%${query.q}%`;
      parameters.push(search, search, search);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (query.page - 1) * query.limit;
    const db = getDb();

    const [[countRows], [rows]] = await Promise.all([
      db.execute<CountRow[]>(
        `SELECT COUNT(*) AS total
           FROM loan_applications la
           INNER JOIN users u ON u.id = la.user_id
           ${where}`,
        parameters,
      ),
      db.execute<ApplicationRow[]>(
        `SELECT la.uuid, la.status, la.requested_amount,
                la.term_fortnights, la.fortnight_payment, la.total_payment,
                la.purpose, la.submitted_at, la.reviewed_at,
                TRIM(CONCAT_WS(' ', u.first_name, u.paternal_last_name,
                                    u.maternal_last_name)) AS client_name,
                u.phone,
                (SELECT COUNT(*) FROM client_documents cd
                  WHERE cd.application_id = la.id) AS document_count,
                (SELECT COUNT(*) FROM client_documents cd
                  WHERE cd.application_id = la.id
                    AND cd.verification_status = 'verificado') AS verified_count
           FROM loan_applications la
           INNER JOIN users u ON u.id = la.user_id
           ${where}
          ORDER BY COALESCE(la.submitted_at, la.created_at) DESC
          LIMIT ? OFFSET ?`,
        [...parameters, query.limit, offset],
      ),
    ]);

    const total = Number(countRows[0]?.total || 0);
    return NextResponse.json({
      ok: true,
      applications: rows.map((row) => ({
        uuid: row.uuid,
        status: row.status,
        requestedAmount: Number(row.requested_amount),
        termFortnights: Number(row.term_fortnights),
        fortnightPayment: Number(row.fortnight_payment),
        totalPayment: Number(row.total_payment),
        purpose: row.purpose,
        submittedAt: row.submitted_at,
        reviewedAt: row.reviewed_at,
        clientName: row.client_name,
        phone: row.phone,
        documentCount: Number(row.document_count),
        verifiedCount: Number(row.verified_count),
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
