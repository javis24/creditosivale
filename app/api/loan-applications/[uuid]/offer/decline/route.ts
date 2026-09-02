import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { applicationEventHash } from "@/lib/application-security";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { applicationUuidSchema } from "@/lib/loan-validation";

type ApplicationRow = RowDataPacket & {
  id: number;
  uuid: string;
  status: string;
  flow_version: number;
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

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute<ApplicationRow[]>(
      `SELECT id, uuid, status, flow_version
         FROM loan_applications
        WHERE uuid = ? AND user_id = ?
        LIMIT 1
        FOR UPDATE`,
      [uuid, user.id],
    );
    const application = rows[0];

    if (!application) {
      throw new ApiError(404, "Solicitud no encontrada.", "APPLICATION_NOT_FOUND");
    }
    if (
      application.flow_version !== 2 ||
      application.status !== "oferta_pendiente"
    ) {
      throw new ApiError(
        409,
        "Esta oferta ya no está disponible.",
        "OFFER_NOT_AVAILABLE",
      );
    }

    await connection.execute(
      `UPDATE loan_applications
          SET status = 'cancelado',
              review_notes = CONCAT_WS(CHAR(10), review_notes,
                'Oferta rechazada por el cliente.')
        WHERE id = ?`,
      [application.id],
    );

    const occurredAt = new Date().toISOString();
    const metadata = { status: "cancelado", reason: "offer_declined_by_client" };
    const eventHash = applicationEventHash({
      applicationUuid: application.uuid,
      eventType: "offer_declined",
      actorUserId: user.id,
      occurredAt,
      metadata,
    });
    await connection.execute(
      `INSERT INTO application_events
        (application_id, actor_user_id, event_type, event_hash, metadata_json)
       VALUES (?, ?, 'offer_declined', ?, ?)`,
      [application.id, user.id, eventHash, JSON.stringify(metadata)],
    );

    await connection.commit();
    return NextResponse.json({
      ok: true,
      status: "cancelado",
      message: "Rechazaste la oferta. Ya puedes iniciar una nueva solicitud.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
