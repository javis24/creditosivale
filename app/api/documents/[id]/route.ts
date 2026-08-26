import { get } from "@vercel/blob";
import type { RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocumentAccessRow = RowDataPacket & {
  blob_pathname: string;
  original_name: string;
  user_id: number;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireApiUser();
    const { id: rawId } = await context.params;
    const id = z.coerce.number().int().positive().parse(rawId);
    const [rows] = await getDb().execute<DocumentAccessRow[]>(
      `SELECT cd.blob_pathname, cd.original_name, la.user_id
         FROM client_documents cd
         INNER JOIN loan_applications la ON la.id = cd.application_id
        WHERE cd.id = ?
        LIMIT 1`,
      [id],
    );
    const document = rows[0];

    if (!document) {
      throw new ApiError(404, "Documento no encontrado.", "DOCUMENT_NOT_FOUND");
    }

    const isStaff = ["admin", "gerencia", "vendedor"].includes(actor.role);
    if (!isStaff && document.user_id !== actor.id) {
      throw new ApiError(403, "No puedes consultar ese documento.", "FORBIDDEN");
    }

    const result = await get(document.blob_pathname, {
      access: "private",
      useCache: false,
    });

    if (!result || result.statusCode !== 200) {
      throw new ApiError(404, "El archivo privado no está disponible.", "BLOB_NOT_FOUND");
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.original_name)}`,
        "Content-Security-Policy": "default-src 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
