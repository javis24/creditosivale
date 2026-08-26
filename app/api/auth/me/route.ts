import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error";
import { requireApiUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser();

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
