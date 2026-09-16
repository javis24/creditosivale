import { del } from "@vercel/blob";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canPermanentlyDeleteClient } from "@/lib/client-admin";
import { getClientProcess } from "@/lib/client-process";
import { normalizeMexicanWhatsapp } from "@/lib/phone";
import {
  deleteClientSchema,
  updateClientSchema,
  uuidSchema,
} from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type UserDetailRow = RowDataPacket & Record<string, string | number | null>;
type TargetRow = RowDataPacket & { id: number; role: string };
type CountRow = RowDataPacket & { total: number };
type DocumentBlobRow = RowDataPacket & { blob_url: string };
type ClientProcessRow = RowDataPacket & {
  application_uuid: string;
  application_status: string;
  flow_version: number;
  requested_amount: number;
  offered_amount: number | null;
  offered_fortnight_payment: number | null;
  offered_term_fortnights: number | null;
  document_count: number;
  verified_document_count: number;
  loan_uuid: string | null;
  loan_status: string | null;
  principal: number | null;
  installment_amount: number | null;
  term_fortnights: number | null;
  paid_installments: number;
  next_due_date: string | null;
  next_due_balance: number | null;
};

async function findTargetForUpdate(connection: PoolConnection, uuid: string) {
  const [rows] = await connection.execute<TargetRow[]>(
    `SELECT id, role
       FROM users
      WHERE uuid = ?
      LIMIT 1
      FOR UPDATE`,
    [uuid],
  );
  const target = rows[0];

  if (!target) throw new ApiError(404, "Cliente no encontrado.", "NOT_FOUND");
  if (target.role !== "cliente") {
    throw new ApiError(400, "Esta acción sólo está disponible para clientes.", "INVALID_ROLE");
  }

  return target;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  try {
    const actor = await requireApiUser();
    const { uuid: rawUuid } = await context.params;
    const uuid = uuidSchema.parse(rawUuid);

    if (actor.role === "cliente" && actor.uuid !== uuid) {
      throw new ApiError(403, "No puedes consultar ese usuario.", "FORBIDDEN");
    }

    const [rows] = await getDb().execute<UserDetailRow[]>(
      `SELECT u.uuid, u.first_name, u.paternal_last_name, u.maternal_last_name,
              u.email, u.phone, u.role, u.status, u.last_login_at, u.created_at,
              cp.birth_date, cp.curp, cp.rfc, cp.ine_number, cp.gender,
              cp.marital_status, cp.occupation, cp.company_name, cp.monthly_income,
              cp.address, cp.street, cp.exterior_number, cp.interior_number,
              cp.neighborhood, cp.postal_code, cp.city, cp.state, cp.country,
              cp.emergency_contact_name, cp.emergency_contact_phone, cp.notes,
              (SELECT COUNT(*) FROM loan_applications la
                WHERE la.user_id = u.id) AS application_count,
              (SELECT COUNT(*) FROM loans l
                WHERE l.user_id = u.id) AS loan_count,
              (SELECT COUNT(*) FROM loan_payments lp
                INNER JOIN loans l ON l.id = lp.loan_id
                WHERE l.user_id = u.id) AS payment_count
         FROM users u
         LEFT JOIN client_profiles cp ON cp.user_id = u.id
        WHERE u.uuid = ?
        LIMIT 1`,
      [uuid],
    );
    const user = rows[0];

    if (!user) throw new ApiError(404, "Usuario no encontrado.", "NOT_FOUND");

    const [processRows] = await getDb().execute<ClientProcessRow[]>(
      `SELECT la.uuid AS application_uuid, la.status AS application_status,
              la.flow_version, la.requested_amount, la.offered_amount,
              la.offered_fortnight_payment, la.offered_term_fortnights,
              (SELECT COUNT(*) FROM client_documents cd
                WHERE cd.application_id = la.id) AS document_count,
              (SELECT COUNT(*) FROM client_documents cd
                WHERE cd.application_id = la.id
                  AND cd.verification_status = 'verificado') AS verified_document_count,
              l.uuid AS loan_uuid, l.status AS loan_status, l.principal,
              l.installment_amount, l.term_fortnights,
              (SELECT COUNT(*) FROM loan_installments li
                WHERE li.loan_id = l.id AND li.status = 'pagado') AS paid_installments,
              (SELECT MIN(li.due_date) FROM loan_installments li
                WHERE li.loan_id = l.id AND li.amount_paid < li.amount_due) AS next_due_date,
              (SELECT li.amount_due - li.amount_paid
                 FROM loan_installments li
                WHERE li.loan_id = l.id AND li.amount_paid < li.amount_due
                ORDER BY li.installment_number
                LIMIT 1) AS next_due_balance
         FROM loan_applications la
         INNER JOIN users u ON u.id = la.user_id
         LEFT JOIN loans l ON l.application_id = la.id
        WHERE u.uuid = ?
        ORDER BY la.created_at DESC, la.id DESC
        LIMIT 1`,
      [uuid],
    );
    const processRow = processRows[0];
    const process = getClientProcess({
      applicationStatus: processRow?.application_status,
      loanStatus: processRow?.loan_status,
      documentCount: Number(processRow?.document_count || 0),
      verifiedDocumentCount: Number(processRow?.verified_document_count || 0),
      requiredDocumentCount: Number(processRow?.flow_version) === 1 ? 5 : 4,
      paidInstallments: Number(processRow?.paid_installments || 0),
      termFortnights: processRow?.term_fortnights,
      nextDueDate: processRow?.next_due_date,
    });

    return NextResponse.json({
      ok: true,
      user: {
        ...user,
        process,
        application_uuid: processRow?.application_uuid || null,
        loan_uuid: processRow?.loan_uuid || null,
        process_amount: Number(
          processRow?.principal || processRow?.offered_amount || processRow?.requested_amount || 0,
        ),
        process_installment_amount: Number(
          processRow?.installment_amount || processRow?.offered_fortnight_payment || 0,
        ),
        process_term_fortnights: Number(
          processRow?.term_fortnights || processRow?.offered_term_fortnights || 0,
        ),
        process_paid_installments: Number(processRow?.paid_installments || 0),
        process_next_due_date: processRow?.next_due_date || null,
        process_next_due_balance:
          processRow?.next_due_balance === null || processRow?.next_due_balance === undefined
            ? null
            : Number(processRow.next_due_balance),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  let connection: PoolConnection | undefined;

  try {
    await requireApiUser(["admin"]);
    const { uuid: rawUuid } = await context.params;
    const uuid = uuidSchema.parse(rawUuid);
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Los datos enviados no son válidos.", "INVALID_JSON");
    });
    const data = updateClientSchema.parse(body);
    const phone = normalizeMexicanWhatsapp(data.phone);

    if (!/^\d{10}$/.test(phone)) {
      throw new ApiError(400, "El WhatsApp debe contener 10 dígitos.", "INVALID_PHONE");
    }

    connection = await getDb().getConnection();
    await connection.beginTransaction();
    const target = await findTargetForUpdate(connection, uuid);

    await connection.execute(
      `UPDATE users
          SET first_name = ?, paternal_last_name = ?, maternal_last_name = ?,
              email = ?, phone = ?, status = ?
        WHERE id = ?`,
      [
        data.firstName,
        data.paternalLastName,
        data.maternalLastName ?? null,
        data.email ?? null,
        phone,
        data.status,
        target.id,
      ],
    );

    await connection.execute(
      `INSERT INTO client_profiles (
        user_id, birth_date, curp, rfc, ine_number, gender, marital_status,
        occupation, company_name, monthly_income, address, street,
        exterior_number, interior_number, neighborhood, postal_code, city,
        state, country, emergency_contact_name, emergency_contact_phone, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        birth_date = VALUES(birth_date), curp = VALUES(curp), rfc = VALUES(rfc),
        ine_number = VALUES(ine_number), gender = VALUES(gender),
        marital_status = VALUES(marital_status), occupation = VALUES(occupation),
        company_name = VALUES(company_name), monthly_income = VALUES(monthly_income),
        address = VALUES(address), street = VALUES(street),
        exterior_number = VALUES(exterior_number), interior_number = VALUES(interior_number),
        neighborhood = VALUES(neighborhood), postal_code = VALUES(postal_code),
        city = VALUES(city), state = VALUES(state), country = VALUES(country),
        emergency_contact_name = VALUES(emergency_contact_name),
        emergency_contact_phone = VALUES(emergency_contact_phone), notes = VALUES(notes)`,
      [
        target.id,
        data.birthDate,
        data.curp ?? null,
        data.rfc ?? null,
        data.ineNumber ?? null,
        data.gender,
        data.maritalStatus ?? null,
        data.occupation ?? null,
        data.companyName ?? null,
        data.monthlyIncome,
        data.address ?? null,
        data.street ?? null,
        data.exteriorNumber ?? null,
        data.interiorNumber ?? null,
        data.neighborhood ?? null,
        data.postalCode,
        data.city ?? null,
        data.state ?? null,
        data.country,
        data.emergencyContactName ?? null,
        data.emergencyContactPhone ?? null,
        data.notes ?? null,
      ],
    );

    await connection.commit();

    return NextResponse.json({
      ok: true,
      message: "Los datos del cliente se actualizaron correctamente.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  let connection: PoolConnection | undefined;

  try {
    await requireApiUser(["admin"]);
    const { uuid: rawUuid } = await context.params;
    const uuid = uuidSchema.parse(rawUuid);
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Debes confirmar la eliminación.", "INVALID_JSON");
    });
    deleteClientSchema.parse(body);

    connection = await getDb().getConnection();
    await connection.beginTransaction();
    const target = await findTargetForUpdate(connection, uuid);

    // Bloquea los créditos antes de comprobar pagos para evitar que se registre
    // un abono mientras se elimina el expediente.
    await connection.execute(
      `SELECT id FROM loans WHERE user_id = ? FOR UPDATE`,
      [target.id],
    );

    const [paymentRows] = await connection.execute<CountRow[]>(
      `SELECT COUNT(*) AS total
         FROM loan_payments lp
         INNER JOIN loans l ON l.id = lp.loan_id
        WHERE l.user_id = ?`,
      [target.id],
    );
    const paymentCount = Number(paymentRows[0]?.total || 0);

    if (!canPermanentlyDeleteClient(paymentCount)) {
      throw new ApiError(
        409,
        "Este cliente ya tiene pagos registrados. Desactiva su cuenta en lugar de eliminarla.",
        "CLIENT_HAS_PAYMENTS",
      );
    }

    const [documentRows] = await connection.execute<DocumentBlobRow[]>(
      `SELECT cd.blob_url
         FROM client_documents cd
         INNER JOIN loan_applications la ON la.id = cd.application_id
        WHERE la.user_id = ?`,
      [target.id],
    );

    // El orden respeta las llaves foráneas: primero créditos, después
    // solicitudes y finalmente la cuenta del cliente.
    await connection.execute(`DELETE FROM loans WHERE user_id = ?`, [target.id]);
    await connection.execute(`DELETE FROM loan_applications WHERE user_id = ?`, [target.id]);

    await connection.execute(
      `DELETE FROM payout_account_events WHERE actor_user_id = ?`,
      [target.id],
    );
    await connection.execute(
      `DELETE FROM client_payout_accounts WHERE user_id = ?`,
      [target.id],
    );
    const [result] = await connection.execute<ResultSetHeader>(
      `DELETE FROM users WHERE id = ?`,
      [target.id],
    );

    if (result.affectedRows !== 1) {
      throw new ApiError(404, "Cliente no encontrado.", "NOT_FOUND");
    }

    await connection.commit();

    const blobUrls = [...new Set(documentRows.map((row) => row.blob_url).filter(Boolean))];
    if (blobUrls.length) {
      try {
        await del(blobUrls);
      } catch (cleanupError) {
        // El expediente ya no es accesible desde la aplicación. Se registra el
        // fallo para poder limpiar posteriormente cualquier blob huérfano.
        console.error("Could not delete client private blobs:", cleanupError);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "La cuenta y todo el proceso del cliente fueron eliminados definitivamente.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
