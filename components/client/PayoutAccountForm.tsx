"use client";

import { FormEvent, useEffect, useState } from "react";

type PayoutAccount = {
  bankName: string;
  accountHolder: string;
  maskedCardNumber: string | null;
  cardLast4: string | null;
  maskedClabe: string | null;
  clabeLast4: string | null;
  updatedAt?: string;
};

export default function PayoutAccountForm() {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [clabe, setClabe] = useState("");
  const [ownershipConsent, setOwnershipConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadAccount() {
      try {
        const response = await fetch("/api/client/payout-account", {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "No se pudo consultar la cuenta.");
        }
        setAccount(result.account);
        if (result.account) {
          setBankName(result.account.bankName);
          setAccountHolder(result.account.accountHolder);
        }
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudo consultar la cuenta.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadAccount();
    return () => controller.abort();
  }, []);

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/client/payout-account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankName,
          accountHolder,
          cardNumber,
          clabe,
          ownershipConsent,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "No se pudo guardar la cuenta.");
      }

      setAccount(result.account);
      setCardNumber("");
      setClabe("");
      setOwnershipConsent(false);
      setMessage(result.message);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo guardar la cuenta.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel payout-account-panel">
      <div className="payout-account-copy">
        <p className="eyebrow">Cuenta para recibir el crédito</p>
        <h2>Datos para el depósito</h2>
        <p className="muted">
          Registra una tarjeta de débito de 16 dígitos a tu nombre. También
          puedes agregar tu CLABE interbancaria si la tienes disponible.
        </p>
        <p className="payout-security-note">
          Solamente pediremos el número frontal de la tarjeta. Nunca escribas
          NIP, CVV ni fecha de vencimiento.
        </p>

        {account ? (
          <div className="payout-current-account">
            <span>Cuenta registrada</span>
            <strong>{account.bankName}</strong>
            <span>{account.accountHolder}</span>
            <code>
              {account.maskedCardNumber || "Tarjeta pendiente de registrar"}
            </code>
            {account.maskedClabe ? <code>CLABE: {account.maskedClabe}</code> : null}
          </div>
        ) : null}
      </div>

      <form className="payout-account-form" onSubmit={saveAccount}>
        {error ? <div className="alert alert-error">{error}</div> : null}
        {message ? <div className="alert alert-success">{message}</div> : null}

        <label className="field">
          <span>Banco</span>
          <input
            value={bankName}
            onChange={(event) => setBankName(event.target.value)}
            placeholder="Ej. BBVA, Banorte, Santander"
            maxLength={120}
            autoComplete="organization"
            disabled={loading || saving}
            required
          />
        </label>

        <label className="field">
          <span>Nombre completo del titular</span>
          <input
            value={accountHolder}
            onChange={(event) => setAccountHolder(event.target.value)}
            placeholder="Como aparece en la cuenta bancaria"
            maxLength={190}
            autoComplete="name"
            disabled={loading || saving}
            required
          />
        </label>

        <label className="field">
          <span>
            {account?.maskedCardNumber
              ? "Número de tarjeta para reemplazar la actual"
              : "Número de tarjeta de débito"}
          </span>
          <input
            value={cardNumber}
            onChange={(event) =>
              setCardNumber(event.target.value.replace(/\D/g, ""))
            }
            placeholder="16 dígitos del frente de la tarjeta"
            inputMode="numeric"
            autoComplete="off"
            minLength={16}
            maxLength={16}
            pattern="[0-9]{16}"
            disabled={loading || saving}
            required
          />
        </label>

        <label className="field">
          <span>
            CLABE interbancaria (opcional)
            {account?.maskedClabe ? " · déjala vacía para conservar la actual" : ""}
          </span>
          <input
            value={clabe}
            onChange={(event) => setClabe(event.target.value.replace(/\D/g, ""))}
            placeholder="18 dígitos"
            inputMode="numeric"
            autoComplete="off"
            maxLength={18}
            pattern="[0-9]{18}|^$"
            disabled={loading || saving}
          />
        </label>

        <label className="payout-consent">
          <input
            type="checkbox"
            checked={ownershipConsent}
            onChange={(event) => setOwnershipConsent(event.target.checked)}
            disabled={loading || saving}
            required
          />
          <span>
            Confirmo que la tarjeta y, en su caso, la CLABE pertenecen a una
            cuenta a mi nombre y autorizo usarlas para depositar mi crédito.
          </span>
        </label>

        <button
          className="button button-primary"
          type="submit"
          disabled={
            loading ||
            saving ||
            cardNumber.length !== 16 ||
            (clabe.length !== 0 && clabe.length !== 18) ||
            !ownershipConsent
          }
        >
          {saving ? "Guardando…" : account ? "Actualizar cuenta" : "Guardar cuenta"}
        </button>
      </form>
    </section>
  );
}
