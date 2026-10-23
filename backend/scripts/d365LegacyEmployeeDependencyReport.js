// Read-only legacy employee dependency report.
// Usage: node scripts/d365LegacyEmployeeDependencyReport.js [--out <private-local-file.json>]
// Default output is aggregate-only. The optional file contains employee IDs and dependency counts.
import "dotenv/config";
import fs from "node:fs";
import pool from "../db.js";

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;
const outIndex = process.argv.indexOf("--out");
const outPath = outIndex < 0 ? null : process.argv[outIndex + 1];

if (outIndex >= 0 && (!outPath || outPath.startsWith("--"))) {
    throw new Error("--out requires a report file path");
}

const dependencyColumns = async (db) => {
    const result = await db.query(
        `SELECT table_name, column_name, 'employee_id-column' AS dependency_type, NULL::text AS on_delete
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name <> 'employees' AND column_name = 'employee_id'
         UNION
         SELECT child.relname AS table_name, child_column.attname AS column_name, 'employee-foreign-key' AS dependency_type,
                CASE constraint_row.confdeltype
                    WHEN 'c' THEN 'CASCADE'
                    WHEN 'n' THEN 'SET NULL'
                    WHEN 'd' THEN 'SET DEFAULT'
                    WHEN 'r' THEN 'RESTRICT'
                    ELSE 'NO ACTION'
                END AS on_delete
         FROM pg_constraint constraint_row
         JOIN pg_class child ON child.oid = constraint_row.conrelid
         JOIN pg_namespace child_schema ON child_schema.oid = child.relnamespace
         JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY child_key(attnum, ordinal) ON TRUE
         JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY parent_key(attnum, ordinal)
              ON parent_key.ordinal = child_key.ordinal
         JOIN pg_attribute child_column
              ON child_column.attrelid = child.oid AND child_column.attnum = child_key.attnum
         JOIN pg_attribute parent_column
              ON parent_column.attrelid = constraint_row.confrelid AND parent_column.attnum = parent_key.attnum
         WHERE constraint_row.contype = 'f'
           AND constraint_row.confrelid = to_regclass('public.employees')
           AND parent_column.attname = 'employee_id'
           AND child_schema.nspname = 'public'`
    );
    return result.rows;
};

const main = async () => {
    const db = await pool.connect();
    let transactionStarted = false;
    try {
        await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        transactionStarted = true;
        const employees = (await db.query(
            `SELECT e.employee_id,
                    EXISTS (SELECT 1 FROM public.employee_d365_mapping m
                            WHERE m.employee_id = e.employee_id AND m.link_status = 'linked') AS d365_linked
             FROM public.employees e
             ORDER BY e.employee_id`
        )).rows;
        const references = await dependencyColumns(db);
        const dependencyCounts = new Map();
        for (const reference of references) {
            const table = `public.${quoteIdentifier(reference.table_name)}`;
            const column = quoteIdentifier(reference.column_name);
            const counts = await db.query(
                `SELECT employee.employee_id,
                        COUNT(dependency.${column})::int AS dependency_count
                 FROM public.employees employee
                 LEFT JOIN ${table} dependency
                   ON dependency.${column}::text = employee.employee_id::text
                 GROUP BY employee.employee_id`
            );
            for (const row of counts.rows) {
                const key = row.employee_id;
                if (!dependencyCounts.has(key)) dependencyCounts.set(key, []);
                dependencyCounts.get(key).push({
                    table: reference.table_name,
                    column: reference.column_name,
                    type: reference.dependency_type,
                    on_delete: reference.on_delete,
                    count: row.dependency_count,
                });
            }
        }
        const report = {
            generated_at: new Date().toISOString(),
            employee_count: employees.length,
            classification_note: "The repository has no demo marker. Unmapped HRMS records require human confirmation and are not asserted to be demo records.",
            archival_recommendation: "Do not delete or archive from this report. Repository relationships include ON DELETE CASCADE and no supported employee archival workflow was found.",
            records: employees.map((employee) => ({
                employee_id: employee.employee_id,
                classification: employee.d365_linked ? "d365-linked" : "unmapped-legacy-needs-human-classification",
                dependencies: (dependencyCounts.get(employee.employee_id) || [])
                    .filter((dependency) => dependency.count > 0),
            })),
        };
        await db.query("ROLLBACK");
        transactionStarted = false;
        if (outPath) {
            fs.writeFileSync(outPath, JSON.stringify(report, null, 2), { flag: "wx" });
            console.log(`Dependency report written. ${employees.length} employee records; identifiers are only in the specified local report file.`);
        } else {
            const linked = employees.filter((employee) => employee.d365_linked).length;
            const unmapped = employees.length - linked;
            const dependencyKinds = new Set(references.map((reference) => reference.table_name)).size;
            console.log("D365 legacy employee dependency report (aggregate-only; read-only)");
            console.log(`  employee records: ${employees.length}`);
            console.log(`  linked to D365: ${linked}`);
            console.log(`  unmapped; human classification needed: ${unmapped}`);
            console.log(`  dependency tables inspected: ${dependencyKinds}`);
            console.log("  no deletion or archival is proposed");
        }
    } finally {
        try {
            if (transactionStarted) await db.query("ROLLBACK");
        } finally {
            db.release();
        }
    }
};

try {
    await main();
} finally {
    await pool.end();
}
