import { compare } from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { setSessionCookie, signSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loginSchema } from "@/lib/validation";
import type { Role } from "@/types/auth";
import {
  normalizeMexicanWhatsapp,
  whatsappLookupCandidates,
} from "@/lib/phone";

type LoginUserRow = RowDataPacket & {
  id: number;
  uuid: string;
  first_name: string;
  paternal_last_name: string;
  maternal_last_name: string | null;
  email: string | null;
  phone: string | null;
  password_hash: string;
  role: Role;
  status: "activo" | "inactivo" | "bloqueado";
  failed_login_attempts: number;
  locked_until: string | null;
  is_locked: number;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => {
      throw new ApiError(400, "El cuerpo de la solicitud no es válido.", "INVALID_JSON");
    });
    const credentials = loginSchema.parse(body);
    const identifier = credentials.identifier.trim().toLowerCase();
    const whatsapp = normalizeMexicanWhatsapp(identifier);

if (!identifier.includes("@") && !/^\d{10}$/.test(whatsapp)) {
  throw new ApiError(
    400,
    "Escribe un número de WhatsApp mexicano de 10 dígitos.",
    "INVALID_WHATSAPP",
  );
}

const [phone10, phone52, phone521] =
  whatsappLookupCandidates(identifier);
    const db = getDb();
    const [rows] = await db.execute<LoginUserRow[]>(
  `SELECT id, uuid, first_name, paternal_last_name, maternal_last_name,
          email, phone, password_hash, role, status,
          failed_login_attempts, locked_until,
          (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked
     FROM users
    WHERE LOWER(email) = ?
       OR phone IN (?, ?, ?)
    LIMIT 1`,
  [identifier, phone10, phone52, phone521],
);
    const user = rows[0];

    const passwordMatches = user
      ? await compare(credentials.password, user.password_hash)
      : false;

    if (!user || !passwordMatches) {
      if (user) {
        const attempts = user.failed_login_attempts + 1;

        if (attempts >= 5) {
          await db.execute(
            `UPDATE users
                SET failed_login_attempts = 0,
                    locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE)
              WHERE id = ?`,
            [user.id],
          );
        } else {
          await db.execute(
            "UPDATE users SET failed_login_attempts = ? WHERE id = ?",
            [attempts, user.id],
          );
        }
      }

      throw new ApiError(
        401,
        "WhatsApp, correo o contraseña incorrectos.",
        "INVALID_CREDENTIALS",
      );
    }

    if (user.is_locked) {
      throw new ApiError(
        429,
        "La cuenta está temporalmente bloqueada. Intenta nuevamente en unos minutos.",
        "TOO_MANY_ATTEMPTS",
      );
    }

    if (user.status !== "activo") {
      throw new ApiError(403, "La cuenta no está activa.", "ACCOUNT_DISABLED");
    }

    const token = await signSession({ userId: user.id, role: user.role });
    await setSessionCookie(token);
    await db.execute(
      `UPDATE users
          SET last_login_at = NOW(), failed_login_attempts = 0, locked_until = NULL
        WHERE id = ?`,
      [user.id],
    );

    return NextResponse.json({
      ok: true,
      message: "Sesión iniciada.",
      redirectTo: user.role === "cliente" ? "/mi-cuenta" : "/dashboard",
      user: {
        id: user.id,
        uuid: user.uuid,
        name: [user.first_name, user.paternal_last_name, user.maternal_last_name]
          .filter(Boolean)
          .join(" "),
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
