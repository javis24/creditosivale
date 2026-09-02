import { randomUUID } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import {
  encryptClabe,
  maskedClabe,
  payoutAccountSchema,
} from "@/lib/bank-account";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AccountRow = RowDataPacket & {
  id: number;
  bank_name: string;
  account_holder: string;
  clabe_last4: string;
  updated_at: string;
};

export async function GET() {
  try {
    const user = await requireApiUser(["cliente"]);
    const [rows] = await getDb().execute<AccountRow[]>(
      `SELECT id, bank_name, account_holder, clabe_last4, updated_at
         FROM client_payout_accounts
        WHERE user_id = ?
        LIMIT 1`,
      [user.id],
    );
    const account = rows[0];

    return NextResponse.json({
      ok: true,
      account: account
        ? {
            bankName: account.bank_name,
            accountHolder: account.account_holder,
            maskedClabe: maskedClabe(account.clabe_last4),
            last4: account.clabe_last4,
            updatedAt: account.updated_at,
          }
        : null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  let connection: PoolConnection | undefined;

  try {
    const user = await requireApiUser(["cliente"]);
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Los datos enviados no son válidos.", "INVALID_JSON");
    });
    const data = payoutAccountSchema.parse(body);
    const encrypted = encryptClabe(data.clabe);

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO client_payout_accounts (
         uuid, user_id, bank_name, account_holder,
         clabe_ciphertext, clabe_iv, clabe_auth_tag, clabe_last4, consent_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         bank_name = VALUES(bank_name),
         account_holder = VALUES(account_holder),
         clabe_ciphertext = VALUES(clabe_ciphertext),
         clabe_iv = VALUES(clabe_iv),
         clabe_auth_tag = VALUES(clabe_auth_tag),
         clabe_last4 = VALUES(clabe_last4),
         consent_at = NOW()`,
      [
        randomUUID(),
        user.id,
        data.bankName,
        data.accountHolder,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        encrypted.last4,
      ],
    );

    await connection.execute(
      `INSERT INTO payout_account_events
        (payout_account_id, actor_user_id, application_id, event_type)
       VALUES (?, ?, NULL, 'account_saved')`,
      [result.insertId, user.id],
    );
    await connection.commit();

    return NextResponse.json({
      ok: true,
      message: "Cuenta de depósito guardada de forma segura.",
      account: {
        bankName: data.bankName,
        accountHolder: data.accountHolder,
        maskedClabe: maskedClabe(encrypted.last4),
        last4: encrypted.last4,
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
