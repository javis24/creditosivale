"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClientLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="button button-secondary" onClick={logout} disabled={loading}>
      {loading ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}
