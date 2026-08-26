import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import ClientLogoutButton from "@/components/ClientLogoutButton";
import { requirePageUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const metadata = { title: "Mi cuenta" };
export const dynamic = "force-dynamic";

type ApplicationStatusRow = RowDataPacket & {
  uuid: string;
  status: "borrador" | "en_revision" | "aprobado" | "rechazado" | "cancelado";
  requested_amount: number;
  submitted_at: string | null;
};

type NotificationRow = RowDataPacket & {
  title: string;
  message: string;
  created_at: string;
};

export default async function ClientAccountPage() {
  const user = await requirePageUser();
  if (user.role !== "cliente") redirect("/dashboard");

  const db = getDb();
  const [[applications], [notifications]] = await Promise.all([
    db.execute<ApplicationStatusRow[]>(
      `SELECT uuid, status, requested_amount, submitted_at
         FROM loan_applications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [user.id],
    ),
    db.execute<NotificationRow[]>(
      `SELECT title, message, created_at
         FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [user.id],
    ),
  ]);
  const application = applications[0];
  const notification = notifications[0];
  const submitted = application?.status === "en_revision";
  const hasDraft = application?.status === "borrador";

  return (
    <main className="client-portal">
      <header className="client-header">
        <Link href="/mi-cuenta" className="public-brand">
          <span className="brand-mark brand-mark-small">CS</span>
          <strong>Crédito Sí Vale</strong>
        </Link>
        <ClientLogoutButton />
      </header>

      <section className="client-welcome">
        <div>
          <p className="eyebrow">Mi cuenta</p>
          <h1>Hola, {user.name.split(" ")[0]}</h1>
          <p className="muted">
            {submitted
              ? "Tu solicitud se encuentra en proceso de autorización."
              : hasDraft
                ? "Tienes una solicitud pendiente de terminar."
                : "Tu cuenta está lista. Ahora puedes comenzar tu solicitud de préstamo."}
          </p>
        </div>
        <Link className="button button-primary" href="/solicitar-prestamo">
          {submitted ? "Ver solicitud" : hasDraft ? "Continuar solicitud" : "Solicitar préstamo"}
        </Link>
      </section>

      {notification ? (
        <section className="client-notification">
          <span>✓</span>
          <div>
            <strong>{notification.title}</strong>
            <p>{notification.message}</p>
          </div>
        </section>
      ) : null}

      <section className="client-progress-grid">
        <article className="progress-card complete">
          <span>✓</span>
          <small>Paso 1</small>
          <strong>Cuenta creada</strong>
          <p>Tus datos básicos quedaron registrados.</p>
        </article>
        <article className={application ? "progress-card complete" : "progress-card current"}>
          <span>{application ? "✓" : "2"}</span>
          <small>Paso 2</small>
          <strong>Solicitar préstamo</strong>
          <p>Indica el monto, plazo, ingresos y referencias.</p>
        </article>
        <article className={submitted ? "progress-card complete" : application ? "progress-card current" : "progress-card"}>
          <span>{submitted ? "✓" : "3"}</span>
          <small>Paso 3</small>
          <strong>Subir documentos</strong>
          <p>INE, comprobante de domicilio y fotografías.</p>
        </article>
      </section>
    </main>
  );
}
