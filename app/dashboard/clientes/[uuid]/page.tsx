import Link from "next/link";
import { redirect } from "next/navigation";
import ClientEditForm from "@/components/ClientEditForm";
import { requirePageUser } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const metadata = { title: "Editar cliente" };
export const dynamic = "force-dynamic";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const user = await requirePageUser();
  if (user.role !== "admin") redirect("/dashboard/clientes");

  const { uuid: rawUuid } = await params;
  const parsedUuid = uuidSchema.safeParse(rawUuid);
  if (!parsedUuid.success) redirect("/dashboard/clientes");

  return (
    <main className="page-container page-container-review">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Expediente del cliente</p>
          <h1>Editar cliente</h1>
          <p className="muted">Corrige sus datos o controla el acceso a su cuenta.</p>
        </div>
        <Link className="button button-secondary" href="/dashboard/clientes">
          ← Volver a clientes
        </Link>
      </div>
      <ClientEditForm uuid={parsedUuid.data} />
    </main>
  );
}
