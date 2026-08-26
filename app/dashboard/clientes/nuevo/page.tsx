import { redirect } from "next/navigation";
import ClientForm from "@/components/ClientForm";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Registrar cliente" };
export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const user = await requirePageUser();
  if (user.role === "cliente") redirect("/dashboard");

  return (
    <main className="page-container page-container-narrow">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Nuevo expediente</p>
          <h1>Registrar cliente</h1>
          <p className="muted">Los campos marcados con * son obligatorios.</p>
        </div>
      </div>
      <ClientForm />
    </main>
  );
}
