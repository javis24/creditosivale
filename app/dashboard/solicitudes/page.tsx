import { redirect } from "next/navigation";
import LoanApplicationList from "@/components/admin/LoanApplicationList";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Solicitudes de crédito" };
export const dynamic = "force-dynamic";

export default async function LoanApplicationsPage() {
  const user = await requirePageUser();
  if (user.role === "cliente") redirect("/mi-cuenta");

  return (
    <main className="page-container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Créditos</p>
          <h1>Solicitudes</h1>
          <p className="muted">
            Revisa expedientes, documentos y resoluciones de crédito.
          </p>
        </div>
      </div>
      <LoanApplicationList />
    </main>
  );
}
