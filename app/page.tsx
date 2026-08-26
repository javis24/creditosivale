import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(
    user
      ? user.role === "cliente"
        ? "/mi-cuenta"
        : "/dashboard"
      : "/login",
  );
}
