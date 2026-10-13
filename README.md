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
