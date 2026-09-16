import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createUserSchema, listUsersSchema } from "@/lib/validation";
import { getClientProcess } from "@/lib/client-process";
import type { Role } from "@/types/auth";

export const dynamic = "force-dynamic";

const STAFF_ROLES: Role[] = ["admin", "gerencia", "vendedor"];

type UserListRow = RowDataPacket & {
  uuid: string;
  first_name: string;
  paternal_last_name: string;
  maternal_last_name: string | null;
  email: string | null;
  phone: string | null;
  role: Role;
  status: string;
  birth_date: string | null;
  occupation: string | null;
  monthly_income: number | null;
  city: string | null;
  state: string | null;
  created_at: string;
  application_uuid: string | null;
  application_status: string | null;
  flow_version: number | null;
  document_count: number;
  verified_document_count: number;
  loan_uuid: string | null;
  loan_status: string | null;
  term_fortnights: number | null;
  paid_installments: number;
  next_due_date: string | null;
};

type CountRow = RowDataPacket & { total: number };

export async function GET(request: Request) {
  try {
    await requireApiUser(STAFF_ROLES);

    const url = new URL(request.url);
    const filters = listUsersSchema.parse({
      page: url.searchParams.get("page") || undefined,
      limit: url.searchParams.get("limit") || undefined,
      q: url.searchParams.get("q") || undefined,
      role: url.searchParams.get("role") || undefined,
    });
    const where: string[] = [];
    const values: Array<string | number> = [];

    if (filters.role) {
      where.push("u.role = ?");
      values.push(filters.role);
    }

    if (filters.q) {
      where.push(`(
        u.first_name LIKE ? OR u.paternal_last_name LIKE ? OR
        u.maternal_last_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?
      )`);
      const term = `%${filters.q}%`;
      values.push(term, term, term, term, term);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const offset = (filters.page - 1) * filters.limit;
    const db = getDb();
    const [countRows] = await db.execute<CountRow[]>(
      `SELECT COUNT(*) AS total FROM users u ${whereSql}`,
      values,
    );
    const [rows] = await db.execute<UserListRow[]>(
      `SELECT u.uuid, u.first_name, u.paternal_last_name, u.maternal_last_name,
              u.email, u.phone, u.role, u.status, u.created_at,
              cp.birth_date, cp.occupation, cp.monthly_income, cp.city, cp.state,
              la.uuid AS application_uuid, la.status AS application_status,
              la.flow_version,
              (SELECT COUNT(*) FROM client_documents cd
                WHERE cd.application_id = la.id) AS document_count,
              (SELECT COUNT(*) FROM client_documents cd
                WHERE cd.application_id = la.id
                  AND cd.verification_status = 'verificado') AS verified_document_count,
              l.uuid AS loan_uuid, l.status AS loan_status, l.term_fortnights,
              (SELECT COUNT(*) FROM loan_installments li
                WHERE li.loan_id = l.id AND li.status = 'pagado') AS paid_installments,
              (SELECT MIN(li.due_date) FROM loan_installments li
                WHERE li.loan_id = l.id AND li.amount_paid < li.amount_due) AS next_due_date
         FROM users u
         LEFT JOIN client_profiles cp ON cp.user_id = u.id
         LEFT JOIN loan_applications la ON la.id = (
           SELECT MAX(la2.id)
             FROM loan_applications la2
            WHERE la2.user_id = u.id
         )
         LEFT JOIN loans l ON l.application_id = la.id
         ${whereSql}
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?`,
      [...values, filters.limit, offset],
    );

    const total = Number(countRows[0]?.total || 0);

    return NextResponse.json({
      ok: true,
      users: rows.map((row) => ({
        uuid: row.uuid,
        name: [row.first_name, row.paternal_last_name, row.maternal_last_name]
          .filter(Boolean)
          .join(" "),
        email: row.email,
        phone: row.phone,
        role: row.role,
        status: row.status,
        birthDate: row.birth_date,
        occupation: row.occupation,
        monthlyIncome: row.monthly_income,
        city: row.city,
        state: row.state,
        createdAt: row.created_at,
        applicationUuid: row.application_uuid,
        loanUuid: row.loan_uuid,
        process:
          row.role === "cliente"
            ? getClientProcess({
                applicationStatus: row.application_status,
                loanStatus: row.loan_status,
                documentCount: Number(row.document_count || 0),
                verifiedDocumentCount: Number(row.verified_document_count || 0),
                requiredDocumentCount: Number(row.flow_version) === 1 ? 5 : 4,
                paidInstallments: Number(row.paid_installments || 0),
                termFortnights: row.term_fortnights,
                nextDueDate: row.next_due_date,
              })
            : null,
      })),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / filters.limit)),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let connection: PoolConnection | undefined;

  try {
    const actor = await requireApiUser(STAFF_ROLES);
    const body = await request.json().catch(() => {
      throw new ApiError(400, "El cuerpo de la solicitud no es válido.", "INVALID_JSON");
    });
    const data = createUserSchema.parse(body);

    if (data.role !== "cliente" && actor.role !== "admin") {
      throw new ApiError(
        403,
        "Sólo un administrador puede crear cuentas de personal.",
        "FORBIDDEN",
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?)`,
      [
        uuid,
        data.firstName,
        data.paternalLastName,
        data.maternalLastName ?? null,
        data.email,
        data.phone,
        passwordHash,
        data.role,
        actor.id,
      ],
    );

    if (data.role === "cliente") {
      await connection.execute(
        `INSERT INTO client_profiles (
          user_id, birth_date, curp, rfc, ine_number, gender, marital_status,
          occupation, company_name, monthly_income, street, exterior_number,
          interior_number, neighborhood, postal_code, city, state, country,
          emergency_contact_name, emergency_contact_phone, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userResult.insertId,
          data.birthDate,
          data.curp ?? null,
          data.rfc ?? null,
          data.ineNumber ?? null,
          data.gender,
          data.maritalStatus,
          data.occupation,
          data.companyName ?? null,
          data.monthlyIncome,
          data.street,
          data.exteriorNumber,
          data.interiorNumber ?? null,
          data.neighborhood,
          data.postalCode,
          data.city,
          data.state,
          data.country,
          data.emergencyContactName ?? null,
          data.emergencyContactPhone ?? null,
          data.notes ?? null,
        ],
      );
    }

    await connection.commit();

    return NextResponse.json(
      {
        ok: true,
        message: data.role === "cliente" ? "Cliente creado correctamente." : "Usuario creado correctamente.",
        user: {
          uuid,
          name: [data.firstName, data.paternalLastName, data.maternalLastName]
            .filter(Boolean)
            .join(" "),
          email: data.email,
          phone: data.phone,
          role: data.role,
          status: "activo",
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
