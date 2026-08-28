import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import { requirePageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const roleLabels = {
  admin: "Administrador",
  gerencia: "Gerencia",
  vendedor: "Vendedor",
  cliente: "Cliente",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  if (user.role === "cliente") redirect("/mi-cuenta");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="sidebar-brand">
          <span className="brand-mark brand-mark-small">CS</span>
          <span>
            <strong>Crédito Sí Vale</strong>
            <small>Administración</small>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="Navegación principal">
          <Link href="/dashboard">Resumen</Link>
          <Link href="/dashboard/solicitudes">Solicitudes</Link>
          <Link href="/dashboard/clientes">Clientes</Link>
          <span className="nav-disabled">Pagos <small>Próximamente</small></span>
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
          <div className="sidebar-user-copy">
            <strong>{user.name}</strong>
            <span>{roleLabels[user.role]}</span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <div className="app-content">
        <header className="mobile-header">
          <span className="brand-mark brand-mark-small">CS</span>
          <strong>Crédito Sí Vale</strong>
        </header>
        {children}
      </div>
    </div>
  );
}
