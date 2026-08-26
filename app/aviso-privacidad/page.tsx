export const metadata = { title: "Aviso de privacidad" };

export default function PrivacyNoticePage() {
  const responsible = process.env.LENDER_LEGAL_NAME || "RESPONSABLE POR CONFIGURAR";
  const address =
    process.env.PRIVACY_RESPONSIBLE_ADDRESS || "DOMICILIO DEL RESPONSABLE POR CONFIGURAR";
  const email = process.env.PRIVACY_CONTACT_EMAIL || "CORREO DE PRIVACIDAD POR CONFIGURAR";
  const version = process.env.PRIVACY_NOTICE_VERSION || "2026-08";
  const configurationIncomplete =
    responsible.includes("CONFIGURAR") ||
    responsible.startsWith("CAMBIA_") ||
    address.includes("CONFIGURAR") ||
    address.startsWith("CAMBIA_");

  return (
    <main className="legal-page">
      <article className="legal-document">
        <p className="eyebrow">Versión {version}</p>
        <h1>Aviso de privacidad integral</h1>

        {configurationIncomplete ? (
          <div className="alert alert-error">
            Este aviso todavía tiene datos del responsable pendientes. Configura las
            variables de entorno antes de recibir solicitudes reales.
          </div>
        ) : null}

        <h2>Responsable</h2>
        <p>
          <strong>{responsible}</strong>, con domicilio en {address}, es responsable
          del tratamiento y protección de los datos personales recabados mediante
          esta plataforma.
        </p>

        <h2>Datos que recabamos</h2>
        <p>
          Datos de identificación y contacto; fecha de nacimiento; domicilio;
          información patrimonial y crediticia; imágenes de la credencial para votar;
          comprobante de domicilio; fotografía facial; firma electrónica simple;
          información técnica de la sesión y documentos relacionados con la solicitud.
        </p>

        <h2>Finalidades</h2>
        <p>
          Crear y administrar la cuenta; verificar identidad y domicilio; evaluar la
          solicitud de crédito; prevenir fraude; elaborar, conservar y administrar la
          documentación contractual; informar el resultado; atender obligaciones
          legales y ejercer o defender derechos derivados de la relación jurídica.
        </p>

        <h2>Consentimientos</h2>
        <p>
          La información financiera, patrimonial y la fotografía facial requieren
          consentimiento expreso. La plataforma solicita dicho consentimiento antes
          de cargar los documentos y conserva evidencia de la aceptación.
        </p>

        <h2>Almacenamiento y transferencias</h2>
        <p>
          Los documentos se almacenan mediante proveedores tecnológicos con acceso
          privado y se limitan a personal autorizado. Podrán comunicarse a autoridades
          cuando exista una obligación jurídica y a proveedores encargados del
          tratamiento bajo obligaciones de confidencialidad y seguridad.
        </p>

        <h2>Derechos ARCO</h2>
        <p>
          Puedes solicitar acceso, rectificación, cancelación u oposición, así como
          revocar el consentimiento cuando legalmente proceda, escribiendo a
          <strong> {email}</strong>. La solicitud deberá permitir acreditar tu identidad
          e identificar los datos y el derecho que deseas ejercer.
        </p>

        <h2>Conservación y seguridad</h2>
        <p>
          Los datos se conservarán durante el tiempo necesario para las finalidades
          informadas y los plazos legales aplicables. Se aplican controles técnicos,
          administrativos y físicos para reducir riesgos de pérdida, alteración o
          acceso no autorizado.
        </p>

        <p className="legal-review-note">
          Plantilla técnica: debe ser revisada y completada por el responsable legal
          antes de operar con clientes reales.
        </p>
      </article>
    </main>
  );
}
