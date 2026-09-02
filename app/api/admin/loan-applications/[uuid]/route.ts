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
  flow_version: number;
  requested_amount: number;
  offered_amount: number | null;
  term_fortnights: number;
  offered_term_fortnights: number | null;
  fortnight_payment: number;
  offered_fortnight_payment: number | null;
  total_payment: number;
  offered_total_payment: number | null;
  purpose: string | null;
  promissory_note_text: string | null;
  promissory_note_hash: string | null;
  signed_at: string | null;
  submitted_at: string | null;
  offered_at: string | null;
  offer_accepted_at: string | null;
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
  loan_uuid: string | null;
  loan_status: string | null;
};

type CreditOptionRow = RowDataPacket & {
  amount: number;
  term_fortnights: number;
  fortnight_payment: number;
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
      `SELECT la.id, la.uuid, la.status, la.flow_version,
              la.requested_amount, la.offered_amount,
              la.term_fortnights, la.offered_term_fortnights,
              la.fortnight_payment, la.offered_fortnight_payment,
              la.total_payment, la.offered_total_payment,
              la.purpose, la.promissory_note_text, la.promissory_note_hash,
              la.signed_at, la.submitted_at, la.offered_at,
              la.offer_accepted_at, la.reviewed_at,
              la.rejection_reason, la.review_notes,
              TRIM(CONCAT_WS(' ', u.first_name, u.paternal_last_name,
                                  u.maternal_last_name)) AS client_name,
              u.uuid AS client_uuid, u.phone, u.email,
              cp.birth_date, cp.address, cp.postal_code,
              cp.occupation, cp.monthly_income,
              l.uuid AS loan_uuid, l.status AS loan_status,
              TRIM(CONCAT_WS(' ', reviewer.first_name, reviewer.paternal_last_name,
                                  reviewer.maternal_last_name)) AS reviewer_name
         FROM loan_applications la
         INNER JOIN users u ON u.id = la.user_id
         INNER JOIN client_profiles cp ON cp.user_id = u.id
         LEFT JOIN loans l ON l.application_id = la.id
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

    const [creditOptions] = await db.execute<CreditOptionRow[]>(
      `SELECT amount, term_fortnights, fortnight_payment
         FROM credit_options
        WHERE status = 'activo' AND amount <= ?
        ORDER BY amount, term_fortnights`,
      [application.requested_amount],
    );

    return NextResponse.json({
      ok: true,
      permissions: { canDecide: ["admin", "gerencia"].includes(actor.role) },
      creditOptions: creditOptions.map((option) => ({
        amount: Number(option.amount),
        termFortnights: Number(option.term_fortnights),
        fortnightPayment: Number(option.fortnight_payment),
        totalPayment:
          Number(option.term_fortnights) * Number(option.fortnight_payment),
      })),
      application: {
        uuid: application.uuid,
        status: application.status,
        flowVersion: Number(application.flow_version),
        requestedAmount: Number(application.requested_amount),
        offeredAmount:
          application.offered_amount === null
            ? null
            : Number(application.offered_amount),
        termFortnights: Number(application.term_fortnights),
        offeredTermFortnights:
          application.offered_term_fortnights === null
            ? null
            : Number(application.offered_term_fortnights),
        fortnightPayment: Number(application.fortnight_payment),
        offeredFortnightPayment:
          application.offered_fortnight_payment === null
            ? null
            : Number(application.offered_fortnight_payment),
        totalPayment: Number(application.total_payment),
        offeredTotalPayment:
          application.offered_total_payment === null
            ? null
            : Number(application.offered_total_payment),
        purpose: application.purpose,
        promissoryNoteText: application.promissory_note_text,
        promissoryNoteHash: application.promissory_note_hash,
        signedAt: application.signed_at,
        submittedAt: application.submitted_at,
        offeredAt: application.offered_at,
        offerAcceptedAt: application.offer_accepted_at,
        reviewedAt: application.reviewed_at,
        rejectionReason: application.rejection_reason,
        reviewNotes: application.review_notes,
        reviewerName: application.reviewer_name,
        loan: application.loan_uuid
          ? {
              uuid: application.loan_uuid,
              status: application.loan_status,
            }
          : null,
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
