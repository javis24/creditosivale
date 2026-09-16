const baseUrl = (process.env.TEST_BASE_URL || "https://www.creditosivale.com").replace(/\/$/, "");

const checks = [
  { name: "inicio de sesión", path: "/login", status: 200, contains: "Iniciar sesión" },
  { name: "registro", path: "/registro", status: 200, contains: "Crear cuenta" },
  { name: "aviso de privacidad", path: "/aviso-privacidad", status: 200, contains: "Aviso de privacidad" },
  {
    name: "base de datos",
    path: "/api/health",
    status: 200,
    json: (body) => body.ok === true && body.database === "connected",
  },
  {
    name: "sesión protegida",
    path: "/api/auth/me",
    status: 401,
    json: (body) => body.code === "UNAUTHORIZED",
  },
  {
    name: "solicitudes del cliente protegidas",
    path: "/api/loan-applications",
    status: 401,
    json: (body) => body.code === "UNAUTHORIZED",
  },
  {
    name: "datos bancarios protegidos",
    path: "/api/client/payout-account",
    status: 401,
    json: (body) => body.code === "UNAUTHORIZED",
  },
  {
    name: "solicitudes del administrador protegidas",
    path: "/api/admin/loan-applications",
    status: 401,
    json: (body) => body.code === "UNAUTHORIZED",
  },
  {
    name: "cartera del administrador protegida",
    path: "/api/admin/loans",
    status: 401,
    json: (body) => body.code === "UNAUTHORIZED",
  },
];

let failures = 0;

console.log(`Revisando ${baseUrl}\n`);

for (const check of checks) {
  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      headers: { "User-Agent": "creditosivale-smoke-test/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let passed = response.status === check.status;
    let detail = `HTTP ${response.status}`;

    if (passed && check.contains) {
      passed = text.toLocaleLowerCase("es-MX").includes(
        check.contains.toLocaleLowerCase("es-MX"),
      );
      if (!passed) detail += `; falta el texto “${check.contains}”`;
    }

    if (passed && check.json) {
      try {
        passed = check.json(JSON.parse(text));
        if (!passed) detail += "; respuesta JSON inesperada";
      } catch {
        passed = false;
        detail += "; la respuesta no es JSON";
      }
    }

    if (check.path === "/login" && passed) {
      const requiredHeaders = [
        "x-content-type-options",
        "x-frame-options",
        "referrer-policy",
      ];
      const missingHeaders = requiredHeaders.filter(
        (header) => !response.headers.get(header),
      );
      if (missingHeaders.length) {
        passed = false;
        detail += `; faltan encabezados ${missingHeaders.join(", ")}`;
      }
    }

    if (passed) console.log(`✓ ${check.name}: ${detail}`);
    else {
      failures += 1;
      console.error(`✗ ${check.name}: ${detail}; se esperaba HTTP ${check.status}`);
    }
  } catch (error) {
    failures += 1;
    console.error(
      `✗ ${check.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (failures) {
  console.error(`\nFallaron ${failures} de ${checks.length} verificaciones.`);
  process.exitCode = 1;
} else {
  console.log(`\nTodo bien: ${checks.length} verificaciones pasaron.`);
}
