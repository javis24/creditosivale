import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { decryptCardNumber, decryptClabe } from "@/lib/bank-account";
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
  card_ciphertext: string | null;
  card_iv: string | null;
  card_auth_tag: string | null;
  clabe_ciphertext: string | null;
  clabe_iv: string | null;
  clabe_auth_tag: string | null;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  let connection: PoolConnection | undefined;

  try {
    const actor = await requireApiUser(["admin", "gerencia"]);
    const { uuid: rawUuid } = await context.params;
    const uuid = applicationUuidSchema.parse(rawUuid);
    const field = new URL(request.url).searchParams.get("field") || "card";
    if (field !== "card" && field !== "clabe") {
      throw new ApiError(400, "El dato solicitado no es válido.", "INVALID_FIELD");
    }

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute<AccountRow[]>(
      `SELECT la.id AS application_id, cpa.id AS payout_account_id,
              cpa.bank_name, cpa.account_holder, cpa.clabe_ciphertext,
              cpa.clabe_iv, cpa.clabe_auth_tag, cpa.card_ciphertext,
              cpa.card_iv, cpa.card_auth_tag
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

    const encrypted =
      field === "card"
        ? {
            ciphertext: account.card_ciphertext,
            iv: account.card_iv,
            authTag: account.card_auth_tag,
          }
        : {
            ciphertext: account.clabe_ciphertext,
            iv: account.clabe_iv,
            authTag: account.clabe_auth_tag,
          };

    if (!encrypted.ciphertext || !encrypted.iv || !encrypted.authTag) {
      throw new ApiError(
        404,
        field === "card"
          ? "El cliente todavía no registra su tarjeta de débito."
          : "El cliente no registró una CLABE interbancaria.",
        "PAYOUT_FIELD_NOT_FOUND",
      );
    }

    const value =
      field === "card"
        ? decryptCardNumber({
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
          })
        : decryptClabe({
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
          });

    await connection.execute(
      `INSERT INTO payout_account_events
        (payout_account_id, actor_user_id, application_id, event_type, revealed_field)
       VALUES (?, ?, ?, 'account_revealed', ?)`,
      [account.payout_account_id, actor.id, account.application_id, field],
    );
    await connection.commit();

    return NextResponse.json(
      {
        ok: true,
        account: {
          bankName: account.bank_name,
          accountHolder: account.account_holder,
          field,
          value,
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
