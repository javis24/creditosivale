import { randomUUID } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import {
  encryptCardNumber,
  encryptClabe,
  maskedCardNumber,
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
  card_last4: string | null;
  clabe_last4: string | null;
  updated_at: string;
};

type ExistingClabeRow = RowDataPacket & {
  clabe_ciphertext: string | null;
  clabe_iv: string | null;
  clabe_auth_tag: string | null;
  clabe_last4: string | null;
};

export async function GET() {
  try {
    const user = await requireApiUser(["cliente"]);
    const [rows] = await getDb().execute<AccountRow[]>(
      `SELECT id, bank_name, account_holder, card_last4, clabe_last4, updated_at
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
            maskedCardNumber: account.card_last4
              ? maskedCardNumber(account.card_last4)
              : null,
            cardLast4: account.card_last4,
            maskedClabe: account.clabe_last4
              ? maskedClabe(account.clabe_last4)
              : null,
            clabeLast4: account.clabe_last4,
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
    const encryptedCard = encryptCardNumber(data.cardNumber);
    const encryptedClabe = data.clabe ? encryptClabe(data.clabe) : null;

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [existingRows] = await connection.execute<ExistingClabeRow[]>(
      `SELECT clabe_ciphertext, clabe_iv, clabe_auth_tag, clabe_last4
         FROM client_payout_accounts
        WHERE user_id = ?
        LIMIT 1
        FOR UPDATE`,
      [user.id],
    );
    const existingClabe = existingRows[0];
    const savedClabe = encryptedClabe ||
      (existingClabe?.clabe_ciphertext &&
      existingClabe.clabe_iv &&
      existingClabe.clabe_auth_tag &&
      existingClabe.clabe_last4
        ? {
            ciphertext: existingClabe.clabe_ciphertext,
            iv: existingClabe.clabe_iv,
            authTag: existingClabe.clabe_auth_tag,
            last4: existingClabe.clabe_last4,
          }
        : null);

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO client_payout_accounts (
         uuid, user_id, bank_name, account_holder,
         card_ciphertext, card_iv, card_auth_tag, card_last4,
         clabe_ciphertext, clabe_iv, clabe_auth_tag, clabe_last4, consent_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         bank_name = VALUES(bank_name),
         account_holder = VALUES(account_holder),
         card_ciphertext = VALUES(card_ciphertext),
         card_iv = VALUES(card_iv),
         card_auth_tag = VALUES(card_auth_tag),
         card_last4 = VALUES(card_last4),
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
        encryptedCard.ciphertext,
        encryptedCard.iv,
        encryptedCard.authTag,
        encryptedCard.last4,
        savedClabe?.ciphertext ?? null,
        savedClabe?.iv ?? null,
        savedClabe?.authTag ?? null,
        savedClabe?.last4 ?? null,
      ],
    );

    await connection.execute(
      `INSERT INTO payout_account_events
        (payout_account_id, actor_user_id, application_id, event_type, revealed_field)
       VALUES (?, ?, NULL, 'account_saved', NULL)`,
      [result.insertId, user.id],
    );
    await connection.commit();

    return NextResponse.json({
      ok: true,
      message: "Cuenta de depósito guardada de forma segura.",
      account: {
        bankName: data.bankName,
        accountHolder: data.accountHolder,
        maskedCardNumber: maskedCardNumber(encryptedCard.last4),
        cardLast4: encryptedCard.last4,
        maskedClabe: savedClabe ? maskedClabe(savedClabe.last4) : null,
        clabeLast4: savedClabe?.last4 ?? null,
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
