$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$BackupPath = "C:\Users\DELL\HRMS-backups\hrms-before-d365-20261010-0933.dump"
$ManifestPath = "C:\Users\DELL\HRMS-backups\hrms-before-d365-20261010-0933.manifest.json"
$Backend = "C:\Users\DELL\HRMS\backend"
$PgBin = "C:\Program Files\PostgreSQL\17\bin"
$PgRestore = Join-Path $PgBin "pg_restore.exe"
$Psql = Join-Path $PgBin "psql.exe"
$Createdb = Join-Path $PgBin "createdb.exe"
$Node = (Get-Command node -ErrorAction Stop).Source

$LocalHost = "127.0.0.1"
$LocalPort = 5432
$LocalUser = $env:HRMS_VERIFY_PGUSER
$LocalPassword = $env:HRMS_VERIFY_PGPASSWORD
$verifyDb = "hrms_verify_{0}_{1}" -f (Get-Date -Format "yyyyMMdd_HHmmss"),
    ([guid]::NewGuid().ToString("N").Substring(0, 6))

$CoreTables = @(
    "public.employees",
    "public.attendance",
    "public.employee_payroll",
    "public.employee_d365_mapping",
    "public.employee_documents",
    "public.resignations",
    "public.leaves"
)

$databaseCreationAttempted = $false
$databaseCreated = $false
$tempNodeScript = Join-Path $env:TEMP ("hrms-live-metadata-{0}.mjs" -f [guid]::NewGuid().ToString("N"))
$tempManifest = "$ManifestPath.tmp"
function New-OrdinalMap {
    return [System.Collections.Hashtable]::new([System.StringComparer]::Ordinal)
}

$archiveCounts = New-OrdinalMap
$restoredCounts = New-OrdinalMap
$liveCounts = New-OrdinalMap

function Protect-Text([string]$Text) {
    if ([string]::IsNullOrEmpty($Text)) { return "" }
    $safe = $Text
    if (-not [string]::IsNullOrEmpty($LocalPassword)) {
        $safe = $safe.Replace($LocalPassword, "[redacted]")
    }
    $safe = $safe -replace "(?i)postgres(ql)?://\S+", "[redacted connection string]"
    $safe = $safe -replace "(?i)(password|client_secret|access_token)\s*[=:]\s*\S+", '$1=[redacted]'
    return $safe.Trim()
}

function Quote-WindowsArgument([string]$Value) {
    $builder = New-Object System.Text.StringBuilder
    [void]$builder.Append([char]34)
    $slashes = 0

    foreach ($character in $Value.ToCharArray()) {
        if ([int]$character -eq 92) {
            $slashes++
            continue
        }

        if ([int]$character -eq 34) {
            for ($i = 0; $i -lt (2 * $slashes + 1); $i++) {
                [void]$builder.Append([char]92)
            }
            [void]$builder.Append([char]34)
            $slashes = 0
            continue
        }

        for ($i = 0; $i -lt $slashes; $i++) {
            [void]$builder.Append([char]92)
        }
        $slashes = 0
        [void]$builder.Append($character)
    }

    for ($i = 0; $i -lt (2 * $slashes); $i++) {
        [void]$builder.Append([char]92)
    }
    [void]$builder.Append([char]34)
    return $builder.ToString()
}

function New-ChildProcess(
    [string]$Exe,
    [string[]]$Arguments,
    [string]$WorkingDirectory,
    [bool]$UseLocalAuth
) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    $psi.Arguments = (($Arguments | ForEach-Object { Quote-WindowsArgument $_ }) -join " ")
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true

    foreach ($key in @($psi.EnvironmentVariables.AllKeys)) {
        if ($key -match '^(PG|DATABASE_URL$|DATABASE_SSL|DOTENV_CONFIG_PATH$|SUPABASE_|D365_|AUTH_TOKEN_SECRET$|HRMS_VERIFY_PG(USER|PASSWORD)$)') {
            [void]$psi.EnvironmentVariables.Remove([string]$key)
        }
    }
    if ($UseLocalAuth) {
        $psi.EnvironmentVariables["PGPASSWORD"] = $LocalPassword
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    return $process
}

function Invoke-Child(
    [string]$Exe,
    [string[]]$Arguments,
    [string]$WorkingDirectory,
    [bool]$UseLocalAuth = $false
) {
    $process = New-ChildProcess $Exe $Arguments $WorkingDirectory $UseLocalAuth
    try {
        [void]$process.Start()
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            StdOut = $stdoutTask.Result
            StdErr = $stderrTask.Result
        }
    } finally {
        $process.Dispose()
    }
}

function Invoke-LocalScalar([string]$Database, [string]$Sql) {
    $result = Invoke-Child $Psql @(
        "-X", "-w", "-v", "ON_ERROR_STOP=1",
        "-h", $LocalHost, "-p", "$LocalPort", "-U", $LocalUser,
        "-d", $Database, "-Atqc", $Sql
    ) $Backend $true
    if ($result.ExitCode -ne 0) {
        throw "Local PostgreSQL query failed (exit $($result.ExitCode)): $(Protect-Text ($result.StdErr + $result.StdOut))"
    }
    return $result.StdOut.Trim()
}

function Get-LiveMetadata {
    $code = @'
import { pathToFileURL } from "node:url";

const pool = (await import(pathToFileURL(process.argv[2]).href)).default;
const core = [
  ["public", "employees"],
  ["public", "attendance"],
  ["public", "employee_payroll"],
  ["public", "employee_d365_mapping"],
  ["public", "employee_documents"],
  ["public", "resignations"],
  ["public", "leaves"],
];
const optionalSync = [
  ["public", "d365_sync_runs"],
  ["public", "d365_sync_audit"],
];
const keyOf = (schema, name) => `${schema}.${name}`;
const quoteIdent = (value) => `"${value.replaceAll('"', '""')}"`;

try {
  if (!pool.options.ssl ||
      pool.options.ssl.rejectUnauthorized !== true ||
      !pool.options.ssl.ca) {
    throw new Error("backend/db.js is not configured for CA-verified TLS");
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN READ ONLY");

    const relations = await db.query(`
      SELECT n.nspname AS schema_name, c.relname AS table_name,
             c.relkind, c.oid::text AS oid
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
    `);
    const byKey = new Map(
      relations.rows.map(row => [keyOf(row.schema_name, row.table_name), row])
    );

    const missingCore = core.filter(([schema, name]) =>
      !byKey.has(keyOf(schema, name))
    );
    if (missingCore.length) {
      throw new Error(
        `Required live core table(s) missing: ${
          missingCore.map(([schema, name]) => `${schema}.${name}`).join(", ")
        }`
      );
    }

    const roots = new Map();
    for (const [schema, name] of core) {
      const key = keyOf(schema, name);
      roots.set(key, byKey.get(key));
    }
    for (const [schema, name] of optionalSync) {
      const key = keyOf(schema, name);
      if (byKey.has(key)) roots.set(key, byKey.get(key));
    }

    const fkTables = await db.query(`
      SELECT DISTINCT child_ns.nspname AS schema_name, child.relname AS table_name
      FROM pg_constraint con
      JOIN pg_class child ON child.oid = con.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      WHERE con.contype = 'f'
        AND con.confrelid = 'public.employees'::regclass
      ORDER BY 1, 2
    `);
    for (const row of fkTables.rows) {
      const key = keyOf(row.schema_name, row.table_name);
      if (!byKey.has(key)) throw new Error(`FK relation is missing or not a table: ${key}`);
      roots.set(key, byKey.get(key));
    }

    const tables = [];
    for (const [key, root] of [...roots].sort(([a], [b]) => a.localeCompare(b))) {
      const descendants = await db.query(`
        WITH RECURSIVE tree(oid) AS (
          SELECT $1::oid
          UNION
          SELECT inh.inhrelid
          FROM pg_inherits inh
          JOIN tree ON tree.oid = inh.inhparent
        )
        SELECT ns.nspname AS schema_name, c.relname AS table_name
        FROM tree
        JOIN pg_class c ON c.oid = tree.oid
        JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE c.relkind = 'r'
        ORDER BY 1, 2
      `, [root.oid]);

      if (root.relkind !== "p" && descendants.rowCount === 0) {
        throw new Error(`No physical storage relation found for ${key}`);
      }

      const countSql =
        `SELECT count(*)::text AS n FROM ${quoteIdent(root.schema_name)}.${quoteIdent(root.table_name)}`;
      const liveCount = (await db.query(countSql)).rows[0].n;

      tables.push({
        key,
        schema: root.schema_name,
        name: root.table_name,
        relkind: root.relkind,
        live_count: liveCount,
        schema_relations: [
          { schema: root.schema_name, name: root.table_name },
          ...descendants.rows.map(row => ({
            schema: row.schema_name,
            name: row.table_name,
          })),
        ],
        data_relations: descendants.rows,
      });
    }

    await db.query("ROLLBACK");
    console.log("LIVE_JSON:" + JSON.stringify({ tables }));
  } finally {
    db.release();
  }
} catch (error) {
  console.error("LIVE_ERROR:" + error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
'@
    [IO.File]::WriteAllText($tempNodeScript, $code, [Text.Encoding]::UTF8)
    $result = Invoke-Child $Node @($tempNodeScript, (Join-Path $Backend "db.js")) $Backend $false
    if ($result.ExitCode -ne 0) {
        throw "Live read-only metadata query failed (exit $($result.ExitCode)): $(Protect-Text ($result.StdErr + $result.StdOut))"
    }
    $jsonLine = ($result.StdOut -split "\r?\n" |
        Where-Object { $_.StartsWith("LIVE_JSON:") } |
        Select-Object -Last 1)
    if (-not $jsonLine) { throw "Live metadata process returned no result." }
    return ($jsonLine.Substring("LIVE_JSON:".Length) | ConvertFrom-Json)
}

function Get-MetadataSignature($Metadata) {
    if ($null -eq $Metadata -or $null -eq $Metadata.tables) {
        throw "Protected-table metadata is missing."
    }
    $tables = @($Metadata.tables)
    if ($tables.Count -eq 0) { throw "Protected-table metadata is empty." }

    $keys = @($tables | ForEach-Object { [string]$_.key })
    $keySet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)
    foreach ($key in $keys) {
        if ([string]::IsNullOrWhiteSpace($key) -or -not $keySet.Add($key)) {
            throw "Protected-table keys are missing or duplicated."
        }
    }

    $byKey = New-OrdinalMap
    foreach ($table in $tables) {
        $key = [string]$table.key
        if ($key -notmatch '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$') {
            throw "Unsupported protected-table key: $key"
        }
        if ($null -eq $table.schema_relations -or $null -eq $table.data_relations) {
            throw "Relation metadata is missing for $key."
        }
        [long]$validatedLiveCount = 0
        if (-not [long]::TryParse([string]$table.live_count, [ref]$validatedLiveCount) -or
            $validatedLiveCount -lt 0) {
            throw "Live row count is missing or invalid for $key."
        }

        $schemaRelations = @(
            $table.schema_relations |
                ForEach-Object {
                    $schema = [string]$_.schema
                    $name = [string]$_.name
                    if ($schema -notmatch '^[a-z_][a-z0-9_]*$' -or
                        $name -notmatch '^[a-z_][a-z0-9_]*$') {
                        throw "Invalid or unsupported schema relation metadata for $key."
                    }
                    [pscustomobject]@{ schema = $schema; name = $name }
                } | Sort-Object -Property schema, name
        )
        $dataRelations = @(
            $table.data_relations |
                ForEach-Object {
                    $schema = [string]$_.schema_name
                    $name = [string]$_.table_name
                    if ($schema -notmatch '^[a-z_][a-z0-9_]*$' -or
                        $name -notmatch '^[a-z_][a-z0-9_]*$') {
                        throw "Invalid or unsupported data relation metadata for $key."
                    }
                    [pscustomobject]@{ schema = $schema; name = $name }
                } | Sort-Object -Property schema, name
        )

        if ($schemaRelations.Count -eq 0 -or
            ($table.relkind -ne "p" -and $dataRelations.Count -eq 0)) {
            throw "Incomplete relation metadata for $key."
        }
        $byKey[$key] = [pscustomobject]@{
            schema_relations = $schemaRelations
            data_relations = $dataRelations
        }
    }

    return [pscustomobject]@{
        keys = @($keys | Sort-Object)
        relations = $byKey
    }
}

function Test-RelationListsEqual($Left, $Right) {
    if ($null -eq $Left -or $null -eq $Right -or $Left.Count -ne $Right.Count) {
        return $false
    }
    for ($i = 0; $i -lt $Left.Count; $i++) {
        if ($Left[$i].schema -cne $Right[$i].schema -or
            $Left[$i].name -cne $Right[$i].name) {
            return $false
        }
    }
    return $true
}

function Test-LocalPreflight([string[]]$Extensions) {
    $address = Invoke-LocalScalar "postgres" "SELECT coalesce(inet_server_addr()::text, '')"
    if ($address -notin @("127.0.0.1", "::1")) {
        throw "Local PostgreSQL connection did not resolve to loopback."
    }

    $createdbAllowed = Invoke-LocalScalar "postgres" @"
SELECT CASE WHEN rolcreatedb OR rolsuper THEN 'yes' ELSE 'no' END
FROM pg_roles
WHERE rolname = current_user
"@
    if ($createdbAllowed -ne "yes") {
        throw "Configured local PostgreSQL user lacks CREATEDB privilege."
    }

    $unavailable = @()
    foreach ($extension in $Extensions) {
        $literal = $extension.Replace("'", "''")
        $available = Invoke-LocalScalar "postgres" `
            "SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = '$literal')"
        if ($available -ne "t") { $unavailable += $extension }
    }
    if ($unavailable.Count -gt 0) {
        throw "Required archive extensions unavailable locally: $($unavailable -join ', ')"
    }
}

function Get-ArchiveCopyCount([string]$Schema, [string]$Table) {
    if ($Schema -notmatch '^[A-Za-z_][A-Za-z0-9_]*$' -or
        $Table -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        throw "Unsupported archive identifier; refusing table selection."
    }

    $process = New-ChildProcess $PgRestore @(
        "--data-only", "--schema", $Schema, "--table", $Table, "--file", "-", $BackupPath
    ) $Backend $false
    [int64]$count = 0
    $copyBlocks = 0
    $inCopy = $false
    $copyPattern = "^COPY\s+$([regex]::Escape($Schema))\.$([regex]::Escape($Table))(?:\s|\()"

    try {
        [void]$process.Start()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        while (($line = $process.StandardOutput.ReadLine()) -ne $null) {
            if (-not $inCopy -and $line -match '^COPY\s+') {
                if ($line -notmatch $copyPattern) {
                    throw "Archive extraction selected an unexpected COPY relation for $Schema.$Table."
                }
                $inCopy = $true
                $copyBlocks++
                continue
            }
            if ($inCopy -and $line -eq '\.') {
                $inCopy = $false
                continue
            }
            if ($inCopy) { $count++ }
        }

        $process.WaitForExit()
        $stderr = $stderrTask.Result
        if ($process.ExitCode -ne 0) {
            throw "Archive extraction failed for $Schema.$Table (exit $($process.ExitCode)): $(Protect-Text $stderr)"
        }
        if ($inCopy) { throw "Archive COPY block was incomplete for $Schema.$Table." }
        if ($copyBlocks -eq 0) { throw "TABLE DATA entry produced no COPY block for $Schema.$Table." }
        return $count
    } finally {
        $process.Dispose()
    }
}

try {
    if ($BackupPath -cne "C:\Users\DELL\HRMS-backups\hrms-before-d365-20261010-0933.dump") {
        throw "Backup path differs from the approved archive path."
    }
    if (-not (Test-Path -LiteralPath $BackupPath -PathType Leaf)) {
        throw "Backup archive not found."
    }
    if (Test-Path -LiteralPath $ManifestPath) {
        throw "Manifest already exists; refusing to overwrite it."
    }
    if ([string]::IsNullOrWhiteSpace($LocalUser)) {
        throw "Set HRMS_VERIFY_PGUSER to the local PostgreSQL user."
    }
    if ([string]::IsNullOrWhiteSpace($LocalPassword)) {
        throw "Set HRMS_VERIFY_PGPASSWORD in this PowerShell session."
    }
    foreach ($tool in @($PgRestore, $Psql, $Createdb, $Node)) {
        if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
            throw "Required tool is missing: $tool"
        }
    }

    $archiveFile = Get-Item -LiteralPath $BackupPath
    $archiveHash = (Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash
    $tocResult = Invoke-Child $PgRestore @("--list", $BackupPath) $Backend $false
    if ($tocResult.ExitCode -ne 0) {
        throw "pg_restore --list failed (exit $($tocResult.ExitCode)): $(Protect-Text ($tocResult.StdErr + $tocResult.StdOut))"
    }

    $tocLines = $tocResult.StdOut -split "\r?\n"
    $createdLine = $tocLines |
        Where-Object { $_ -match '^;\s*Archive created at\s+' } |
        Select-Object -First 1
    if (-not $createdLine) { throw "Archive header creation timestamp is missing." }
    $createdText = $createdLine -replace '^;\s*Archive created at\s+', ''
    [DateTimeOffset]$archiveCreatedAt = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse(
        $createdText,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AssumeLocal,
        [ref]$archiveCreatedAt
    )) {
        throw "Archive header creation timestamp is invalid."
    }

    $tocPattern = '^\s*\d+;\s+\d+\s+\d+\s+(TABLE DATA|TABLE)\s+(\S+)\s+(\S+)(?:\s|$)'
    $schemaEntries = New-OrdinalMap
    $dataEntries = New-OrdinalMap
    $extensions = @()
    foreach ($line in $tocLines) {
        if ($line -match $tocPattern) {
            $key = "$($Matches[2]).$($Matches[3])"
            if ($Matches[1] -eq "TABLE") { $schemaEntries[$key] = $true }
            else { $dataEntries[$key] = $true }
        }
        if ($line -match '^\s*\d+;\s+\d+\s+\d+\s+EXTENSION\s+-\s+(\S+)(?:\s|$)') {
            $extensions += $Matches[1].Trim('"')
        }
    }
    $extensions = @($extensions | Sort-Object -Unique)

    $initialLive = Get-LiveMetadata
    $tables = @($initialLive.tables)
    $initialSignature = Get-MetadataSignature $initialLive
    foreach ($core in $CoreTables) {
        if ($initialSignature.keys -cnotcontains $core) {
            throw "Required live core table is missing: $core"
        }
    }

    $requiredSchemaEntries = New-OrdinalMap
    $requiredDataEntries = New-OrdinalMap
    foreach ($table in $tables) {
        foreach ($relation in @($table.schema_relations)) {
            $schema = [string]$relation.schema
            $name = [string]$relation.name
            if ($schema -notmatch '^[a-z_][a-z0-9_]*$' -or
                $name -notmatch '^[a-z_][a-z0-9_]*$') {
                throw "Unsupported protected-table identifier."
            }
            $requiredSchemaEntries["$schema.$name"] = $true
        }
        foreach ($relation in @($table.data_relations)) {
            $schema = [string]$relation.schema_name
            $name = [string]$relation.table_name
            if ($schema -notmatch '^[a-z_][a-z0-9_]*$' -or
                $name -notmatch '^[a-z_][a-z0-9_]*$') {
                throw "Unsupported physical data relation identifier."
            }
            $requiredDataEntries["$schema.$name"] = $true
        }
    }

    $missingSchema = @($requiredSchemaEntries.Keys |
        Where-Object { -not $schemaEntries.ContainsKey($_) })
    if ($missingSchema.Count) {
        throw "Required TABLE archive entries missing: $($missingSchema -join ', ')"
    }
    $missingData = @($requiredDataEntries.Keys |
        Where-Object { -not $dataEntries.ContainsKey($_) })
    if ($missingData.Count) {
        throw "Required TABLE DATA archive entries missing: $($missingData -join ', ')"
    }

    foreach ($table in $tables) {
        [int64]$total = 0
        foreach ($relation in @($table.data_relations)) {
            $total += Get-ArchiveCopyCount ([string]$relation.schema_name) ([string]$relation.table_name)
        }
        $archiveCounts[[string]$table.key] = $total
        $liveCounts[[string]$table.key] = [int64]$table.live_count
    }

    # Local-only read-only permission, server-address, and extension checks.
    Test-LocalPreflight $extensions
    $existing = Invoke-LocalScalar "postgres" `
        "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$verifyDb')"
    if ($existing -ne "f") { throw "Verification database already exists; refusing to overwrite it." }

    $databaseCreationAttempted = $true
    $created = Invoke-Child $Createdb @(
        "-h", $LocalHost, "-p", "$LocalPort", "-U", $LocalUser,
        "-w", "-d", "postgres", "-T", "template0", $verifyDb
    ) $Backend $true
    if ($created.ExitCode -ne 0) {
        throw "createdb failed (exit $($created.ExitCode)): $(Protect-Text ($created.StdErr + $created.StdOut))"
    }
    $databaseCreated = $true

    $owner = Invoke-LocalScalar $verifyDb `
        "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$verifyDb'"
    if ($owner -cne $LocalUser) { throw "Verification database owner mismatch." }
    $objects = Invoke-LocalScalar $verifyDb @"
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S'))
  + (SELECT count(*) FROM pg_largeobject_metadata)
"@
    if ($objects -ne "0") { throw "New verification database is not empty; restore refused." }

    $restore = Invoke-Child $PgRestore @(
        "--no-owner", "--no-privileges", "--exit-on-error",
        "-h", $LocalHost, "-p", "$LocalPort", "-U", $LocalUser, "-w",
        "-d", $verifyDb, $BackupPath
    ) $Backend $true
    if ($restore.ExitCode -ne 0) {
        throw "pg_restore failed (exit $($restore.ExitCode)): $(Protect-Text ($restore.StdErr + $restore.StdOut))"
    }
    if (-not [string]::IsNullOrWhiteSpace($restore.StdErr)) {
        Write-Host ("pg_restore reported: " + (Protect-Text $restore.StdErr))
    }

    foreach ($table in $tables) {
        $schema = ([string]$table.schema).Replace('"', '""')
        $name = ([string]$table.name).Replace('"', '""')
        $restoredCounts[[string]$table.key] = [int64](Invoke-LocalScalar $verifyDb `
            "SELECT count(*) FROM `"$schema`".`"$name`"")
    }

    $finalLive = Get-LiveMetadata
    $finalSignature = Get-MetadataSignature $finalLive
    if (($initialSignature.keys -join "`n") -cne ($finalSignature.keys -join "`n")) {
        throw "Protected-table set changed; no manifest will be written."
    }
    foreach ($key in $initialSignature.keys) {
        $before = $initialSignature.relations[$key]
        $after = $finalSignature.relations[$key]
        if (-not (Test-RelationListsEqual $before.schema_relations $after.schema_relations) -or
            -not (Test-RelationListsEqual $before.data_relations $after.data_relations)) {
            throw "Physical relations changed for $key; no manifest will be written."
        }
        $liveCounts[$key] = [int64](
            $finalLive.tables | Where-Object { $_.key -ceq $key } |
                Select-Object -ExpandProperty live_count
        )
    }

    $comparison = foreach ($key in $initialSignature.keys) {
        [pscustomobject]@{
            table = $key
            archive = [int64]$archiveCounts[$key]
            restored = [int64]$restoredCounts[$key]
            live = [int64]$liveCounts[$key]
        }
    }
    $comparison | Format-Table -AutoSize
    if (@($comparison | Where-Object {
        $_.archive -ne $_.restored -or $_.archive -ne $_.live
    }).Count -gt 0) {
        throw "Archive, restored, and final live counts differ; no manifest will be written."
    }

    $ageHours = ([DateTimeOffset]::UtcNow - $archiveCreatedAt.ToUniversalTime()).TotalHours
    if ($ageHours -lt 0 -or $ageHours -gt 24) {
        throw "Archive creation time is outside the 24-hour verification window."
    }

    $currentArchiveFile = Get-Item -LiteralPath $BackupPath
    $currentArchiveHash = (Get-FileHash -LiteralPath $BackupPath -Algorithm SHA256).Hash
    if ($currentArchiveHash -cne $archiveHash -or
        [int64]$currentArchiveFile.Length -ne [int64]$archiveFile.Length) {
        throw "Archive SHA-256 or byte size changed during verification; no manifest will be written."
    }

    $manifest = [ordered]@{
        verified = $true
        method = "pg_dump"
        location = $BackupPath
        backup_path = $BackupPath
        created_at = $archiveCreatedAt.ToUniversalTime().ToString("o")
        verified_at = [DateTimeOffset]::UtcNow.ToString("o")
        protected_tables = @($initialSignature.keys)
        archive = [ordered]@{
            sha256 = $archiveHash
            size_bytes = [int64]$archiveFile.Length
            archive_created_at = $archiveCreatedAt.ToUniversalTime().ToString("o")
            file_last_write_time_utc = $archiveFile.LastWriteTimeUtc.ToString("o")
        }
        row_counts_by_source = [ordered]@{
            archive = $archiveCounts
            restored = $restoredCounts
            live = $liveCounts
        }
        restore = [ordered]@{
            local_host = $LocalHost
            local_port = $LocalPort
            local_database = $verifyDb
        }
    }

    if (Test-Path -LiteralPath $ManifestPath) {
        throw "Manifest appeared during verification; refusing to overwrite it."
    }
    [IO.File]::WriteAllText($tempManifest, ($manifest | ConvertTo-Json -Depth 10), [Text.Encoding]::UTF8)
    [IO.File]::Move($tempManifest, $ManifestPath)

    Write-Host "Verification succeeded. Manifest: $ManifestPath"
    Write-Host "Verification database preserved: $verifyDb"
} catch {
    Write-Host ("ERROR: " + (Protect-Text $_.Exception.Message))
    if ($databaseCreationAttempted) {
        Write-Host "Database creation was attempted for: $verifyDb"
        Write-Host "Inspect it manually; no database is dropped automatically."
        Write-Host "Connect with: `"$Psql`" -X -h $LocalHost -p $LocalPort -U $LocalUser -W -d $verifyDb"
    }
    exit 1
} finally {
    if (Test-Path -LiteralPath $tempNodeScript) {
        Remove-Item -LiteralPath $tempNodeScript -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $tempManifest) {
        Remove-Item -LiteralPath $tempManifest -ErrorAction SilentlyContinue
    }
}
