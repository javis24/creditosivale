# Crédito Sí Vale — administración de préstamos

Primera fase de una aplicación de administración de clientes para préstamos personales. Incluye autenticación segura, permisos por rol y expedientes personales de clientes.

## Incluido en esta entrega

- Next.js 16 con App Router y TypeScript.
- MySQL/MariaDB, administrable desde phpMyAdmin.
- Sesión JWT en cookie `httpOnly`, `secure` en producción y con duración de 8 horas.
- Contraseñas protegidas con bcrypt (12 rondas).
- Bloqueo temporal de 15 minutos después de 5 intentos fallidos.
- Roles `admin`, `gerencia`, `vendedor` y `cliente`.
- API para login, logout, sesión actual, listado y creación de usuarios.
- Transacción al crear un cliente: cuenta y expediente se guardan juntos.
- Formulario de datos personales, contacto, actividad económica, domicilio y contacto de emergencia.
- Panel responsive para escritorio y celular.

> phpMyAdmin no es la base de datos: es la herramienta desde la que administrarás MySQL o MariaDB.

## 1. Requisitos

- Node.js 20.9 o superior.
- Una base MySQL 8 o MariaDB 10.5 o superior.
- Acceso a phpMyAdmin.

## 2. Instalación local

```bash
npm install
```

En Windows CMD:

```bat
copy .env.example .env.local
```

En PowerShell, macOS o Linux:

```bash
cp .env.example .env.local
```

Edita `.env.local` con los datos reales de tu base. Genera `AUTH_SECRET` con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Ejemplo local:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=creditosivale
DB_USER=root
DB_PASSWORD=tu_password
DB_SSL=false
AUTH_SECRET=pega_aqui_el_valor_generado
NEXT_PUBLIC_APP_NAME=Crédito Sí Vale
```

## 3. Crear las tablas desde phpMyAdmin

1. Crea o selecciona la base de datos.
2. Abre la pestaña **Importar**.
3. Selecciona `database/schema.sql`.
4. Ejecuta la importación.

El archivo no crea ni selecciona una base por nombre, por lo que funciona también con los nombres automáticos que asigna Hostinger.

## 4. Crear el primer administrador

Después de importar las tablas ejecuta:

```bash
npm run db:create-admin
```

El script solicitará nombre, correo y contraseña. Esa será la cuenta para entrar por primera vez.

## 5. Ejecutar

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Para probar la conexión de la base abre [http://localhost:3000/api/health](http://localhost:3000/api/health).

## APIs disponibles

| Método | Ruta | Acceso | Uso |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Público | Iniciar sesión |
| `POST` | `/api/auth/logout` | Con sesión | Cerrar sesión |
| `GET` | `/api/auth/me` | Con sesión | Consultar usuario actual |
| `GET` | `/api/health` | Público | Comprobar conexión MySQL |
| `GET` | `/api/users` | Personal | Listar y buscar usuarios |
| `POST` | `/api/users` | Personal | Crear cliente o usuario |
| `GET` | `/api/users/:uuid` | Personal o propietario | Consultar expediente |

`gerencia` y `vendedor` pueden crear clientes. Únicamente `admin` puede crear cuentas de personal.

## Datos para crear un cliente

El formulario ya envía el objeto completo. Ejemplo para probar `POST /api/users` desde un cliente HTTP con una sesión activa:

```json
{
  "role": "cliente",
  "firstName": "María",
  "paternalLastName": "López",
  "maternalLastName": "García",
  "email": "maria@example.com",
  "phone": "8711234567",
  "password": "Temporal1",
  "birthDate": "1992-05-18",
  "curp": "",
  "rfc": "",
  "ineNumber": "",
  "gender": "mujer",
  "maritalStatus": "soltero",
  "occupation": "Comerciante",
  "companyName": "Abarrotes María",
  "monthlyIncome": 15000,
  "street": "Av. Hidalgo",
  "exteriorNumber": "120",
  "interiorNumber": "",
  "neighborhood": "Centro",
  "postalCode": "35000",
  "city": "Gómez Palacio",
  "state": "Durango",
  "country": "México",
  "emergencyContactName": "José López",
  "emergencyContactPhone": "8717654321",
  "notes": ""
}
```

## Subir a GitHub

Crea un repositorio vacío en GitHub y ejecuta dentro de esta carpeta:

```bash
git init
git add .
git commit -m "feat: primera fase de clientes y autenticación"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

`.env.local` está excluido y nunca debe subirse a GitHub.

## Desplegar en Vercel

1. Importa el repositorio de GitHub en Vercel.
2. En **Settings → Environment Variables** registra `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `AUTH_SECRET` y `NEXT_PUBLIC_APP_NAME`.
3. Confirma en tu proveedor MySQL que acepta conexiones remotas desde Vercel.
4. Despliega y abre `/api/health` para validar la conexión.

Si la base está en Hostinger, utiliza el host MySQL remoto que muestra su panel; no uses `localhost` en Vercel. Algunos planes restringen las conexiones remotas o exigen autorizar el origen.

## Siguiente fase recomendada

La estructura está preparada para agregar tablas y módulos de préstamos, calendario quincenal (días 15 y 30), documentos, pagos, recibos y recordatorios por WhatsApp.
