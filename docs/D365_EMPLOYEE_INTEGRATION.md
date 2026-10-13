# D365 Employee Master Integration - Stage 1 (Mapping, Preview, DB Plan)

Status: **read-only analysis**. No HRMS data was modified and no D365 write was made.
Findings were produced against the live D365 environment (GET only) and the HRMS PostgreSQL database (SELECT only).

Regenerate the preview at any time (read-only):

```
cd backend
node scripts/d365ImportPreview.js --out <directory outside the repo>
```

## 1. Import preview (D365 EmployeesV2 -> HRMS `employees`)

| Item | Result |
|---|---|
| D365 EmployeesV2 rows | 896 |
| HRMS employees (demo, untouched) | 56 |
| Existing D365 mappings (`employee_d365_mapping`) | 0 |
| Proposed `create` | 892 |
| Proposed `needs-review` | 4 (personnel number appears in several employments) |
| HRMS `employee_id` equal to a D365 personnel number | 0 (no collisions with the demo employees) |
| Email already used by an HRMS employee | 0 |
| Employment state derived from dates | 896 active |

Nothing is imported in this stage. The 4 multi-employment rows need a human decision (one HRMS row per employment, or one per person).

## 2. Data-quality findings that change the plan

| Finding | Consequence |
|---|---|
| `ProfessionalTitle` is empty on all 896 rows | It cannot be the designation source. Validation shows there are no values to use. |
| `TitleId` is empty on all 896 EmployeesV2 rows and on all 842 `WorkerTitlesCurrent` rows. The `Titles` lookup has 204 entries. | Title lookup is also unusable for current workers. |
| `PositionWorkerAssignmentsV2` has 841 rows (PositionId, PersonnelNumber, IsPrimaryPosition, ValidFrom/ValidTo) | The only D365 source for designation/department is position assignment -> position -> department. Needs a follow-up read-only check of `PositionsV2`/`PositionDetails`/`DepartmentsV2` (35 departments). |
| `PrimaryContactEmail` filled on 1 of 896 | Email cannot be treated as an identifier. Imported rows get NULL email. |
| `PrimaryContactPhone` filled on 822, `OfficeLocation` on 840, `NationalityCountryRegion` on 0 | Phone is usable. Nationality is not. |
| `FirstName` 895, `LastName` 894 | A few rows only have `Name`. |

Recommendation: do not map designation in the first import. Leave it NULL (existing demo rows keep their values) until the position-assignment lookup is validated.

## 3. Field mapping

"Verified" means confirmed from live EmployeesV2 metadata and data. **No field has been write-tested**, so every D365-writable status below is "unverified" and the write path stays disabled.

| HRMS column | D365 field (EmployeesV2) | D365 -> HRMS | HRMS -> D365 | Rules / limitations |
|---|---|---|---|---|
| `employee_id` | `PersonnelNumber` | Yes, new rows only | Never | Key part, immutable. Existing HRMS IDs are never changed. |
| `legal_entity` | `EmploymentLegalEntityId` | Yes | Never | Key part. |
| (new) employment id | `EmploymentId` | Yes | Never | Key part. Stored in the mapping table. |
| `name` | `Name` | Yes | No (edit parts instead) | Composed by D365. NOT NULL in HRMS. |
| `first_name`, `middle_name`, `last_name` | `FirstName`, `MiddleName`, `LastName` | Yes | Unverified | Trim, max length to be read from metadata before enabling writes. |
| `title` | `PersonalTitle` | Yes | Unverified | |
| `designation`, `position_title` | none usable (see section 2) | No | No | Stays HRMS-local for now. |
| `department` | none on EmployeesV2 | No | No | Needs position -> department lookup. Stays HRMS-local for now. |
| `phone` | `PrimaryContactPhone` | Yes | Unverified | Validate phone format. The contact entity may be the correct write target. |
| `email` | `PrimaryContactEmail` | Yes | Unverified | Valid email, case-insensitive uniqueness. Only 1 of 896 populated. |
| `date_of_birth` | `BirthDate` | Yes | Unverified | DateTimeOffset -> date. Treat 1900-01-01 as unset. |
| `gender` | `Gender` (enum) | Yes | Unverified | Needs enum value map. |
| `marital_status` | `MaritalStatus` (enum) | Yes | Unverified | Needs enum value map. |
| `children_count` | `NumberOfDependents` | Not mapped yet | No | Meaning may differ. Verify first. |
| `nationality` | `NationalityCountryRegion` | No | No | Empty in D365. |
| `address` | `AddressStreet/City/State/ZipCode/...` | No | No | Free text vs structured. Read-only if ever added. |
| `joining_date` | `EmploymentStartDate` | Yes | No | Sentinel dates mean unset. |
| `status` | derived from `EmploymentEndDate` / `TerminationDate` | Yes (derived) | No | D365 has no status field. Termination is a D365 process. |
| `last_date_worked`, `employment_end_date` | `LastDateWorked`, `EmploymentEndDate` | Yes | No | Termination workflow. |
| `password`, `role`, `access_disabled`, `profile_photo`, `about`, documents, passport fields, `religion`, `emergency_contact`, `grade`, leave opening balance | none | No | No | HRMS-owned. Never read from or written to D365. |

Conflict rule: for D365-owned fields above, D365 wins on every sync. HRMS-owned fields are never overwritten.

## 4. Required database changes (proposed, additive only, not applied)

Proposed migration `017_d365_employee_master.sql`:

1. Extend `employee_d365_mapping` (currently: `id, employee_id, personnel_number, employment_legal_entity_id, employment_id, created_at, updated_at`; 0 rows):
   - `UNIQUE (personnel_number, employment_legal_entity_id, employment_id)` and `UNIQUE (employee_id)`.
   - `last_synced_at timestamptz`, `source_hash text`, `d365_etag text`, `link_status text` (`linked`, `pending_review`).
   - Keep the existing foreign key to `employees(employee_id)` (`ON DELETE CASCADE`). Consider `RESTRICT` so a stray delete cannot drop a link silently.
2. New `d365_sync_runs` (`id, started_at, finished_at, trigger, status, rows_read, rows_created, rows_updated, rows_skipped, rows_failed, error_stage`). Counts only, no personal data.
3. New `d365_sync_audit` (`id, at, actor_employee_id, action, personnel_number, fields_changed text[], outcome`). Field names only, no values.
4. No changes to `employees`, `attendance`, `leaves` or `employee_payroll` columns in this migration.

Constraints found that affect imported rows:
- `employees.employee_id` and `name` are NOT NULL. `email` is unique but nullable, so multiple NULL emails are fine. `annual_leave_opening_days` is NOT NULL with default 0.
- `employees.password` is nullable. **The current `/api/login` calls `bcrypt.compare(password, employee.password)` with no null check**, so an imported row without a password would cause a 500 on login. Stage 2 must add a guard so a NULL password gives a normal "invalid credentials" response. Imported D365 employees will have no login until HR sets a password.
- 25 foreign keys reference `employees`. Sync never deletes or renumbers.

Rollback for the migration: it is additive. Drop `d365_sync_runs` and `d365_sync_audit`, and drop the added columns and constraints. Take a `pg_dump` of `employees` and `employee_d365_mapping` before any import.

## 5. Findings for later stages

- Authentication: `/api/login` returns the full employee row including the password hash and issues no token. The `x-employee-id` header used by `withHR` can be spoofed. Stage 2 adds signed tokens, stops returning `password`, and enforces HR role on employee-master writes.
- Attendance stays in PostgreSQL. Leave (`LeaveRequests`, `LeaveBalances` exist in D365) and payroll are separate integrations and out of scope.

## 6. Stage plan

| Stage | Content | Writes data? |
|---|---|---|
| 1 (this) | Mapping, preview script, DB plan | No |
| 2 | Migration 017, login null-password guard, token auth + HR middleware | Schema only |
| 3 | Read-only linking UI/API: review the 4 multi-employment rows, approve identity mapping | Mapping rows only |
| 4 | D365 -> HRMS sync (on demand + scheduled) for approved links, then bulk import after approval | Yes, after approval |
| 5 | Write-capability probe: confirm permissions and a nominated test record, then enable per-field write-through | D365 write, after approval |

## Stage 2: token auth and migration 017 (implemented)

- Login (POST /api/login) returns `{message, employee (no password), token}`. Tokens are HMAC-signed (`AUTH_TOKEN_SECRET`, 8h TTL) and re-checked against the DB on every request (exists, role, not access_disabled). Accounts with a NULL password get the normal 401.
- HR only: `POST /api/employees`, `PATCH .../status`, `DELETE /api/employees/:id`, `POST .../reset-password`, `PUT /api/hr/employee-requests/:id`.
- HR or the employee on their own record: `PUT /api/employees/:id` (employees cannot change master fields; `employee_id` can never change), about, education, experience, bank, family, project, change-password.
- Still on the old `x-employee-id` convention (later stage): assistant, recruitment, tickets, resignations, careers, documents routers, and GET reads.
- Migration `017_d365_employee_master.sql` (additive, applied): new columns on `employee_d365_mapping` and tables `d365_sync_runs` / `d365_sync_audit`. Rollback SQL is in the file header. No employee rows imported; the 4 multi-employment records stay pending review.
- Set `AUTH_TOKEN_SECRET` in `backend/.env` for production; otherwise a random secret is generated per start and everyone must log in again after a restart.
- Rollback of code: restore from the Stage 2 backup copy or `git checkout` the changed files; sessions without a token are signed out automatically.
- Tests: `npm run test:employee-auth`.

## Stage 4A: read-only import dry run (no import performed)

- Script: `backend/scripts/d365EmployeeImport.js` (`node scripts/d365EmployeeImport.js [--backup-manifest <file>] [--out <dir>]`). It has no apply mode, runs PostgreSQL work in `BEGIN READ ONLY` and sends only D365 GET requests.
- The import stays **BLOCKED - BACKUP NOT VERIFIED** until a manifest for a full backup (Supabase snapshot or `pg_dump`, under 24h old, row counts matching live) is supplied.
- Result at the time of writing: 896 D365 rows, 892 proposed inserts, 4 excluded (personnel numbers 1610 and 2866), 56 HRMS employees, 0 mappings, 0 ID collisions. Imported accounts: `password` NULL, `role` employee.
