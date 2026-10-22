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

## Separate employee portal credentials

Apply `backend/migrations/018_separate_employee_login_identities.sql` before starting the updated API. HR credentials remain in the existing HR account (`employees.password`); employee portal credentials are stored independently in `employee_logins` and map to the existing `employees.employee_id`. The employee login's normalized username is unique, and the table stores only a bcrypt hash, enabled state, credential version, and optional provision-run ID. Employee credentials must never be copied into or used to update the HR password field.

The API accepts legacy HR employee IDs for HR sign-in and only accepts employee usernames from `employee_logins`. Employee role and employee ID come from the authenticated identity; HR-only endpoints reject employee tokens, while employee records and self-service actions are restricted to the authenticated employee. Password changes increment the relevant account's credential version, invalidating existing tokens. Employee accounts are provisioned separately; applying the migration does not create credentials or perform a provisioning run.

Employee usernames and initial passwords use `EMP<PersonnelNumber>` (leading zeros preserved). `buildInitialEmployeeCredential` produces a newly salted bcrypt hash without returning the initial password separately; it does not insert accounts. This predictable format remains a production account-guessing risk. The employee identity for `EMP3391` references the same employee master record as HR `3391`, but never reads or updates the HR password. Linked D365 mappings must uniquely match the identity at login and on every authenticated request. Existing employee master passwords do not bypass the separate login table.

The API gate defaults to HR-only outside an explicit employee self-service allowlist. Employee sessions cannot access HR payroll lists, approvals, settings, shared workflow notification inboxes, or recruitment administration. Employee notifications use the own-record endpoint. HR password resets must explicitly select `identity_type: "hr"`; the default resets only an existing employee login and never falls back to HR. Recovery OTPs and signed reset grants are scoped to the credential type. Legacy sessions must sign in again after deployment. Migration 018 has not been applied or database-validated by the mock tests; verify it first in a disposable database with the existing schema, never through the current application environment.

Run the mock-only authentication and account-separation tests with `cd backend && npm run test:auth`. These tests do not import the database module or connect to a database.
