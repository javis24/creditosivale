import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { normalizeMexicanWhatsapp } from "@/lib/phone";
import {
  deleteClientSchema,
  updateClientSchema,
  uuidSchema,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

type UserDetailRow = RowDataPacket & Record<string, string | number | null>;
type TargetRow = RowDataPacket & { id: number; role: string };
type CountRow = RowDataPacket & { total: number };

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

    return NextResponse.json({ ok: true, user });
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

    const [applicationRows] = await connection.execute<CountRow[]>(
      `SELECT COUNT(*) AS total
         FROM loan_applications
        WHERE user_id = ?`,
      [target.id],
    );

    if (Number(applicationRows[0]?.total || 0) > 0) {
      throw new ApiError(
        409,
        "Este cliente ya tiene historial de solicitudes. Desactiva su cuenta en lugar de eliminarla.",
        "CLIENT_HAS_FINANCIAL_HISTORY",
      );
    }

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

    return NextResponse.json({
      ok: true,
      message: "La cuenta del cliente fue eliminada definitivamente.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
