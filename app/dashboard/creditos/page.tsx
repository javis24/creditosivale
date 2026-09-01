import LoanPortfolioList from "@/components/admin/LoanPortfolioList";

export const metadata = { title: "Cartera de créditos" };

export default function LoansPage() {
  return (
    <main className="page-container">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Cartera y cobranza</p>
          <h1>Créditos</h1>
          <p className="muted">
            Activa créditos autorizados, consulta saldos y registra pagos.
          </p>
        </div>
      </div>
      <LoanPortfolioList />
    </main>
  );
}
