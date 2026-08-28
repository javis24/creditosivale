import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { applicationEventHash } from "@/lib/application-security";
import { documentReviewSchema } from "@/lib/admin-loan-validation";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { applicationUuidSchema } from "@/lib/loan-validation";

type ReviewRow = RowDataPacket & {
  application_id: number;
  application_uuid: string;
  application_status: string;
  document_type: string;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uuid: string; documentId: string }> },
) {
  let connection: PoolConnection | undefined;

  try {
    const actor = await requireApiUser(["admin", "gerencia"]);
    const params = await context.params;
    const uuid = applicationUuidSchema.parse(params.uuid);
    const documentId = z.coerce.number().int().positive().parse(params.documentId);
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Los datos enviados no son válidos.", "INVALID_JSON");
    });
    const data = documentReviewSchema.parse(body);

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute<ReviewRow[]>(
      `SELECT la.id AS application_id, la.uuid AS application_uuid,
              la.status AS application_status, cd.document_type
         FROM client_documents cd
         INNER JOIN loan_applications la ON la.id = cd.application_id
        WHERE cd.id = ? AND la.uuid = ?
        LIMIT 1
        FOR UPDATE`,
      [documentId, uuid],
    );
    const document = rows[0];

    if (!document) {
      throw new ApiError(404, "Documento no encontrado.", "DOCUMENT_NOT_FOUND");
    }

    if (document.application_status !== "en_revision") {
      throw new ApiError(
        409,
        "Sólo se pueden revisar documentos de solicitudes en revisión.",
        "APPLICATION_NOT_REVIEWABLE",
      );
    }

    await connection.execute(
      `UPDATE client_documents
          SET verification_status = ?,
              rejection_reason = ?,
              verified_by = ?,
              verified_at = NOW()
        WHERE id = ?`,
      [
        data.status,
        data.status === "rechazado" ? data.reason : null,
        actor.id,
        documentId,
      ],
    );

    const occurredAt = new Date().toISOString();
    const metadata = {
      documentId,
      documentType: document.document_type,
      status: data.status,
      reason: data.status === "rechazado" ? data.reason : null,
    };
    const eventHash = applicationEventHash({
      applicationUuid: document.application_uuid,
      eventType: "document_reviewed",
      actorUserId: actor.id,
      occurredAt,
      metadata,
    });
    await connection.execute(
      `INSERT INTO application_events
        (application_id, actor_user_id, event_type, event_hash, metadata_json)
       VALUES (?, ?, 'document_reviewed', ?, ?)`,
      [document.application_id, actor.id, eventHash, JSON.stringify(metadata)],
    );

    await connection.commit();

    return NextResponse.json({
      ok: true,
      message:
        data.status === "verificado"
          ? "Documento verificado."
          : "Documento marcado como rechazado.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
