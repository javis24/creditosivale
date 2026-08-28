import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { applicationUuidSchema } from "@/lib/loan-validation";

export const dynamic = "force-dynamic";

type ApplicationRow = RowDataPacket & {
  id: number;
  uuid: string;
  status: string;
  requested_amount: number;
  term_fortnights: number;
  fortnight_payment: number;
  total_payment: number;
  purpose: string | null;
  promissory_note_text: string | null;
  promissory_note_hash: string | null;
  signed_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  review_notes: string | null;
  client_name: string;
  client_uuid: string;
  phone: string | null;
  email: string | null;
  birth_date: string;
  address: string | null;
  postal_code: string;
  occupation: string | null;
  monthly_income: number;
  reviewer_name: string | null;
};

type DocumentRow = RowDataPacket & {
  id: number;
  document_type: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  verification_status: string;
  rejection_reason: string | null;
  verified_at: string | null;
  reviewer_name: string | null;
  created_at: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  try {
    const actor = await requireApiUser(["admin", "gerencia", "vendedor"]);
    const { uuid: rawUuid } = await context.params;
    const uuid = applicationUuidSchema.parse(rawUuid);
    const db = getDb();

    const [rows] = await db.execute<ApplicationRow[]>(
      `SELECT la.id, la.uuid, la.status, la.requested_amount,
              la.term_fortnights, la.fortnight_payment, la.total_payment,
              la.purpose, la.promissory_note_text, la.promissory_note_hash,
              la.signed_at, la.submitted_at, la.reviewed_at,
              la.rejection_reason, la.review_notes,
              TRIM(CONCAT_WS(' ', u.first_name, u.paternal_last_name,
                                  u.maternal_last_name)) AS client_name,
              u.uuid AS client_uuid, u.phone, u.email,
              cp.birth_date, cp.address, cp.postal_code,
              cp.occupation, cp.monthly_income,
              TRIM(CONCAT_WS(' ', reviewer.first_name, reviewer.paternal_last_name,
                                  reviewer.maternal_last_name)) AS reviewer_name
         FROM loan_applications la
         INNER JOIN users u ON u.id = la.user_id
         INNER JOIN client_profiles cp ON cp.user_id = u.id
         LEFT JOIN users reviewer ON reviewer.id = la.reviewed_by
        WHERE la.uuid = ?
        LIMIT 1`,
      [uuid],
    );
    const application = rows[0];

    if (!application) {
      throw new ApiError(404, "Solicitud no encontrada.", "APPLICATION_NOT_FOUND");
    }

    const [documents] = await db.execute<DocumentRow[]>(
      `SELECT cd.id, cd.document_type, cd.original_name, cd.mime_type,
              cd.size_bytes, cd.verification_status, cd.rejection_reason,
              cd.verified_at, cd.created_at,
              TRIM(CONCAT_WS(' ', reviewer.first_name, reviewer.paternal_last_name,
                                  reviewer.maternal_last_name)) AS reviewer_name
         FROM client_documents cd
         LEFT JOIN users reviewer ON reviewer.id = cd.verified_by
        WHERE cd.application_id = ?
        ORDER BY cd.created_at ASC`,
      [application.id],
    );

    return NextResponse.json({
      ok: true,
      permissions: { canDecide: ["admin", "gerencia"].includes(actor.role) },
      application: {
        uuid: application.uuid,
        status: application.status,
        requestedAmount: Number(application.requested_amount),
        termFortnights: Number(application.term_fortnights),
        fortnightPayment: Number(application.fortnight_payment),
        totalPayment: Number(application.total_payment),
        purpose: application.purpose,
        promissoryNoteText: application.promissory_note_text,
        promissoryNoteHash: application.promissory_note_hash,
        signedAt: application.signed_at,
        submittedAt: application.submitted_at,
        reviewedAt: application.reviewed_at,
        rejectionReason: application.rejection_reason,
        reviewNotes: application.review_notes,
        reviewerName: application.reviewer_name,
        client: {
          uuid: application.client_uuid,
          name: application.client_name,
          phone: application.phone,
          email: application.email,
          birthDate: application.birth_date,
          address: application.address,
          postalCode: application.postal_code,
          occupation: application.occupation,
          monthlyIncome: Number(application.monthly_income),
        },
        documents: documents.map((document) => ({
          id: Number(document.id),
          type: document.document_type,
          originalName: document.original_name,
          mimeType: document.mime_type,
          sizeBytes: Number(document.size_bytes),
          verificationStatus: document.verification_status,
          rejectionReason: document.rejection_reason,
          verifiedAt: document.verified_at,
          reviewerName: document.reviewer_name,
          uploadedAt: document.created_at,
          viewUrl: `/api/documents/${document.id}`,
        })),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
