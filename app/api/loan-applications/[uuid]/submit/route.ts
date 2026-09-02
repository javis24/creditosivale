import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import {
  applicationEventHash,
  privateIdentifierHash,
  sha256,
} from "@/lib/application-security";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  applicationUuidSchema,
  submitApplicationSchema,
  submitInitialApplicationSchema,
} from "@/lib/loan-validation";

export const runtime = "nodejs";

type SubmissionRow = RowDataPacket & {
  id: number;
  uuid: string;
  user_id: number;
  status: string;
  flow_version: number;
  offered_amount: number | null;
  offered_term_fortnights: number | null;
  offered_fortnight_payment: number | null;
  offered_total_payment: number | null;
  promissory_note_version: string | null;
  promissory_note_text: string | null;
  promissory_note_hash: string | null;
};

type DocumentRow = RowDataPacket & { document_type: string };

const identityDocumentTypes = [
  "ine_front",
  "ine_back",
  "face_photo",
  "address_proof",
];

function missingDocuments(rows: DocumentRow[], requiredTypes: string[]) {
  const uploadedTypes = new Set(rows.map((row) => row.document_type));
  return requiredTypes.filter((type) => !uploadedTypes.has(type));
}

export async function POST(
  request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  let connection: PoolConnection | undefined;

  try {
    const user = await requireApiUser(["cliente"]);
    const { uuid: rawUuid } = await context.params;
    const uuid = applicationUuidSchema.parse(rawUuid);
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Los datos enviados no son válidos.", "INVALID_JSON");
    });

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [applicationRows] = await connection.execute<SubmissionRow[]>(
      `SELECT la.id, la.uuid, la.user_id, la.status, la.flow_version,
              la.offered_amount, la.offered_term_fortnights,
              la.offered_fortnight_payment, la.offered_total_payment,
              la.promissory_note_version, la.promissory_note_text,
              la.promissory_note_hash
         FROM loan_applications la
        WHERE la.uuid = ? AND la.user_id = ?
        LIMIT 1
        FOR UPDATE`,
      [uuid, user.id],
    );
    const application = applicationRows[0];

    if (!application) {
      throw new ApiError(404, "Solicitud no encontrada.", "APPLICATION_NOT_FOUND");
    }

    const [documentRows] = await connection.execute<DocumentRow[]>(
      `SELECT document_type
         FROM client_documents
        WHERE application_id = ?`,
      [application.id],
    );
    const privacyVersion = process.env.PRIVACY_NOTICE_VERSION || "2026-08";

    // Flujo nuevo, primera etapa: documentos para revisión, todavía sin pagaré.
    if (application.flow_version === 2 && application.status === "borrador") {
      submitInitialApplicationSchema.parse(body);
      const missing = missingDocuments(documentRows, identityDocumentTypes);

      if (missing.length) {
        throw new ApiError(
          400,
          "Faltan documentos de identidad antes de enviar la solicitud.",
          "MISSING_DOCUMENTS",
        );
      }

      await connection.execute(
        `UPDATE loan_applications
            SET status = 'en_revision',
                privacy_notice_version = ?,
                privacy_consent_at = COALESCE(privacy_consent_at, NOW()),
                biometric_consent_at = COALESCE(biometric_consent_at, NOW()),
                submitted_at = NOW()
          WHERE id = ?`,
        [privacyVersion, application.id],
      );

      const message =
        "Tu solicitud fue recibida. Revisaremos tus documentos y te avisaremos el monto que podemos ofrecerte.";
      await connection.execute(
        `INSERT INTO notifications
          (user_id, notification_type, title, message)
         VALUES (?, 'loan_application_submitted', 'Solicitud recibida', ?)`,
        [user.id, message],
      );

      const occurredAt = new Date().toISOString();
      const metadata = { flowVersion: 2, privacyVersion };
      const eventHash = applicationEventHash({
        applicationUuid: application.uuid,
        eventType: "application_submitted",
        actorUserId: user.id,
        occurredAt,
        metadata,
      });
      await connection.execute(
        `INSERT INTO application_events
          (application_id, actor_user_id, event_type, event_hash, metadata_json)
         VALUES (?, ?, 'application_submitted', ?, ?)`,
        [application.id, user.id, eventHash, JSON.stringify(metadata)],
      );

      await connection.commit();
      return NextResponse.json({
        ok: true,
        status: "en_revision",
        message,
        applicationUuid: application.uuid,
      });
    }

    const isLegacySubmission =
      application.flow_version === 1 && application.status === "borrador";
    const isOfferAcceptance =
      application.flow_version === 2 && application.status === "oferta_pendiente";

    if (!isLegacySubmission && !isOfferAcceptance) {
      throw new ApiError(
        409,
        "Esta solicitud ya fue enviada o todavía no tiene una oferta disponible.",
        "APPLICATION_ALREADY_SUBMITTED",
      );
    }

    const data = submitApplicationSchema.parse(body);
    const missing = missingDocuments(documentRows, [
      ...identityDocumentTypes,
      "signature",
    ]);
    if (missing.length) {
      throw new ApiError(
        400,
        "Faltan documentos o la firma antes de continuar.",
        "MISSING_DOCUMENTS",
      );
    }

    const promissoryNote = application.promissory_note_text;
    const noteHash = application.promissory_note_hash;
    if (
      !promissoryNote ||
      !noteHash ||
      noteHash !== data.noteHash ||
      sha256(promissoryNote) !== noteHash
    ) {
      throw new ApiError(
        409,
        "El pagaré cambió o no está preparado. Revísalo y firma nuevamente.",
        "PROMISSORY_NOTE_MISMATCH",
      );
    }

    const forwardedFor = request.headers.get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    const signerIpHash = privateIdentifierHash(forwardedFor || "unknown");
    const userAgent = (request.headers.get("user-agent") || "unknown").slice(0, 500);
    const noteVersion = application.promissory_note_version || "2026-08";

    if (isLegacySubmission) {
      await connection.execute(
        `UPDATE loan_applications
            SET status = 'en_revision',
                privacy_notice_version = ?,
                privacy_consent_at = COALESCE(privacy_consent_at, NOW()),
                biometric_consent_at = COALESCE(biometric_consent_at, NOW()),
                signed_at = NOW(), signer_ip_hash = ?, signer_user_agent = ?,
                submitted_at = NOW()
          WHERE id = ?`,
        [privacyVersion, signerIpHash, userAgent, application.id],
      );

      const message =
        "Tu solicitud de crédito fue recibida y está en proceso de autorización.";
      await connection.execute(
        `INSERT INTO notifications
          (user_id, notification_type, title, message)
         VALUES (?, 'loan_application_submitted', 'Solicitud recibida', ?)`,
        [user.id, message],
      );

      const occurredAt = new Date().toISOString();
      const metadata = { noteHash, privacyVersion, noteVersion, flowVersion: 1 };
      const eventHash = applicationEventHash({
        applicationUuid: application.uuid,
        eventType: "application_submitted",
        actorUserId: user.id,
        occurredAt,
        metadata,
      });
      await connection.execute(
        `INSERT INTO application_events
          (application_id, actor_user_id, event_type, event_hash, metadata_json)
         VALUES (?, ?, 'application_submitted', ?, ?)`,
        [application.id, user.id, eventHash, JSON.stringify(metadata)],
      );

      await connection.commit();
      return NextResponse.json({
        ok: true,
        status: "en_revision",
        message,
        applicationUuid: application.uuid,
      });
    }

    const amount = Number(application.offered_amount);
    const term = Number(application.offered_term_fortnights);
    const payment = Number(application.offered_fortnight_payment);
    const total = Number(application.offered_total_payment);
    if (!amount || !term || !payment || !total) {
      throw new ApiError(
        409,
        "La oferta ya no es válida. Solicita apoyo al administrador.",
        "INVALID_OFFER",
      );
    }

    await connection.execute(
      `UPDATE loan_applications
          SET status = 'aprobado',
              approved_amount = offered_amount,
              approved_term_fortnights = offered_term_fortnights,
              approved_fortnight_payment = offered_fortnight_payment,
              approved_total_payment = offered_total_payment,
              privacy_notice_version = ?,
              privacy_consent_at = COALESCE(privacy_consent_at, NOW()),
              biometric_consent_at = COALESCE(biometric_consent_at, NOW()),
              signed_at = NOW(), signer_ip_hash = ?, signer_user_agent = ?,
              offer_accepted_at = NOW()
        WHERE id = ?`,
      [privacyVersion, signerIpHash, userAgent, application.id],
    );

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
      [randomUUID(), application.id, application.user_id, amount, term, payment, total, total],
    );

    const formattedAmount = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(amount);
    const message = `Aceptaste la oferta por ${formattedAmount}. Tu crédito quedó autorizado y está pendiente de entrega.`;
    await connection.execute(
      `INSERT INTO notifications
        (user_id, notification_type, title, message)
       VALUES (?, 'loan_offer_accepted', 'Crédito autorizado', ?)`,
      [user.id, message],
    );

    const occurredAt = new Date().toISOString();
    const metadata = {
      flowVersion: 2,
      noteHash,
      noteVersion,
      amount,
      termFortnights: term,
      fortnightPayment: payment,
      totalPayment: total,
    };
    const eventHash = applicationEventHash({
      applicationUuid: application.uuid,
      eventType: "offer_accepted",
      actorUserId: user.id,
      occurredAt,
      metadata,
    });
    await connection.execute(
      `INSERT INTO application_events
        (application_id, actor_user_id, event_type, event_hash, metadata_json)
       VALUES (?, ?, 'offer_accepted', ?, ?)`,
      [application.id, user.id, eventHash, JSON.stringify(metadata)],
    );

    await connection.commit();
    return NextResponse.json({
      ok: true,
      status: "aprobado",
      message,
      applicationUuid: application.uuid,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
