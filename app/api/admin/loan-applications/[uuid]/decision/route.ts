import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { applicationEventHash } from "@/lib/application-security";
import { applicationDecisionSchema } from "@/lib/admin-loan-validation";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { applicationUuidSchema } from "@/lib/loan-validation";

type ApplicationRow = RowDataPacket & {
  id: number;
  uuid: string;
  user_id: number;
  status: string;
  requested_amount: number;
  term_fortnights: number;
  fortnight_payment: number;
  total_payment: number;
  promissory_note_hash: string | null;
  signed_at: string | null;
  submitted_at: string | null;
};

type DocumentRow = RowDataPacket & {
  document_type: string;
  verification_status: string;
};

const requiredDocumentTypes = [
  "ine_front",
  "ine_back",
  "face_photo",
  "address_proof",
  "signature",
];

export async function POST(
  request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  let connection: PoolConnection | undefined;

  try {
    const actor = await requireApiUser(["admin", "gerencia"]);
    const { uuid: rawUuid } = await context.params;
    const uuid = applicationUuidSchema.parse(rawUuid);
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Los datos enviados no son válidos.", "INVALID_JSON");
    });
    const data = applicationDecisionSchema.parse(body);

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [applicationRows] = await connection.execute<ApplicationRow[]>(
      `SELECT id, uuid, user_id, status, requested_amount,
              term_fortnights, fortnight_payment, total_payment,
              promissory_note_hash, signed_at, submitted_at
         FROM loan_applications
        WHERE uuid = ?
        LIMIT 1
        FOR UPDATE`,
      [uuid],
    );
    const application = applicationRows[0];

    if (!application) {
      throw new ApiError(404, "Solicitud no encontrada.", "APPLICATION_NOT_FOUND");
    }

    if (application.status !== "en_revision") {
      throw new ApiError(
        409,
        "La solicitud ya fue resuelta o no está lista para revisión.",
        "APPLICATION_ALREADY_REVIEWED",
      );
    }

    const [documents] = await connection.execute<DocumentRow[]>(
      `SELECT document_type, verification_status
         FROM client_documents
        WHERE application_id = ?
        FOR UPDATE`,
      [application.id],
    );

    if (data.action === "aprobar") {
      if (
        !application.promissory_note_hash ||
        !application.signed_at ||
        !application.submitted_at
      ) {
        throw new ApiError(
          409,
          "La solicitud no cuenta con un pagaré firmado y enviado correctamente.",
          "APPLICATION_NOT_SIGNED",
        );
      }

      const verifiedTypes = new Set(
        documents
          .filter((document) => document.verification_status === "verificado")
          .map((document) => document.document_type),
      );
      const missing = requiredDocumentTypes.filter((type) => !verifiedTypes.has(type));

      if (missing.length) {
        throw new ApiError(
          409,
          "Verifica todos los documentos y la firma antes de autorizar.",
          "DOCUMENTS_NOT_VERIFIED",
        );
      }
    }

    const approved = data.action === "aprobar";
    await connection.execute(
      `UPDATE loan_applications
          SET status = ?,
              approved_amount = ?,
              approved_term_fortnights = ?,
              approved_fortnight_payment = ?,
              approved_total_payment = ?,
              reviewed_by = ?,
              reviewed_at = NOW(),
              rejection_reason = ?,
              review_notes = ?
        WHERE id = ?`,
      [
        approved ? "aprobado" : "rechazado",
        approved ? application.requested_amount : null,
        approved ? application.term_fortnights : null,
        approved ? application.fortnight_payment : null,
        approved ? application.total_payment : null,
        actor.id,
        approved ? null : data.reason,
        data.notes || null,
        application.id,
      ],
    );

    if (approved) {
      await connection.execute(
        `INSERT INTO loans (
           uuid, application_id, user_id, status, principal,
           term_fortnights, installment_amount, total_due,
           amount_paid, balance
         ) VALUES (?, ?, ?, 'pendiente_desembolso', ?, ?, ?, ?, 0, ?)
         ON DUPLICATE KEY UPDATE
           principal = VALUES(principal),
           term_fortnights = VALUES(term_fortnights),
           installment_amount = VALUES(installment_amount),
           total_due = VALUES(total_due),
           balance = CASE
             WHEN status = 'pendiente_desembolso' THEN VALUES(balance)
             ELSE balance
           END`,
        [
          randomUUID(),
          application.id,
          application.user_id,
          application.requested_amount,
          application.term_fortnights,
          application.fortnight_payment,
          application.total_payment,
          application.total_payment,
        ],
      );
    }

    const amount = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(Number(application.requested_amount));
    const notification = approved
      ? {
          type: "loan_application_approved",
          title: "Crédito autorizado",
          message: `Tu solicitud por ${amount} fue autorizada. Nos pondremos en contacto contigo para coordinar la entrega del crédito.`,
        }
      : {
          type: "loan_application_rejected",
          title: "Solicitud no autorizada",
          message: `Tu solicitud no fue autorizada. Motivo: ${data.reason}`,
        };
    await connection.execute(
      `INSERT INTO notifications
        (user_id, notification_type, title, message)
       VALUES (?, ?, ?, ?)`,
      [application.user_id, notification.type, notification.title, notification.message],
    );

    const occurredAt = new Date().toISOString();
    const metadata = approved
      ? {
          status: "aprobado",
          approvedAmount: Number(application.requested_amount),
          termFortnights: Number(application.term_fortnights),
          fortnightPayment: Number(application.fortnight_payment),
          totalPayment: Number(application.total_payment),
          notes: data.notes || null,
        }
      : {
          status: "rechazado",
          reason: data.reason,
          notes: data.notes || null,
        };
    const eventHash = applicationEventHash({
      applicationUuid: application.uuid,
      eventType: approved ? "application_approved" : "application_rejected",
      actorUserId: actor.id,
      occurredAt,
      metadata,
    });
    await connection.execute(
      `INSERT INTO application_events
        (application_id, actor_user_id, event_type, event_hash, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      [
        application.id,
        actor.id,
        approved ? "application_approved" : "application_rejected",
        eventHash,
        JSON.stringify(metadata),
      ],
    );

    await connection.commit();

    return NextResponse.json({
      ok: true,
      status: approved ? "aprobado" : "rechazado",
      message: approved
        ? "Crédito autorizado correctamente."
        : "Solicitud rechazada correctamente.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
