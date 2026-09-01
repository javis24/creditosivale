import LoanManagement from "@/components/admin/LoanManagement";

export const metadata = { title: "Administrar crédito" };

export default async function LoanManagementPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;

  return (
    <main className="page-container page-container-review">
      <LoanManagement uuid={uuid} />
    </main>
  );
}
