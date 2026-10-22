# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## D365 Attendance employee selection

Configure these variables in the backend runtime environment (never in the frontend):

- `D365_BASE_URL`: the HTTPS root URL of the Dynamics 365 environment.
- `D365_TENANT_ID`: the Microsoft Entra tenant ID or domain.
- `D365_CLIENT_ID`: the registered application's client ID.
- `D365_CLIENT_SECRET`: the registered application's secret.

The Attendance employee endpoint reads `EmployeesV2` with server-side credentials, follows OData pagination (cached for 5 minutes), and returns every D365 employee de-duplicated by personnel number, legal entity and employment ID. Punches for D365 employees are stored in the existing PostgreSQL `attendance` table with that identity and a null `employee_id`; the legacy `{ employee_id }` punch request still works for existing HRMS employees.

### Local configuration

`backend/.env` is git-ignored and is **not** present in a fresh clone — the backend starts without it but the employee endpoint returns HTTP 500 with `stage: "config"`. Copy the template and fill in real values locally (never commit them, never paste them into chat):

```bash
cp backend/.env.example backend/.env   # then edit backend/.env
cd backend && npm start                # serves /api on PORT 5000 by default
```

`backend/.env` is loaded by `backend/db.js` via dotenv, so it applies to `npm start`, all `npm run test:*` scripts, and the `scripts/d365*.js` tools. Values can also be supplied as real environment variables instead of the file.

Set `D365_BASE_URL` to the environment **root** URL only (HTTPS, no path, no trailing query), e.g. the URL you see in the browser. The service appends `/data/EmployeesV2`. A value containing a path is rejected by design.

Verify the endpoint locally (start with an unset value to confirm the config error, then re-run after configuring):

```bash
curl "http://localhost:5000/api/d365/employees?view=attendance"   # JSON array of D365 employees
```

### One-time Microsoft/Entra admin setup (required before the above can succeed)

This is an app-only (client credentials) flow, so it needs setup by an **Azure/Microsoft 365 administrator** in two places — the code cannot do either:

1. **Microsoft Entra ID app registration** (Azure Portal → Microsoft Entra ID → App registrations → New registration, single tenant):
   - Create a client secret under *Certificates & secrets* and copy its **Value** immediately (not the Secret ID) → `D365_CLIENT_SECRET`.
   - Copy *Application (client) ID* → `D365_CLIENT_ID` and *Directory (tenant) ID* → `D365_TENANT_ID`.
   - Under *API permissions* → Add a permission → **Dynamics ERP**, select **user_impersonation**, then click **Grant admin consent** for the tenant. Without admin consent the token request fails.
2. **Register the app inside D365 Finance & Operations**: System administration → Setup → **Microsoft Entra ID applications** → New. Enter the same Client ID, a name, and a **User ID** mapping to a D365 user (preferably a dedicated integration/service account, not a personal one) with security access to the employee data being read.

The token is requested from `https://login.microsoftonline.com/{D365_TENANT_ID}/oauth2/v2.0/token` with scope `{D365_BASE_URL}/.default`. Note that the D365 URL must be a Finance & Operations environment (`*.dynamics.com`), not a Dataverse/CRM (`*.crm.dynamics.com`) tenant.

The endpoint reports which stage failed, which distinguishes a credentials problem from a code problem:

| `stage` in the response | Meaning | Retryable by the user? |
|---|---|---|
| `config` | A `D365_*` variable is missing/malformed — server-side config | No, needs env config |
| `authentication` | Entra rejected the client credentials (admin consent, expired secret, wrong tenant) | No, needs admin action |
| `employees` | Authenticated, but D365 returned an error for `EmployeesV2` | Maybe |
| `server` | Unexpected server error | Maybe |

