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
} from "@/lib/loan-validation";

export const runtime = "nodejs";

type SubmissionRow = RowDataPacket & {
  id: number;
  uuid: string;
  status: string;
  promissory_note_version: string | null;
  promissory_note_text: string | null;
  promissory_note_hash: string | null;
};

type DocumentRow = RowDataPacket & {
  document_type: string;
};

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
    const data = submitApplicationSchema.parse(body);

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [applicationRows] = await connection.execute<SubmissionRow[]>(
      `SELECT la.id, la.uuid, la.status, la.promissory_note_version,
              la.promissory_note_text, la.promissory_note_hash
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

    if (application.status !== "borrador") {
      throw new ApiError(
        409,
        "Esta solicitud ya fue enviada.",
        "APPLICATION_ALREADY_SUBMITTED",
      );
    }

    const [documentRows] = await connection.execute<DocumentRow[]>(
      `SELECT document_type
         FROM client_documents
        WHERE application_id = ?`,
      [application.id],
    );
    const uploadedTypes = new Set(documentRows.map((row) => row.document_type));
    const requiredTypes = [
      "ine_front",
      "ine_back",
      "face_photo",
      "address_proof",
      "signature",
    ];
    const missingTypes = requiredTypes.filter((type) => !uploadedTypes.has(type));

    if (missingTypes.length) {
      throw new ApiError(
        400,
        "Faltan documentos o la firma antes de enviar la solicitud.",
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
    const privacyVersion = process.env.PRIVACY_NOTICE_VERSION || "2026-08";
    const noteVersion = application.promissory_note_version || "2026-08";

    await connection.execute(
      `UPDATE loan_applications
          SET status = 'en_revision',
              privacy_notice_version = ?,
              privacy_consent_at = COALESCE(privacy_consent_at, NOW()),
              biometric_consent_at = COALESCE(biometric_consent_at, NOW()),
              signed_at = NOW(),
              signer_ip_hash = ?,
              signer_user_agent = ?,
              submitted_at = NOW()
        WHERE id = ?`,
      [
        privacyVersion,
        signerIpHash,
        userAgent,
        application.id,
      ],
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
    const eventHash = applicationEventHash({
      applicationUuid: application.uuid,
      eventType: "application_submitted",
      actorUserId: user.id,
      occurredAt,
      metadata: { noteHash, privacyVersion, noteVersion },
    });
    await connection.execute(
      `INSERT INTO application_events
        (application_id, actor_user_id, event_type, event_hash, metadata_json)
       VALUES (?, ?, 'application_submitted', ?, ?)`,
      [
        application.id,
        user.id,
        eventHash,
        JSON.stringify({ noteHash, privacyVersion, noteVersion }),
      ],
    );

    await connection.commit();

    return NextResponse.json({
      ok: true,
      status: "en_revision",
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
