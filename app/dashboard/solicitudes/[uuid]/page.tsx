import { redirect } from "next/navigation";
import LoanApplicationReview from "@/components/admin/LoanApplicationReview";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Revisar solicitud" };
export const dynamic = "force-dynamic";

export default async function LoanApplicationReviewPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const user = await requirePageUser();
  if (user.role === "cliente") redirect("/mi-cuenta");
  const { uuid } = await params;

  return (
    <main className="page-container page-container-review">
      <LoanApplicationReview uuid={uuid} />
    </main>
  );
}
