import Link from "next/link";
import { redirect } from "next/navigation";
import LoanApplicationWizard from "@/components/loan/LoanApplicationWizard";
import { requirePageUser } from "@/lib/auth";

export const metadata = { title: "Solicitar préstamo" };
export const dynamic = "force-dynamic";

export default async function LoanApplicationPage() {
  const user = await requirePageUser();
  if (user.role !== "cliente") redirect("/dashboard");

  return (
    <main className="client-portal loan-page">
      <Link href="/mi-cuenta" className="back-link">← Regresar a mi cuenta</Link>
      <LoanApplicationWizard />
    </main>
  );
}
