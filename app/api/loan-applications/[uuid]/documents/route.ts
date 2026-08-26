import { del, put } from "@vercel/blob";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api-error";
import { applicationEventHash, sha256 } from "@/lib/application-security";
import { requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  applicationUuidSchema,
  documentTypeSchema,
  promissoryNoteHashSchema,
  type DocumentType,
} from "@/lib/loan-validation";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const fileExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

type ApplicationRow = RowDataPacket & {
  id: number;
  uuid: string;
  status: string;
  promissory_note_hash: string | null;
};

type ExistingDocumentRow = RowDataPacket & {
  blob_url: string;
};

function allowedMimeTypes(type: DocumentType) {
  return type === "address_proof"
    ? [...IMAGE_TYPES, "application/pdf"]
    : IMAGE_TYPES;
}

function hasExpectedSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return bytes.slice(0, 8).every((value, index) =>
      value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index],
    );
  }

  if (mimeType === "image/webp") {
    return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  }

  if (mimeType === "application/pdf") {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }

  return false;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  let connection: PoolConnection | undefined;
  let uploadedBlobUrl: string | undefined;
  let previousBlobUrl: string | undefined;

  try {
    const user = await requireApiUser(["cliente"]);
    const { uuid: rawUuid } = await context.params;
    const uuid = applicationUuidSchema.parse(rawUuid);
    const formData = await request.formData();
    const documentType = documentTypeSchema.parse(formData.get("documentType"));
    const noteHash =
      documentType === "signature"
        ? promissoryNoteHashSchema.parse(formData.get("noteHash"))
        : null;
    const file = formData.get("file");
    const privacyConsent = formData.get("privacyConsent") === "true";
    const biometricConsent = formData.get("biometricConsent") === "true";

    if (!privacyConsent) {
      throw new ApiError(
        400,
        "Debes aceptar el aviso de privacidad antes de subir documentos.",
        "PRIVACY_CONSENT_REQUIRED",
      );
    }

    if (documentType === "face_photo" && !biometricConsent) {
      throw new ApiError(
        400,
        "Debes autorizar expresamente el tratamiento de la fotografía facial.",
        "BIOMETRIC_CONSENT_REQUIRED",
      );
    }

    if (!(file instanceof File)) {
      throw new ApiError(400, "Selecciona un archivo.", "FILE_REQUIRED");
    }

    if (file.size < 500 || file.size > MAX_FILE_SIZE) {
      throw new ApiError(
        400,
        "El archivo debe pesar entre 500 bytes y 4 MB.",
        "INVALID_FILE_SIZE",
      );
    }

    if (!allowedMimeTypes(documentType).includes(file.type)) {
      throw new ApiError(
        400,
        documentType === "address_proof"
          ? "El recibo debe ser JPG, PNG, WEBP o PDF."
          : "El documento debe ser una imagen JPG, PNG o WEBP.",
        "INVALID_FILE_TYPE",
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    if (!hasExpectedSignature(bytes, file.type)) {
      throw new ApiError(
        400,
        "El contenido del archivo no coincide con su formato.",
        "INVALID_FILE_CONTENT",
      );
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new ApiError(
        503,
        "El almacenamiento privado de documentos todavía no está configurado.",
        "STORAGE_NOT_CONFIGURED",
      );
    }

    const [applicationRows] = await getDb().execute<ApplicationRow[]>(
      `SELECT id, uuid, status, promissory_note_hash
         FROM loan_applications
        WHERE uuid = ? AND user_id = ?
        LIMIT 1`,
      [uuid, user.id],
    );
    const application = applicationRows[0];

    if (!application) {
      throw new ApiError(404, "Solicitud no encontrada.", "APPLICATION_NOT_FOUND");
    }

    if (application.status !== "borrador") {
      throw new ApiError(
        409,
        "Los documentos de una solicitud enviada ya no se pueden modificar.",
        "APPLICATION_LOCKED",
      );
    }

    if (documentType === "signature" && application.promissory_note_hash !== noteHash) {
      throw new ApiError(
        409,
        "El pagaré cambió. Revísalo y dibuja tu firma nuevamente.",
        "PROMISSORY_NOTE_MISMATCH",
      );
    }

    const extension = fileExtensions[file.type];
    const blob = await put(
      `loan-applications/${user.uuid}/${uuid}/${documentType}.${extension}`,
      file,
      {
        access: "private",
        addRandomSuffix: true,
        contentType: file.type,
      },
    );
    uploadedBlobUrl = blob.url;

    connection = await getDb().getConnection();
    await connection.beginTransaction();

    const [lockedRows] = await connection.execute<ApplicationRow[]>(
      `SELECT id, uuid, status, promissory_note_hash
         FROM loan_applications
        WHERE uuid = ? AND user_id = ?
        LIMIT 1
        FOR UPDATE`,
      [uuid, user.id],
    );
    const lockedApplication = lockedRows[0];

    if (!lockedApplication || lockedApplication.status !== "borrador") {
      throw new ApiError(409, "La solicitud ya no admite cambios.", "APPLICATION_LOCKED");
    }


    if (
      documentType === "signature" &&
      lockedApplication.promissory_note_hash !== noteHash
    ) {
      throw new ApiError(
        409,
        "El pagaré cambió. Revísalo y dibuja tu firma nuevamente.",
        "PROMISSORY_NOTE_MISMATCH",
      );
    }

    const [existingRows] = await connection.execute<ExistingDocumentRow[]>(
      `SELECT blob_url
         FROM client_documents
        WHERE application_id = ? AND document_type = ?
        LIMIT 1`,
      [lockedApplication.id, documentType],
    );
    previousBlobUrl = existingRows[0]?.blob_url;

    const fileHash = sha256(bytes);
    await connection.execute(
      `INSERT INTO client_documents (
        application_id, document_type, blob_url, blob_pathname,
        original_name, mime_type, size_bytes, sha256, verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')
      ON DUPLICATE KEY UPDATE
        blob_url = VALUES(blob_url),
        blob_pathname = VALUES(blob_pathname),
        original_name = VALUES(original_name),
        mime_type = VALUES(mime_type),
        size_bytes = VALUES(size_bytes),
        sha256 = VALUES(sha256),
        verification_status = 'pendiente',
        rejection_reason = NULL`,
      [
        lockedApplication.id,
        documentType,
        blob.url,
        blob.pathname,
        file.name.slice(0, 255),
        file.type,
        file.size,
        fileHash,
      ],
    );

    await connection.execute(
      `UPDATE loan_applications
          SET privacy_notice_version = ?,
              privacy_consent_at = COALESCE(privacy_consent_at, NOW()),
              biometric_consent_at = CASE
                WHEN ? = 'face_photo' THEN COALESCE(biometric_consent_at, NOW())
                ELSE biometric_consent_at
              END
        WHERE id = ?`,
      [
        process.env.PRIVACY_NOTICE_VERSION || "2026-08",
        documentType,
        lockedApplication.id,
      ],
    );

    const occurredAt = new Date().toISOString();
    const eventHash = applicationEventHash({
      applicationUuid: uuid,
      eventType: "document_uploaded",
      actorUserId: user.id,
      occurredAt,
      metadata: { documentType, fileHash, size: file.size, noteHash },
    });
    await connection.execute(
      `INSERT INTO application_events
        (application_id, actor_user_id, event_type, event_hash, metadata_json)
       VALUES (?, ?, 'document_uploaded', ?, ?)`,
      [
        lockedApplication.id,
        user.id,
        eventHash,
        JSON.stringify({ documentType, fileHash, size: file.size, noteHash }),
      ],
    );

    await connection.commit();

    if (previousBlobUrl && previousBlobUrl !== uploadedBlobUrl) {
      try {
        await del(previousBlobUrl);
      } catch (cleanupError) {
        console.error("Could not delete replaced private blob:", cleanupError);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Documento guardado correctamente.",
      document: {
        type: documentType,
        originalName: file.name,
        verificationStatus: "pendiente",
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();

    if (uploadedBlobUrl) {
      try {
        await del(uploadedBlobUrl);
      } catch (cleanupError) {
        console.error("Could not clean failed private upload:", cleanupError);
      }
    }

    return apiErrorResponse(error);
  } finally {
    connection?.release();
  }
}
