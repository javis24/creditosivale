import { randomUUID } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { applicationEventHash } from "@/lib/application-security";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loanQuoteSchema } from "@/lib/loan-validation";

export const dynamic = "force-dynamic";

type ApplicationRow = RowDataPacket & {
  id: number;
  uuid: string;
  status: "borrador" | "en_revision" | "oferta_pendiente" | "aprobado" | "rechazado" | "cancelado";
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
  submitted_at: string | null;
  created_at: string;
};

type OptionRow = RowDataPacket & {
  fortnight_payment: number;
};

type DocumentRow = RowDataPacket & {
  document_type: string;
  original_name: string;
  verification_status: string;
  created_at: string;
};

function serializeApplication(row: ApplicationRow, documents: DocumentRow[] = []) {
  return {
    uuid: row.uuid,
    status: row.status,
    flowVersion: Number(row.flow_version),
    requestedAmount: Number(row.requested_amount),
    offeredAmount: row.offered_amount === null ? null : Number(row.offered_amount),
    termFortnights: Number(row.term_fortnights),
    offeredTermFortnights:
      row.offered_term_fortnights === null
        ? null
        : Number(row.offered_term_fortnights),
    fortnightPayment: Number(row.fortnight_payment),
    offeredFortnightPayment:
      row.offered_fortnight_payment === null
        ? null
        : Number(row.offered_fortnight_payment),
    totalPayment: Number(row.total_payment),
    offeredTotalPayment:
      row.offered_total_payment === null
        ? null
        : Number(row.offered_total_payment),
    purpose: row.purpose,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    documents: documents.map((document) => ({
      type: document.document_type,
      originalName: document.original_name,
      verificationStatus: document.verification_status,
      uploadedAt: document.created_at,
    })),
  };
}

export async function GET() {
  try {
    const user = await requireApiUser(["cliente"]);
    const db = getDb();
    const [rows] = await db.execute<ApplicationRow[]>(
      `SELECT id, uuid, status, flow_version, requested_amount, offered_amount,
              term_fortnights, offered_term_fortnights,
              fortnight_payment, offered_fortnight_payment,
              total_payment, offered_total_payment,
              purpose, submitted_at, created_at
         FROM loan_applications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [user.id],
    );
    const application = rows[0];

    if (!application) {
      return NextResponse.json({ ok: true, application: null });
    }

    const [documents] = await db.execute<DocumentRow[]>(
      `SELECT document_type, original_name, verification_status, created_at
         FROM client_documents
        WHERE application_id = ?
        ORDER BY created_at ASC`,
      [application.id],
    );

    return NextResponse.json({
      ok: true,
      application: serializeApplication(application, documents),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let connection: PoolConnection | undefined;

  try {
    const user = await requireApiUser(["cliente"]);
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Los datos enviados no son válidos.", "INVALID_JSON");
    });
    const data = loanQuoteSchema.parse(body);

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    // Serializa las solicitudes del mismo cliente y evita dos créditos simultáneos.
    await connection.execute(
      `SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
      [user.id],
    );

    const [activeLoanRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id
         FROM loans
        WHERE user_id = ?
          AND status IN ('pendiente_desembolso', 'activo')
        LIMIT 1`,
      [user.id],
    );

    if (activeLoanRows.length) {
      throw new ApiError(
        409,
        "Debes liquidar tu crédito actual antes de solicitar uno nuevo.",
        "ACTIVE_LOAN_EXISTS",
      );
    }

    const [existingRows] = await connection.execute<ApplicationRow[]>(
      `SELECT id, uuid, status, flow_version, requested_amount, offered_amount,
              term_fortnights, offered_term_fortnights,
              fortnight_payment, offered_fortnight_payment,
              total_payment, offered_total_payment,
              purpose, submitted_at, created_at
         FROM loan_applications
        WHERE user_id = ?
          AND status IN ('borrador', 'en_revision', 'oferta_pendiente')
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [user.id],
    );
    const existing = existingRows[0];

    if (existing && existing.status !== "borrador") {
      throw new ApiError(
        409,
        existing.status === "oferta_pendiente"
          ? "Tienes una oferta pendiente de aceptar."
          : "Ya tienes una solicitud en proceso de autorización.",
        "APPLICATION_ALREADY_SUBMITTED",
      );
    }

    let payment = 0;
    let totalPayment = 0;

    // Las solicitudes anteriores conservan la cotización firmada original.
    if (existing?.flow_version === 1) {
      const [optionRows] = await connection.execute<OptionRow[]>(
        `SELECT fortnight_payment
           FROM credit_options
          WHERE amount = ? AND term_fortnights = ? AND status = 'activo'
          LIMIT 1`,
        [data.amount, data.termFortnights],
      );
      const option = optionRows[0];

      if (!option) {
        throw new ApiError(
          400,
          "El monto y plazo seleccionados no están disponibles.",
          "INVALID_CREDIT_OPTION",
        );
      }

      payment = Number(option.fortnight_payment);
      totalPayment = payment * data.termFortnights;
    }
    const occurredAt = new Date().toISOString();

    if (existing) {
      const [signatureRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM client_documents
          WHERE application_id = ? AND document_type = 'signature'
          LIMIT 1`,
        [existing.id],
      );

      if (signatureRows.length) {
        throw new ApiError(
          409,
          "No puedes cambiar una cotización que ya fue firmada.",
          "SIGNED_QUOTE_CANNOT_CHANGE",
        );
      }

      await connection.execute(
        `UPDATE loan_applications
            SET requested_amount = ?, term_fortnights = ?,
                fortnight_payment = ?, total_payment = ?, purpose = ?,
                promissory_note_version = NULL,
                promissory_note_text = NULL,
                promissory_note_hash = NULL
          WHERE id = ?`,
        [
          data.amount,
          data.termFortnights,
          payment,
          totalPayment,
          data.purpose,
          existing.id,
        ],
      );

      const eventHash = applicationEventHash({
        applicationUuid: existing.uuid,
        eventType: "quote_updated",
        actorUserId: user.id,
        occurredAt,
        metadata: {
          flowVersion: existing.flow_version,
          amount: data.amount,
          preferredTerm: data.termFortnights,
          payment,
        },
      });
      await connection.execute(
        `INSERT INTO application_events
          (application_id, actor_user_id, event_type, event_hash, metadata_json)
         VALUES (?, ?, 'quote_updated', ?, ?)`,
        [
          existing.id,
          user.id,
          eventHash,
          JSON.stringify({
            flowVersion: existing.flow_version,
            amount: data.amount,
            preferredTerm: data.termFortnights,
            payment,
          }),
        ],
      );

      const [documents] = await connection.execute<DocumentRow[]>(
        `SELECT document_type, original_name, verification_status, created_at
           FROM client_documents
          WHERE application_id = ?
          ORDER BY created_at ASC`,
        [existing.id],
      );

      await connection.commit();

      return NextResponse.json({
        ok: true,
        application: {
          uuid: existing.uuid,
          status: "borrador",
          flowVersion: existing.flow_version,
          requestedAmount: data.amount,
          offeredAmount: null,
          termFortnights: data.termFortnights,
          offeredTermFortnights: null,
          fortnightPayment: payment,
          offeredFortnightPayment: null,
          totalPayment,
          offeredTotalPayment: null,
          purpose: data.purpose,
          documents: documents.map((document) => ({
            type: document.document_type,
            originalName: document.original_name,
            verificationStatus: document.verification_status,
            uploadedAt: document.created_at,
          })),
        },
      });
    }

    const uuid = randomUUID();
    const [applicationResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO loan_applications (
        uuid, user_id, status, flow_version, requested_amount, term_fortnights,
        fortnight_payment, total_payment, purpose
      ) VALUES (?, ?, 'borrador', 2, ?, ?, 0, 0, ?)`,
      [
        uuid,
        user.id,
        data.amount,
        data.termFortnights,
        data.purpose,
      ],
    );

    const eventHash = applicationEventHash({
      applicationUuid: uuid,
      eventType: "application_created",
      actorUserId: user.id,
      occurredAt,
      metadata: {
        flowVersion: 2,
        amount: data.amount,
        preferredTerm: data.termFortnights,
      },
    });
    await connection.execute(
      `INSERT INTO application_events
        (application_id, actor_user_id, event_type, event_hash, metadata_json)
       VALUES (?, ?, 'application_created', ?, ?)`,
      [
        applicationResult.insertId,
        user.id,
        eventHash,
        JSON.stringify({
          flowVersion: 2,
          amount: data.amount,
          preferredTerm: data.termFortnights,
        }),
      ],
    );

    await connection.commit();

    return NextResponse.json(
      {
        ok: true,
        application: {
          uuid,
          status: "borrador",
          flowVersion: 2,
          requestedAmount: data.amount,
          offeredAmount: null,
          termFortnights: data.termFortnights,
          offeredTermFortnights: null,
          fortnightPayment: 0,
          offeredFortnightPayment: null,
          totalPayment: 0,
          offeredTotalPayment: null,
          purpose: data.purpose,
          documents: [],
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
