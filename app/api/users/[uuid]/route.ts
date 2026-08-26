import type { RowDataPacket } from "mysql2";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type UserDetailRow = RowDataPacket & Record<string, string | number | null>;

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
              cp.street, cp.exterior_number, cp.interior_number, cp.neighborhood,
              cp.postal_code, cp.city, cp.state, cp.country,
              cp.emergency_contact_name, cp.emergency_contact_phone, cp.notes
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
