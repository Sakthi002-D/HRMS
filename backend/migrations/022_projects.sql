-- Projects: a project master and which employees work on each project, for which period.
-- Run manually BEFORE restarting the backend. Safe to run more than once.
--
-- The existing employee_projects table (the free-form "Projects" section in Edit Info) is not
-- touched; assignments live in project_assignments.

BEGIN;

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    client TEXT,
    start_date DATE,
    end_date DATE,
    -- Free text, like the existing Projects section (e.g. Active, Completed, On Hold)
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- assigned_from is required: with NULLs the UNIQUE rule below could not stop duplicates
CREATE TABLE IF NOT EXISTS project_assignments (
    id SERIAL PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON UPDATE CASCADE ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role TEXT,
    assigned_from DATE NOT NULL DEFAULT CURRENT_DATE,
    assigned_to DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (assigned_to IS NULL OR assigned_to >= assigned_from),
    UNIQUE (employee_id, project_id, assigned_from)
);

CREATE INDEX IF NOT EXISTS project_assignments_employee_idx ON project_assignments (employee_id);
CREATE INDEX IF NOT EXISTS project_assignments_project_idx ON project_assignments (project_id);

COMMIT;
