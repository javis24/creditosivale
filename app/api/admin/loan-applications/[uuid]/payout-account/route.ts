import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { decryptClabe } from "@/lib/bank-account";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { applicationUuidSchema } from "@/lib/loan-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AccountRow = RowDataPacket & {
  application_id: number;
  payout_account_id: number;
  bank_name: string;
  account_holder: string;
  clabe_ciphertext: string;
  clabe_iv: string;
  clabe_auth_tag: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  let connection: PoolConnection | undefined;

  try {
    const actor = await requireApiUser(["admin", "gerencia"]);
    const { uuid: rawUuid } = await context.params;
    const uuid = applicationUuidSchema.parse(rawUuid);

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute<AccountRow[]>(
      `SELECT la.id AS application_id, cpa.id AS payout_account_id,
              cpa.bank_name, cpa.account_holder, cpa.clabe_ciphertext,
              cpa.clabe_iv, cpa.clabe_auth_tag
         FROM loan_applications la
         INNER JOIN client_payout_accounts cpa ON cpa.user_id = la.user_id
        WHERE la.uuid = ?
        LIMIT 1
        FOR UPDATE`,
      [uuid],
    );
    const account = rows[0];

    if (!account) {
      throw new ApiError(
        404,
        "El cliente todavía no registra una cuenta para depósito.",
        "PAYOUT_ACCOUNT_NOT_FOUND",
      );
    }

    const clabe = decryptClabe({
      ciphertext: account.clabe_ciphertext,
      iv: account.clabe_iv,
      authTag: account.clabe_auth_tag,
    });

    await connection.execute(
      `INSERT INTO payout_account_events
        (payout_account_id, actor_user_id, application_id, event_type)
       VALUES (?, ?, ?, 'account_revealed')`,
      [account.payout_account_id, actor.id, account.application_id],
    );
    await connection.commit();

    return NextResponse.json(
      {
        ok: true,
        account: {
          bankName: account.bank_name,
          accountHolder: account.account_holder,
          clabe,
        },
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
