import mysql from "mysql2/promise";

const requiredTables = [
  "users",
  "client_profiles",
  "credit_options",
  "loan_applications",
  "client_documents",
  "loans",
  "loan_installments",
  "loan_payments",
  "loan_payment_allocations",
  "notifications",
  "client_payout_accounts",
  "payout_account_events",
];

const expectedOptions = new Map([
  ["1000-6", 244], ["1000-8", 193], ["1000-10", 163], ["1000-12", 141],
  ["1500-6", 356], ["1500-8", 281], ["1500-10", 234], ["1500-12", 203],
  ["2000-6", 470], ["2000-8", 368], ["2000-10", 307], ["2000-12", 264],
  ["2500-6", 580], ["2500-8", 456], ["2500-10", 380], ["2500-12", 326],
  ["3000-8", 543], ["3000-10", 451], ["3000-12", 386],
  ["3500-8", 631], ["3500-10", 526], ["3500-12", 449],
  ["4000-8", 718], ["4000-10", 596], ["4000-12", 511],
  ["4500-8", 806], ["4500-10", 671], ["4500-12", 573],
  ["5000-8", 893], ["5000-10", 742], ["5000-12", 634],
  ["5500-8", 988], ["5500-10", 817], ["5500-12", 700],
  ["6000-10", 893], ["6000-12", 763],
]);

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name} en el archivo .env.`);
  return value;
}

const issues = [];
const connection = await mysql.createConnection({
  host: requiredEnv("DB_HOST"),
  port: Number(process.env.DB_PORT || 3306),
  user: requiredEnv("DB_USER"),
  password: process.env.DB_PASSWORD || "",
  database: requiredEnv("DB_NAME"),
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  decimalNumbers: true,
  dateStrings: true,
});

try {
  const placeholders = requiredTables.map(() => "?").join(", ");
  const [tableRows] = await connection.execute(
    `SELECT TABLE_NAME AS table_name, TABLE_COLLATION AS table_collation
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME IN (${placeholders})`,
    [process.env.DB_NAME, ...requiredTables],
  );
  const foundTables = new Set(tableRows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !foundTables.has(table));

  if (missingTables.length) {
    issues.push(`Faltan tablas: ${missingTables.join(", ")}.`);
  }

  const collations = new Set(
    tableRows.map((row) => row.table_collation).filter(Boolean),
  );
  if (collations.size > 1) {
    issues.push(
      `Las tablas usan collations diferentes: ${[...collations].join(", ")}.`,
    );
  }

  if (foundTables.has("loan_applications")) {
    const requiredOfferColumns = [
      "flow_version",
      "offered_amount",
      "offered_term_fortnights",
      "offered_fortnight_payment",
      "offered_total_payment",
      "offered_by",
      "offered_at",
      "offer_accepted_at",
    ];
    const [columnRows] = await connection.execute(
      `SELECT COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'loan_applications'`,
      [process.env.DB_NAME],
    );
    const foundColumns = new Set(columnRows.map((row) => row.column_name));
    const missingColumns = requiredOfferColumns.filter(
      (column) => !foundColumns.has(column),
    );
    if (missingColumns.length) {
      issues.push(
        `Falta ejecutar migration-007-counteroffers.sql. Columnas ausentes: ${missingColumns.join(", ")}.`,
      );
    }

    const statusColumn = columnRows.find((row) => row.column_name === "status");
    if (!statusColumn?.column_type?.includes("oferta_pendiente")) {
      issues.push(
        "El estado oferta_pendiente no existe en loan_applications; ejecuta migration-007-counteroffers.sql.",
      );
    }
  }

  if (foundTables.has("client_payout_accounts")) {
    const [payoutColumns] = await connection.execute(
      `SELECT COLUMN_NAME AS column_name
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_payout_accounts'`,
      [process.env.DB_NAME],
    );
    const foundPayoutColumns = new Set(
      payoutColumns.map((row) => row.column_name),
    );
    const requiredPayoutColumns = [
      "card_ciphertext",
      "card_iv",
      "card_auth_tag",
      "card_last4",
    ];
    const missingPayoutColumns = requiredPayoutColumns.filter(
      (column) => !foundPayoutColumns.has(column),
    );
    if (missingPayoutColumns.length) {
      issues.push(
        `Falta ejecutar migration-009-card-and-optional-clabe.sql. Columnas ausentes: ${missingPayoutColumns.join(", ")}.`,
      );
    }
  }

  if (foundTables.has("credit_options")) {
    const [optionRows] = await connection.execute(
      `SELECT amount, term_fortnights, fortnight_payment, status
         FROM credit_options`,
    );
    const activeOptions = new Map(
      optionRows
        .filter((row) => row.status === "activo")
        .map((row) => [
          `${Number(row.amount)}-${Number(row.term_fortnights)}`,
          Number(row.fortnight_payment),
        ]),
    );

    for (const [key, expectedPayment] of expectedOptions) {
      if (activeOptions.get(key) !== expectedPayment) {
        issues.push(
          `Tarifario incorrecto en ${key}: esperado ${expectedPayment}, recibido ${activeOptions.get(key) ?? "faltante"}.`,
        );
      }
    }
    if (activeOptions.size !== expectedOptions.size) {
      issues.push(
        `Se esperaban 36 opciones activas y existen ${activeOptions.size}.`,
      );
    }
  }

  if (foundTables.has("loans") && foundTables.has("loan_installments")) {
    const [duplicateLoans] = await connection.execute(
      `SELECT user_id, COUNT(*) AS open_loans
         FROM loans
        WHERE status IN ('pendiente_desembolso', 'activo')
        GROUP BY user_id
       HAVING COUNT(*) > 1`,
    );
    if (duplicateLoans.length) {
      issues.push(
        `Hay ${duplicateLoans.length} clientes con más de un crédito abierto.`,
      );
    }

    const [inconsistentLoans] = await connection.execute(
      `SELECT l.uuid, l.status, l.term_fortnights, l.total_due,
              l.amount_paid, l.balance,
              COUNT(li.id) AS installment_count,
              COALESCE(SUM(li.amount_due), 0) AS scheduled_total
         FROM loans l
         LEFT JOIN loan_installments li ON li.loan_id = l.id
        WHERE l.status IN ('activo', 'liquidado')
        GROUP BY l.id, l.uuid, l.status, l.term_fortnights,
                 l.total_due, l.amount_paid, l.balance
       HAVING installment_count <> l.term_fortnights
           OR ABS(scheduled_total - l.total_due) > 0.01
           OR ABS(l.balance - (l.total_due - l.amount_paid)) > 0.01`,
    );
    if (inconsistentLoans.length) {
      issues.push(
        `Hay ${inconsistentLoans.length} créditos con calendario o saldo inconsistente: ${inconsistentLoans.map((row) => row.uuid).join(", ")}.`,
      );
    }
  }

  if (issues.length) {
    console.error("La revisión de la base encontró problemas:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Base correcta: ${requiredTables.length} tablas, 36 opciones, tarjeta/CLABE de depósito y cartera consistente.`,
    );
  }
} finally {
  await connection.end();
}
