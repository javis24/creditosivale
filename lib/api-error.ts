import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "API_ERROR",
  ) {
    super(message);
  }
}

type MysqlError = Error & {
  code?: string;
  errno?: number;
  sqlMessage?: string;
};

export function apiErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Revisa los datos enviados.",
        errors: error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  if (error instanceof ApiError) {
    return NextResponse.json(
      { ok: false, code: error.code, message: error.message },
      { status: error.status },
    );
  }

  const mysqlError = error as MysqlError;

  if (mysqlError?.code === "ER_DUP_ENTRY" || mysqlError?.errno === 1062) {
    return NextResponse.json(
      {
        ok: false,
        code: "DUPLICATE_VALUE",
        message: "El WhatsApp, correo, CURP o RFC ya pertenece a otro usuario.",
      },
      { status: 409 },
    );
  }

  console.error("API error:", error);

  return NextResponse.json(
    {
      ok: false,
      code: "INTERNAL_ERROR",
      message: "Ocurrió un error interno. Intenta nuevamente.",
    },
    { status: 500 },
  );
}
