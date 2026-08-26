import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().query("SELECT 1");

    return NextResponse.json({ ok: true, database: "connected" });
  } catch (error) {
    console.error("Health check failed:", error);

    return NextResponse.json(
      { ok: false, database: "disconnected" },
      { status: 503 },
    );
  }
}
