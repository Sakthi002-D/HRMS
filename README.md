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

## Separate employee portal credentials

Apply `backend/migrations/018_separate_employee_login_identities.sql` before starting the updated API. HR credentials remain in the existing HR account (`employees.password`); employee portal credentials are stored independently in `employee_logins` and map to the existing `employees.employee_id`. The employee login's normalized username is unique, and the table stores only a bcrypt hash, enabled state, credential version, and optional provision-run ID. Employee credentials must never be copied into or used to update the HR password field.

The API accepts legacy HR employee IDs for HR sign-in and only accepts employee usernames from `employee_logins`. Employee role and employee ID come from the authenticated identity; HR-only endpoints reject employee tokens, while employee records and self-service actions are restricted to the authenticated employee. Password changes increment the relevant account's credential version, invalidating existing tokens. Employee accounts are provisioned separately; applying the migration does not create credentials or perform a provisioning run.

Employee usernames use `EMP<PersonnelNumber>` (leading zeros preserved). `buildInitialEmployeeCredential` hashes an undisclosed cryptographically random bootstrap secret with bcrypt cost 10; it returns only identity fields and the hash, not the secret. The username is never the initial password. The employee identity for `EMP3391` references the same employee master record as HR `3391`, but never reads or updates the HR password. Linked D365 mappings must uniquely match the identity at login and on every authenticated request. Existing employee master passwords do not bypass the separate login table.

The API gate defaults to HR-only outside an explicit employee self-service allowlist. Employee sessions cannot access HR payroll lists, approvals, settings, shared workflow notification inboxes, or recruitment administration. Employee notifications use the own-record endpoint. HR password resets must explicitly select `identity_type: "hr"`; the default resets only an existing employee login and never falls back to HR. Recovery OTPs and signed reset grants are scoped to the credential type. Legacy sessions must sign in again after deployment. Migration 018 has not been applied or database-validated by the mock tests; verify it first in a disposable database with the existing schema, never through the current application environment.

Run the mock-only authentication and account-separation tests with `cd backend && npm run test:auth`. These tests do not import the database module or connect to a database.

## Read-only D365 reconciliation

The existing `backend/scripts/d365EmployeeImport.js`, `d365LinkPreview.js` and `d365ImportPreview.js` share `d365Reconciliation.js`. They fetch every EmployeesV2 page or fail closed on a page limit, cycle, failed request, malformed response or unexpected pagination target. Database reads use one repeatable-read, read-only transaction ending in rollback. They have no apply mode. Do not run these environment-configured entry points against production without separately approved access.

The shared manifest classifies composite D365 identities (Personnel Number, legal entity, employment ID) as `already-mapped`, `confirmed-link`, `new-record`, `ambiguous` or `excluded`. `confirmed-link` means a unique, nonconflicting personnel-number/email candidate, not permission to write a mapping: human identity approval is still required. Duplicate/incomplete identities, multi-employment, conflicting or pending mappings, shared emails and weak-only name/phone signals never authorize new records or links. Review numbers 1610/2866 remain excluded. Existing IDs, HR role/passwords (including 3391), attendance/payroll and all relationships remain untouched; unmatched legacy employees are retained.

With `--out <private-directory>`, each preview can write `d365-reconciliation.json` containing only identity keys, proposed classifications, reasons and retained employee IDs. Treat identifiers as sensitive and keep these outputs outside Git. Existing detailed CSV outputs may contain personal data. The backup manifest's age/count checks do not prove restoreability; a tested backup and an approved production-specific writer are separate prerequisites.

Run `npm --prefix backend run test:d365-reconciliation` for mock-only pagination and pure reconciliation tests. These import neither application database configuration nor environment secrets and make no network/database connections. Counts such as 896 source rows and 890 local accounts are not production targets.

HR sign-in is checked before employee credentials and remains available before migration 018 is installed. HR login/session reads treat an absent `auth_credential_version` column as version 0 using a row-to-JSON projection; an installed column remains authoritative for session revocation. Missing employee schema produces an explicit HTTP 503, never a fallback to an employee master password or HR privileges. Password changes/recovery still require the migration; this compatibility path is not a substitute for completing the schema rollout.

Use the already committed `018_separate_employee_login_identities.sql` by full filename. The separate local-workspace `018_employee_first_login_password_change.sql` adds only `force_password_change`; it neither replaces nor conflicts with the identity schema, and must not be overwritten. There is no numeric migration runner in the backend start command. Validate existing `public.employees` (unique `employee_id`, compatible with TEXT), `public.password_resets`, and `public.employee_d365_mapping` (employee/personnel identity and `link_status`) before applying the identity migration in a transaction. Migration 003 creates password resets; migration 017 adds mapping link status but assumes the base mapping table already exists. The repository does not define the original employee/mapping tables, so live-schema compatibility cannot be certified from these migrations alone. Migration 018 does not create employee logins or change existing HR password/role values; it adds schema only. `IF NOT EXISTS` does not repair incompatible pre-existing columns/tables.

## Staging D365 employee logins

The separate `backend/scripts/d365EmployeeProvision.js` command never imports employees, changes HR credentials/history, or enables access. It defaults to a read-only transaction and rollback. Run it only against an explicitly approved database; do not run the environment-configured command against production as a test.

Supply `--identities <private-approved.json>` containing an array of exact approved composite identities:

```json
[
  {
    "employee_id": "0007",
    "personnel_number": "0007",
    "employment_legal_entity_id": "SHLT",
    "employment_id": "approved-employment-id"
  }
]
```

All identifiers must be strings. The command rejects duplicates, missing/conflicting mappings and conflicting existing logins. It reuses the authentication mapping predicate, requires one complete linked mapping with an employee-role target, and excludes all employments for personnel numbers 1610/2866 (the four review source rows). Matching existing logins are left entirely unchanged. Inactive/access-blocked employees may be staged, but every inserted login is disabled; status and access blocks are never changed.

From `backend`, preview with `node scripts\d365EmployeeProvision.js --identities <private-approved.json>`. Apply additionally requires `--apply --backup-manifest <verified.json> --run-id <unique-run-id> --operator <operator>`. The manifest uses the existing full-backup contract and additionally requires a matching integer `row_counts.employee_logins`. Use a fresh, genuinely independently restore-verified post-import full backup. Manifest checks do not prove restoreability.

Apply validates under a serializable transaction and locks employees, mappings and logins against concurrent writers. Inserts rely on migration 018's unchanged constraints; any conflict/error rolls back the entire batch. Capture the JSON command output in a private audit system: it includes run ID, operator, backup ID, timestamp, identities and outcomes, never credentials. Each inserted login also persists its run ID. There is no automatic retry or conflict overwrite.

Run `npm --prefix backend run test:d365-provision` for mock-only provisioning, recovery and HR regression tests; these never import database configuration. Tests are not isolated-PostgreSQL end-to-end certification.

Before rollout: validate migration/schema and concurrent transactions in a disposable restored database; approve exact imported identities; verify employees/mappings after import (56 + 892 = 948 employees and 892 mappings only if the baseline remains unchanged); then preview and stage logins with a new backup. Separately approve active employees and verified, individually controlled delivery email addresses before enabling their login and clearing any approved access block. Do not enable inactive employees or automatically clear administrative blocks.

After that approval, employees use the existing forgot-password/OTP/reset flow to choose their own password, then sign in normally. Disabled, inactive, access-blocked and unlinked accounts cannot recover; recovery never activates an account. OTPs use cryptographic randomness; verification uses a conditional state transition; reset completion revalidates eligibility and atomically changes the credential and consumes recovery records. Existing HR recovery remains identity-scoped. Before production onboarding, validate mail delivery, OTP issuance/verification rate limiting at the application/gateway, password policy and replay/concurrency behavior in the isolated environment. No automatic invitation sending or account activation is included.

## Bootstrap login activation (interim onboarding)

`backend/scripts/d365EmployeeActivateLogins.js` (preview by default, `--apply` to write) enables every provisioned, still-disabled login whose employee is Active and linked, sets its password to the username (`EMP<PersonnelNumber>`), keeps `must_change_password = TRUE` (migration 019), and clears `access_disabled` for exactly those employees. This predictable bootstrap password is an account-guessing risk: treat it as a time-boxed onboarding shortcut, require employees to change it immediately, and prefer the forgot-password/OTP flow once delivery email addresses are verified.

## Two-way employee sync (HRMS <-> D365)

`backend/services/d365EmployeeSync.js` syncs linked employees only (one exact `employee_d365_mapping` row, employee role).

* Pull (D365 -> HRMS): `POST /api/d365/sync` (HR-only) and a scheduler started with the server (`D365_SYNC_INTERVAL_MINUTES`, default 30) fetch EmployeesV2 and update changed overlapping fields (name, email, phone, gender, marital status, birth/joining/end/last-worked dates, Active/Inactive status). Empty D365 values never erase HRMS data; email collisions are skipped and reported; credentials, role and access_disabled are never touched.
* Push (HRMS -> D365): after `PUT /api/employees/:employeeId`, the safe writable subset (Gender, MaritalStatus, BirthDate) is PATCHed to the linked EmployeesV2 employment (composite key PersonnelNumber/EmploymentLegalEntityId/EmploymentId, `cross-company=true`). Push is best-effort, logged, and never blocks or fails the HRMS update. Contact details and names are owned by other D365 entities and are not pushed.

Run `node --test backend/services/d365EmployeeSync.test.js` for the mapping/diff unit tests. The D365 dev environment cold-starts slowly; D365 HTTP calls use a 300s timeout.
