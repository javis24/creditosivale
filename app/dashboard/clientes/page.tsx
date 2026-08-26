import Link from "next/link";
import ClientList from "@/components/ClientList";
import { requirePageUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const user = await requirePageUser();
  if (user.role === "cliente") redirect("/dashboard");

  return (
    <main className="page-container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Expedientes</p>
          <h1>Clientes</h1>
          <p className="muted">Consulta y administra la información de tus clientes.</p>
        </div>
        <Link className="button button-primary" href="/dashboard/clientes/nuevo">
          Registrar cliente
        </Link>
      </div>
      <ClientList />
    </main>
  );
}
