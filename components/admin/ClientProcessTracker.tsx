import { clientProcessSteps, type ClientProcess } from "@/lib/client-process";

export default function ClientProcessTracker({ process }: { process: ClientProcess }) {
  return (
    <section className={`panel client-process-card process-tone-${process.tone}`}>
      <div className="client-process-heading">
        <div>
          <p className="eyebrow">Seguimiento del cliente</p>
          <h2>{process.title}</h2>
          <p className="muted">{process.description}</p>
        </div>
        <strong>Paso {process.currentStep} de {clientProcessSteps.length}</strong>
      </div>

      <ol className="client-process-steps" aria-label="Proceso del crédito">
        {clientProcessSteps.map((label, index) => {
          const step = index + 1;
          const completed = step < process.currentStep || process.key === "liquidado";
          const current = step === process.currentStep;

          return (
            <li
              key={label}
              className={`${completed ? "process-step-complete" : ""} ${current ? "process-step-current" : ""}`.trim()}
              aria-current={current ? "step" : undefined}
            >
              <span>{completed ? "✓" : step}</span>
              <small>{label}</small>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
