import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { setSessionCookie, signSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { publicRegisterSchema } from "@/lib/validation";
import { normalizeMexicanWhatsapp } from "@/lib/phone";

export async function POST(request: Request) {
  let connection: PoolConnection | undefined;

  try {
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Los datos enviados no son válidos.", "INVALID_JSON");
    });
    const data = publicRegisterSchema.parse(body);
    const whatsapp = normalizeMexicanWhatsapp(data.whatsapp);

if (!/^\d{10}$/.test(whatsapp)) {
  throw new ApiError(
    400,
    "Escribe un número de WhatsApp mexicano de 10 dígitos.",
    "INVALID_WHATSAPP",
  );
}

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const passwordHash = await hash(data.password, 12);
    const uuid = randomUUID();
    const [userResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO users (
        uuid, first_name, paternal_last_name, maternal_last_name,
        email, phone, password_hash, role, status, created_by
      ) VALUES (?, ?, '', NULL, NULL, ?, ?, 'cliente', 'activo', NULL)`,
      [uuid, data.fullName, whatsapp, passwordHash],
    );

    await connection.execute(
      `INSERT INTO client_profiles (
        user_id, birth_date, address, postal_code
      ) VALUES (?, ?, ?, ?)`,
      [userResult.insertId, data.birthDate, data.address, data.postalCode],
    );

    await connection.commit();

    const token = await signSession({
      userId: userResult.insertId,
      role: "cliente",
    });
    await setSessionCookie(token);

    return NextResponse.json(
      {
        ok: true,
        message: "Cuenta creada correctamente.",
        redirectTo: "/mi-cuenta",
        user: {
          uuid,
          name: data.fullName,
          phone: whatsapp,
          role: "cliente",
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
