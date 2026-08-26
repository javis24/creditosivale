import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import type { RowDataPacket } from "mysql2";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/api-error";
import type { CurrentUser, Role, SessionPayload } from "@/types/auth";

const SESSION_ISSUER = "creditosivale-admin";
const SESSION_AUDIENCE = "creditosivale-web";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

function sessionCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Host-creditosivale_session"
    : "creditosivale_session";
}

function secretKey() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32 || secret.includes("CAMBIA_")) {
    throw new Error("AUTH_SECRET debe tener al menos 32 caracteres.");
  }

  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.userId))
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey());
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();

  cookieStore.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();

  cookieStore.set(sessionCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    const userId = Number(payload.sub);
    const role = payload.role as Role;

    if (!Number.isInteger(userId) || !role) return null;

    return { userId, role };
  } catch {
    return null;
  }
}

type CurrentUserRow = RowDataPacket & {
  id: number;
  uuid: string;
  first_name: string;
  paternal_last_name: string;
  maternal_last_name: string | null;
  email: string | null;
  phone: string | null;
  role: Role;
  status: CurrentUser["status"];
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await readSession();

  if (!session) return null;

  const [rows] = await getDb().execute<CurrentUserRow[]>(
    `SELECT id, uuid, first_name, paternal_last_name, maternal_last_name,
            email, phone, role, status
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [session.userId],
  );
  const row = rows[0];

  if (!row || row.status !== "activo") return null;

  return {
    id: row.id,
    uuid: row.uuid,
    name: [row.first_name, row.paternal_last_name, row.maternal_last_name]
      .filter(Boolean)
      .join(" "),
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
  };
}

export async function requireApiUser(allowedRoles?: Role[]) {
  const user = await getCurrentUser();

  if (!user) {
    throw new ApiError(401, "Debes iniciar sesión.", "UNAUTHORIZED");
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new ApiError(403, "No tienes permiso para realizar esta acción.", "FORBIDDEN");
  }

  return user;
}

export async function requirePageUser() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  return user;
}
