import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { applicationEventHash, sha256 } from "@/lib/application-security";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { applicationUuidSchema } from "@/lib/loan-validation";
import {
  buildPromissoryNote,
  getPromissoryBusinessSettings,
  type PromissoryApplication,
} from "@/lib/promissory-note";

export const runtime = "nodejs";

type ApplicationRow = RowDataPacket & PromissoryApplication & {
  id: number;
  status: string;
  promissory_note_text: string | null;
  promissory_note_hash: string | null;
};

type DocumentRow = RowDataPacket & {
  document_type: string;
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  let connection: PoolConnection | undefined;

  try {
    const user = await requireApiUser(["cliente"]);
    const { uuid: rawUuid } = await context.params;
    const uuid = applicationUuidSchema.parse(rawUuid);
    const { lenderName, paymentPlace } = getPromissoryBusinessSettings();

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [applicationRows] = await connection.execute<ApplicationRow[]>(
      `SELECT la.id, la.uuid, la.status, la.requested_amount,
              la.term_fortnights, la.fortnight_payment, la.total_payment,
              la.promissory_note_text, la.promissory_note_hash,
              TRIM(CONCAT_WS(' ', u.first_name, u.paternal_last_name,
                                  u.maternal_last_name)) AS full_name,
              cp.address, cp.postal_code
         FROM loan_applications la
         INNER JOIN users u ON u.id = la.user_id
         LEFT JOIN client_profiles cp ON cp.user_id = u.id
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
      throw new ApiError(409, "La solicitud ya fue enviada.", "APPLICATION_LOCKED");
    }

    const [documentRows] = await connection.execute<DocumentRow[]>(
      `SELECT document_type
         FROM client_documents
        WHERE application_id = ?`,
      [application.id],
    );
    const uploadedTypes = new Set(documentRows.map((row) => row.document_type));
    const requiredIdentityTypes = [
      "ine_front",
      "ine_back",
      "face_photo",
      "address_proof",
    ];
    const missingTypes = requiredIdentityTypes.filter(
      (type) => !uploadedTypes.has(type),
    );

    if (missingTypes.length) {
      throw new ApiError(
        400,
        "Completa los documentos de identidad antes de preparar el pagaré.",
        "MISSING_IDENTITY_DOCUMENTS",
      );
    }

    if (application.promissory_note_text && application.promissory_note_hash) {
      await connection.commit();
      return NextResponse.json({
        ok: true,
        text: application.promissory_note_text,
        hash: application.promissory_note_hash,
        version: process.env.PROMISSORY_NOTE_VERSION || "2026-08",
      });
    }

    const text = buildPromissoryNote({
      application,
      lenderName,
      paymentPlace,
    });
    const hash = sha256(text);
    const version = process.env.PROMISSORY_NOTE_VERSION || "2026-08";

    await connection.execute(
      `UPDATE loan_applications
          SET promissory_note_version = ?,
              promissory_note_text = ?,
              promissory_note_hash = ?
        WHERE id = ?`,
      [version, text, hash, application.id],
    );

    const occurredAt = new Date().toISOString();
    const eventHash = applicationEventHash({
      applicationUuid: application.uuid,
      eventType: "promissory_note_prepared",
      actorUserId: user.id,
      occurredAt,
      metadata: { noteHash: hash, version },
    });
    await connection.execute(
      `INSERT INTO application_events
        (application_id, actor_user_id, event_type, event_hash, metadata_json)
       VALUES (?, ?, 'promissory_note_prepared', ?, ?)`,
      [
        application.id,
        user.id,
        eventHash,
        JSON.stringify({ noteHash: hash, version }),
      ],
    );

    await connection.commit();

    return NextResponse.json({ ok: true, text, hash, version });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
