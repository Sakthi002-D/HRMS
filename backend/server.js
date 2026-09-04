import express from "express";
import cors from "cors";
import pool from "./db.js";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";


const app = express();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

app.use(cors());
app.use(express.json());

// Test API
app.get("/", (req, res) => {
    res.json({
        message: "HRMS Backend is running",
    });
});



// =========================
// GET ATTENDANCE
// =========================

app.get("/api/attendance", async (req, res) => {
    try {
        const { date } = req.query;

        let query;
        let values = [];

        if (date) {
            query = `
                SELECT
                    a.id,
                    a.employee_id,
                    e.name AS employee_name,
                    e.department,
                    a.attendance_date,
                    a.punch_in,
                    a.status,
                    a.punch_out,
                    a.late_minutes,
                    a.shift,
                    a.project,

                    CASE
                        WHEN a.punch_out IS NOT NULL
                        THEN ROUND(
                            EXTRACT(
                                EPOCH FROM (a.punch_out - a.punch_in)
                            ) / 60
                        )
                        ELSE NULL
                    END AS working_minutes

                FROM attendance a

                JOIN employees e
                    ON a.employee_id = e.employee_id

                WHERE a.attendance_date = $1

                ORDER BY a.id DESC
            `;

            values = [date];

        } else {
            query = `
                SELECT
                    a.id,
                    a.employee_id,
                    e.name AS employee_name,
                    e.department,
                    a.attendance_date,
                    a.punch_in,
                    a.status,
                    a.punch_out,
                    a.late_minutes,
                    a.shift,
                    a.project,

                    CASE
                        WHEN a.punch_out IS NOT NULL
                        THEN ROUND(
                            EXTRACT(
                                EPOCH FROM (a.punch_out - a.punch_in)
                            ) / 60
                        )
                        ELSE NULL
                    END AS working_minutes

                FROM attendance a

                JOIN employees e
                    ON a.employee_id = e.employee_id

                WHERE a.attendance_date =
                    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date

                ORDER BY a.id DESC
            `;
        }

        const result = await pool.query(query, values);

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching attendance:", error);

        res.status(500).json({
            message: "Failed to fetch attendance"
        });
    }
});

// Add Attendance
app.post("/api/attendance", async (req, res) => {
    try {
        const {
            employee_id,
            attendance_date,
            punch_in,
            status,
            punch_out,
            break_minutes,
            shift,
            project
        } = req.body;

        const result = await pool.query(
            `INSERT INTO attendance 
            (
                employee_id, 
                attendance_date, 
                punch_in, 
                status, 
                punch_out, 
                break_minutes, 
                shift, 
                project
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING *`,
            [
                employee_id,
                attendance_date,
                punch_in,
                status || "Present",
                punch_out,
                break_minutes || 0,
                shift,
                project
            ]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error("Error adding attendance:", error);

        res.status(500).json({
            message: "Failed to add attendance"
        });
    }
});

// =========================
// BIOMETRIC PUNCH IN API
// =========================

app.post("/api/attendance/punch-in", async (req, res) => {
    try {
        const { employee_id } = req.body;

        if (!employee_id) {
            return res.status(400).json({
                message: "Employee ID is required"
            });
        }

        // Check employee
        const employeeResult = await pool.query(
            `SELECT employee_id, name, department
             FROM employees
             WHERE employee_id = $1
               AND status = 'Active'`,
            [employee_id]
        );

        if (employeeResult.rows.length === 0) {
            return res.status(404).json({
                message: "Active employee not found"
            });
        }

        const employee = employeeResult.rows[0];

        // Get current India date and time
        const timeResult = await pool.query(`
            SELECT
                (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS today,
                (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time AS current_time
        `);

        const today = timeResult.rows[0].today;
        const punchTime = timeResult.rows[0].current_time;

        // Check whether employee already punched in today
        const existingResult = await pool.query(
            `SELECT *
             FROM attendance
             WHERE employee_id = $1
               AND attendance_date = $2`,
            [employee_id, today]
        );

        if (existingResult.rows.length > 0) {
            return res.status(400).json({
                message: "Employee has already punched in today",
                attendance: existingResult.rows[0]
            });
        }

        // Calculate late minutes from 09:00 AM
        const [hours, minutes] = punchTime
            .toString()
            .substring(0, 5)
            .split(":")
            .map(Number);

        const punchTotalMinutes = hours * 60 + minutes;
        const shiftStartMinutes = 9 * 60;

        let lateMinutes = 0;

        if (punchTotalMinutes > shiftStartMinutes) {
            lateMinutes =
                punchTotalMinutes - shiftStartMinutes;
        }

        // Status based on late minutes
        const status =
            lateMinutes > 0 ? "Late" : "Present";

        // Insert attendance
       const result = await pool.query(
    `INSERT INTO attendance
    (
        employee_id,
        attendance_date,
        punch_in,
        status,
        late_minutes,
        shift,
        project
    )
    VALUES
    (
        $1,
        $2,
        $3,
        $4,
        $5,
        '09:00 - 18:00',
        'HRMS Portal'
    )
    RETURNING *`,
    [
        employee_id,
        today,
        punchTime,
        status,
        lateMinutes
    ]
);

        res.status(201).json({
            message: "Punch In successful",
            employee: {
                employee_id: employee.employee_id,
                name: employee.name,
                department: employee.department
            },
            attendance: result.rows[0]
        });

    } catch (error) {
        console.error("Punch In error:", error);

        res.status(500).json({
            message: "Failed to process Punch In"
        });
    }
});

// =========================
// BIOMETRIC PUNCH OUT API
// =========================

app.post("/api/attendance/punch-out", async (req, res) => {
    try {
        const { employee_id, punch_out } = req.body;

        if (!employee_id) {
            return res.status(400).json({
                message: "Employee ID is required"
            });
        }

        // Check employee
        const employeeResult = await pool.query(
            `SELECT employee_id, name, department
             FROM employees
             WHERE employee_id = $1
               AND status = 'Active'`,
            [employee_id]
        );

        if (employeeResult.rows.length === 0) {
            return res.status(404).json({
                message: "Active employee not found"
            });
        }

        const employee = employeeResult.rows[0];

        // Find today's attendance - India timezone
        const attendanceResult = await pool.query(
            `SELECT *
             FROM attendance
             WHERE employee_id = $1
               AND attendance_date =
               (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`,
            [employee_id]
        );

        if (attendanceResult.rows.length === 0) {
            return res.status(400).json({
                message: "Employee has not punched in today"
            });
        }

        const attendance = attendanceResult.rows[0];

        if (attendance.punch_out) {
            return res.status(400).json({
                message: "Employee has already punched out today",
                attendance
            });
        }

        const result = await pool.query(
            `UPDATE attendance
             SET punch_out = COALESCE(
                 $1::time,
                 (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time
             )
             WHERE id = $2
             RETURNING *`,
            [
                punch_out || null,
                attendance.id
            ]
        );

        res.json({
            message: "Punch Out successful",
            employee: {
                employee_id: employee.employee_id,
                name: employee.name,
                department: employee.department
            },
            attendance: result.rows[0]
        });

    } catch (error) {
        console.error("Punch Out error:", error);

        res.status(500).json({
            message: "Failed to process Punch Out"
        });
    }
});

// =========================
// EMPLOYEE APIs
// =========================

// Get all employees
app.get("/api/employees", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM employees ORDER BY id ASC"
        );

        res.json(result.rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Failed to fetch employees",
        });
    }
});

// Get employee detail sections
app.get("/api/employees/:employeeId/details", async (req, res) => {
    try {
        const { employeeId } = req.params;
        const result = await pool.query(
            `SELECT
                e.id,
                e.employee_id,
                COALESCE((SELECT row_to_json(b) FROM employee_bank_details b WHERE b.employee_id = e.employee_id ORDER BY b.id DESC LIMIT 1), '{}'::json) AS bank,
                COALESCE((SELECT row_to_json(f) FROM employee_family_details f WHERE f.employee_id = e.employee_id ORDER BY f.id DESC LIMIT 1), '{}'::json) AS family,
                COALESCE((SELECT row_to_json(ed) FROM employee_education ed WHERE ed.employee_id = e.employee_id ORDER BY ed.id DESC LIMIT 1), '{}'::json) AS education,
                COALESCE((SELECT row_to_json(ex) FROM employee_experience ex WHERE ex.employee_id = e.id ORDER BY ex.id DESC LIMIT 1), '{}'::json) AS experience,
                COALESCE((SELECT row_to_json(p) FROM employee_projects p WHERE p.employee_id = e.employee_id ORDER BY p.id DESC LIMIT 1), '{}'::json) AS project
             FROM employees e
             WHERE e.employee_id = $1`,
            [employeeId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching employee details:", error);
        res.status(500).json({ message: "Failed to fetch employee details" });
    }
});

const detailTableConfig = {
    bank: { table: "employee_bank_details", key: "employee_id", columns: ["account_holder_name", "account_number", "bank_name", "branch_name", "ifsc_code", "account_type"] },
    family: { table: "employee_family_details", key: "employee_id", columns: ["father_name", "mother_name", "spouse_name", "spouse_employment", "marital_status", "children_count"] },
    education: { table: "employee_education", key: "employee_id", columns: ["qualification", "institution", "field_of_study", "start_year", "end_year", "grade"] },
    project: { table: "employee_projects", key: "employee_id", columns: ["project_name", "description", "project_lead", "start_date", "deadline", "status"] },
};

for (const [section, config] of Object.entries(detailTableConfig)) {
    app.put(`/api/employees/:employeeId/${section}`, async (req, res) => {
        try {
            const { employeeId } = req.params;
            const employeeResult = await pool.query(
                "SELECT employee_id FROM employees WHERE employee_id = $1",
                [employeeId]
            );
            if (employeeResult.rows.length === 0) {
                return res.status(404).json({ message: "Employee not found" });
            }

            const values = config.columns.map((column) => req.body[column] ?? null);
            const existing = await pool.query(
                `SELECT id FROM ${config.table} WHERE ${config.key} = $1 ORDER BY id DESC LIMIT 1`,
                [employeeId]
            );

            let result;
            if (existing.rows.length > 0) {
                const assignments = config.columns.map((column, index) => `${column} = $${index + 1}`).join(", ");
                result = await pool.query(
                    `UPDATE ${config.table} SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length + 1} RETURNING *`,
                    [...values, existing.rows[0].id]
                );
            } else {
                const columns = [config.key, ...config.columns];
                const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
                result = await pool.query(
                    `INSERT INTO ${config.table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`,
                    [employeeId, ...values]
                );
            }
            res.json(result.rows[0]);
        } catch (error) {
            console.error(`Error updating employee ${section}:`, error);
            res.status(500).json({ message: `Failed to update ${section} details` });
        }
    });
}

app.put("/api/employees/:employeeId/experience", async (req, res) => {
    try {
        const employeeResult = await pool.query(
            "SELECT id FROM employees WHERE employee_id = $1",
            [req.params.employeeId]
        );
        if (employeeResult.rows.length === 0) {
            return res.status(404).json({ message: "Employee not found" });
        }
        const employeeDbId = employeeResult.rows[0].id;
        const columns = ["company_name", "designation", "start_date", "end_date", "description"];
        const values = columns.map((column) => req.body[column] ?? null);
        const existing = await pool.query(
            "SELECT id FROM employee_experience WHERE employee_id = $1 ORDER BY id DESC LIMIT 1",
            [employeeDbId]
        );
        let result;
        if (existing.rows.length > 0) {
            const assignments = columns.map((column, index) => `${column} = $${index + 1}`).join(", ");
            result = await pool.query(
                `UPDATE employee_experience SET ${assignments} WHERE id = $${values.length + 1} RETURNING *`,
                [...values, existing.rows[0].id]
            );
        } else {
            result = await pool.query(
                `INSERT INTO employee_experience (employee_id, ${columns.join(", ")}) VALUES ($1, ${columns.map((_, index) => `$${index + 2}`).join(", ")}) RETURNING *`,
                [employeeDbId, ...values]
            );
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error updating employee experience:", error);
        res.status(500).json({ message: "Failed to update experience details" });
    }
});


const handleLogin = async (e) => {
  e.preventDefault();

  if (!username.trim() || !password.trim()) {
    alert("Please enter username and password");
    return;
  }

  try {
    setLoading(true);

    const response = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        employee_id: username.trim(),
        password: password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message || "Invalid username or password");
      return;
    }

    const user = data.employee;

    // Clear old login sessions
    sessionStorage.removeItem("loggedInEmployee");
    sessionStorage.removeItem("loggedInHR");

    // HR LOGIN
    if (user.role === "hr") {
      sessionStorage.setItem(
        "loggedInHR",
        JSON.stringify(user)
      );

      navigate("/hr-dashboard", { replace: true });
      return;
    }

    // EMPLOYEE LOGIN
    sessionStorage.setItem(
      "loggedInEmployee",
      JSON.stringify(user)
    );

    navigate("/employee-dashboard", { replace: true });

  } catch (error) {
    console.error("Login error:", error);
    alert("Unable to connect to backend");
  } finally {
    setLoading(false);
  }
};

// ===============================
// FORGOT PASSWORD - SEND OTP
// ===============================

app.post("/api/forgot-password", async (req, res) => {
    try {
        const { employee_id } = req.body;

        if (!employee_id) {
            return res.status(400).json({
                message: "Employee ID is required",
            });
        }

        // Find employee
        const result = await pool.query(
            `SELECT employee_id, email, name
             FROM employees
             WHERE employee_id = $1
               AND status = 'Active'`,
            [employee_id.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Employee not found",
            });
        }

        const employee = result.rows[0];

        if (!employee.email) {
            return res.status(400).json({
                message: "No registered email found for this employee",
            });
        }

        // Generate 6 digit OTP
        const otp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        // Hash OTP
        const otpHash = await bcrypt.hash(otp, 10);

        // OTP expires in 5 minutes
        const expiresAt = new Date(
            Date.now() + 5 * 60 * 1000
        );

        // Save OTP
        await pool.query(
            `INSERT INTO password_resets
             (employee_id, otp_hash, expires_at)
             VALUES ($1, $2, $3)`,
            [
                employee.employee_id,
                otpHash,
                expiresAt,
            ]
        );

        // Gmail transporter
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // Send OTP
        await transporter.sendMail({
            from: `"HRMS" <${process.env.EMAIL_USER}>`,
            to: employee.email,
            subject: "HRMS Password Reset OTP",
            text: `Hello ${employee.name},

Your HRMS password reset OTP is: ${otp}

This OTP is valid for 5 minutes.

If you did not request a password reset, please ignore this email.

Regards,
HRMS Team`,
        });

        res.json({
            message: "OTP generated successfully",
            email: employee.email,
        });

    } catch (error) {
        console.error(
            "Forgot password error:",
            error
        );

        res.status(500).json({
            message: "Failed to generate OTP",
        });
    }
});


// ===============================
// VERIFY OTP
// ===============================

app.post("/api/verify-otp", async (req, res) => {
    try {
        const { employee_id, otp } = req.body;

        if (!employee_id || !otp) {
            return res.status(400).json({
                message: "Employee ID and OTP are required",
            });
        }

        const result = await pool.query(
            `SELECT *
             FROM password_resets
             WHERE employee_id = $1
               AND verified = FALSE
             ORDER BY created_at DESC
             LIMIT 1`,
            [employee_id.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({
                message: "OTP not found or already used",
            });
        }

        const reset = result.rows[0];

        // Check expiry
        if (new Date() > new Date(reset.expires_at)) {
            return res.status(400).json({
                message: "OTP has expired",
            });
        }

        // Check attempts
        if (reset.attempts >= 5) {
            return res.status(400).json({
                message: "Too many incorrect attempts",
            });
        }

        // Compare OTP
        const isValid = await bcrypt.compare(
            otp.trim(),
            reset.otp_hash
        );

        if (!isValid) {
            await pool.query(
                `UPDATE password_resets
                 SET attempts = attempts + 1
                 WHERE id = $1`,
                [reset.id]
            );

            return res.status(400).json({
                message: "Invalid OTP",
            });
        }

        // Mark OTP as verified
        await pool.query(
            `UPDATE password_resets
             SET verified = TRUE
             WHERE id = $1`,
            [reset.id]
        );

        res.json({
            message: "OTP verified successfully",
        });

    } catch (error) {
        console.error(
            "Verify OTP error:",
            error
        );

        res.status(500).json({
            message: "Failed to verify OTP",
        });
    }
});


// ===============================
// RESET PASSWORD
// ===============================

app.post("/api/reset-password", async (req, res) => {
    try {
        const {
            employee_id,
            new_password
        } = req.body;

        if (!employee_id || !new_password) {
            return res.status(400).json({
                message:
                    "Employee ID and new password are required",
            });
        }

        if (new_password.length < 6) {
            return res.status(400).json({
                message:
                    "Password must be at least 6 characters",
            });
        }

        // Check OTP verification
        const resetResult = await pool.query(
            `SELECT *
             FROM password_resets
             WHERE employee_id = $1
               AND verified = TRUE
             ORDER BY created_at DESC
             LIMIT 1`,
            [employee_id.trim()]
        );

        if (resetResult.rows.length === 0) {
            return res.status(400).json({
                message: "OTP verification required",
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(
            new_password,
            10
        );

        // Update employee password
        const updateResult = await pool.query(
            `UPDATE employees
             SET password = $1
             WHERE employee_id = $2
               AND status = 'Active'
             RETURNING employee_id`,
            [
                hashedPassword,
                employee_id.trim()
            ]
        );

        if (updateResult.rows.length === 0) {
            return res.status(404).json({
                message: "Employee not found",
            });
        }

        // Delete used OTP
        await pool.query(
            `DELETE FROM password_resets
             WHERE employee_id = $1`,
            [employee_id.trim()]
        );

        res.json({
            message: "Password reset successfully",
        });

    } catch (error) {
        console.error(
            "Reset password error:",
            error
        );

        res.status(500).json({
            message: "Failed to reset password",
        });
    }
});

// Add New Employees
app.post("/api/employees", async (req, res) => {
    try {
        const {
            employee_id,
            name,
            department,
            designation,
            email,
            phone,
            joining_date,
            status
        } = req.body;

        const result = await pool.query(
            `INSERT INTO employees
            (
                employee_id, 
                name, 
                department, 
                designation, 
                email, 
                phone, 
                joining_date, 
                status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                employee_id,
                name,
                department,
                designation,
                email,
                phone,
                joining_date,
                status || "Active"
            ]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error("Error adding employee", error);

        res.status(500).json({
            message: "Failed to add employee"
        });
    }
});


// Update Employee
app.put("/api/employees/:employeeId", async (req, res) => {
    try {
        const { employeeId } = req.params;

       const {
        employee_id,
        name,
        date_of_birth,
        gender,
        department,
        designation,
        email,
        phone,
        address,
        joining_date,
        employment_type,
        status,
        emergency_contact
        } = req.body;

        const result = await pool.query(
  `UPDATE employees
   SET
      employee_id = $1,
      name = $2,
      date_of_birth = $3,
      gender = $4,
      department = $5,
      designation = $6,
      email = $7,
      phone = $8,
      address = $9,
      joining_date = $10,
      employment_type = $11,
      status = $12,
      emergency_contact = $13
   WHERE employee_id = $14
   RETURNING *`,
  [
    employee_id,
    name,
    date_of_birth,
    gender,
    department,
    designation,
    email,
    phone,
    address,
    joining_date,
    employment_type,
    status,
    emergency_contact,
    employeeId
  ]
);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Employee not found"
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error("Error updating employee:", error);

        res.status(500).json({
            message: "Failed to update employee"
        });
    }
});


// Delete Employee
app.delete("/api/employees/:employeeId", async (req, res) => {
    try {
        const { employeeId } = req.params;

        const result = await pool.query(
            `DELETE FROM employees
             WHERE employee_id = $1
             RETURNING *`,
            [employeeId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Employee not found"
            });
        }

        res.json({
            message: "Employee deleted successfully",
            employee: result.rows[0]
        });

    } catch (error) {
        console.error("Error deleting employee:", error);

        res.status(500).json({
            message: "Failed to delete employee"
        });
    }
});

// =========================
// LEAVE MANAGEMENT API
// =========================

// Get all leave requests - HR
app.get("/api/leaves", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                l.id,
                l.employee_id,
                e.name AS employee_name,
                l.leave_type,
                l.from_date,
                l.to_date,
                l.days,
                l.reason,
                l.status
            FROM leaves l
            JOIN employees e
                ON l.employee_id = e.employee_id
            ORDER BY l.id ASC
        `);

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching leaves:", error);

        res.status(500).json({
            message: "Failed to fetch leave requests"
        });
    }
});


// =========================
// HR - APPROVE / REJECT LEAVE
// =========================

app.put("/api/leaves/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                message: "Status is required"
            });
        }

        const allowedStatuses = [
            "Pending",
            "Approved",
            "Rejected"
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                message: "Invalid leave status"
            });
        }

        const result = await pool.query(
            `
            UPDATE leaves
            SET status = $1
            WHERE id = $2
            RETURNING *
            `,
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Leave not found"
            });
        }

        res.json({
            message: `Leave ${status.toLowerCase()} successfully`,
            leave: result.rows[0]
        });

    } catch (error) {
        console.error("Error updating leave status:", error);

        res.status(500).json({
            message: "Failed to update leave status",
            error: error.message
        });
    }
});


// =====================================================
// EMPLOYEE - GET OWN LEAVE REQUESTS
// =====================================================

app.get("/api/leaves/employee/:employeeId", async (req, res) => {
    try {
        const { employeeId } = req.params;

        const result = await pool.query(
            `
            SELECT
                id,
                employee_id,
                leave_type,
                from_date,
                to_date,
                days,
                reason,
                status,
                created_at
            FROM leaves
            WHERE employee_id = $1
            ORDER BY id DESC
            `,
            [employeeId]
        );

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching employee leaves:", error);

        res.status(500).json({
            message: "Failed to fetch employee leaves",
            error: error.message
        });
    }
});


// =====================================================
// EMPLOYEE - APPLY LEAVE
// =====================================================

app.post("/api/leaves", async (req, res) => {
    try {
        const {
            employee_id,
            leave_type,
            from_date,
            to_date,
            reason
        } = req.body;

        console.log("Apply Leave Request:", req.body);


        // Check required fields
        if (
            !employee_id ||
            !leave_type ||
            !from_date ||
            !to_date
        ) {
            return res.status(400).json({
                message: "Please fill all required fields"
            });
        }


        // Check employee
        const employeeResult = await pool.query(
            `
            SELECT
                employee_id,
                name,
                status
            FROM employees
            WHERE employee_id = $1
            `,
            [employee_id]
        );

        if (employeeResult.rows.length === 0) {
            return res.status(404).json({
                message: "Employee not found"
            });
        }

        const employee = employeeResult.rows[0];


        // Only active employees can apply
        if (
            String(employee.status).toLowerCase() !==
            "active"
        ) {
            return res.status(400).json({
                message: "Inactive employees cannot apply for leave"
            });
        }


        // Validate dates
        const from = new Date(`${from_date}T00:00:00`);
        const to = new Date(`${to_date}T00:00:00`);

        if (
            Number.isNaN(from.getTime()) ||
            Number.isNaN(to.getTime())
        ) {
            return res.status(400).json({
                message: "Invalid date format"
            });
        }


        // To date cannot be before from date
        if (to < from) {
            return res.status(400).json({
                message: "To Date must be after or equal to From Date"
            });
        }


        // Calculate leave days
        const difference =
            Math.floor(
                (to.getTime() - from.getTime()) /
                (1000 * 60 * 60 * 24)
            ) + 1;


        // Insert leave
        const result = await pool.query(
            `
            INSERT INTO leaves
            (
                employee_id,
                leave_type,
                from_date,
                to_date,
                days,
                reason,
                status
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                'Pending'
            )
            RETURNING *
            `,
            [
                employee_id,
                leave_type,
                from_date,
                to_date,
                difference,
                reason || null
            ]
        );


        console.log(
            "Leave created successfully:",
            result.rows[0]
        );


        res.status(201).json({
            message: "Leave applied successfully",
            leave: result.rows[0]
        });

    } catch (error) {

        console.error(
            "===================================="
        );

        console.error(
            "ERROR APPLYING LEAVE:"
        );

        console.error(error);

        console.error(
            "===================================="
        );


        res.status(500).json({
            message: "Failed to apply leave",
            error: error.message
        });
    }
});

// =========================
// HR DASHBOARD API
// =========================

app.get("/api/dashboard", async (req, res) => {
    try {
        const employeesResult = await pool.query(`
            SELECT COUNT(*)::int AS total_employees
            FROM employees
            WHERE status = 'Active'
        `);

        const attendanceResult = await pool.query(`
            SELECT COUNT(DISTINCT employee_id)::int AS present_today
            FROM attendance
            WHERE attendance_date = CURRENT_DATE
              AND LOWER(status) = 'present'
        `);

        const leavesResult = await pool.query(`
            SELECT COUNT(*)::int AS pending_leaves
            FROM leaves
            WHERE LOWER(status) = 'pending'
        `);

        let openTickets = 0;

        try {
            const ticketsResult = await pool.query(`
                SELECT COUNT(*)::int AS open_tickets
                FROM tickets
                WHERE LOWER(status) = 'open'
            `);

            openTickets = ticketsResult.rows[0].open_tickets;
        } catch (ticketError) {
            console.log("Tickets table not available yet:", ticketError.message);
        }

        res.json({
            totalEmployees: employeesResult.rows[0].total_employees,
            presentToday: attendanceResult.rows[0].present_today,
            pendingLeaves: leavesResult.rows[0].pending_leaves,
            openTickets: openTickets
        });

    } catch (error) {
        console.error("Error fetching dashboard data:", error);

        res.status(500).json({
            message: "Failed to fetch dashboard data"
        });
    }
});


        // =========================
// JOB / RECRUITMENT APIs
// =========================

// GET all jobs
app.get("/api/jobs", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                job_id,
                title,
                department,
                openings,
                experience,
                location,
                employment_type,
                status,
                created_at
            FROM public.jobs
            ORDER BY id DESC
        `);

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching jobs:", error);

        res.status(500).json({
            message: "Failed to fetch jobs"
        });
    }
});


// CREATE new job
app.post("/api/jobs", async (req, res) => {
    try {
        const {
            title,
            department,
            openings,
            experience,
            location,
            employment_type,
            job_description,
            skills,
            compensation
        } = req.body;

        if (!title || !department || !openings || !location) {
            return res.status(400).json({
                message: "Please provide all required job details"
            });
        }

        const jobIdResult = await pool.query(`
            SELECT
                'JOB' ||
                LPAD(
                    (COALESCE(MAX(id), 0) + 1)::text,
                    3,
                    '0'
                ) AS job_id
            FROM public.jobs
        `);

        const jobId = jobIdResult.rows[0].job_id;

        const result = await pool.query(
            `
            INSERT INTO public.jobs
            (
                job_id,
                title,
                department,
                openings,
                experience,
                location,
                employment_type,
                job_description,
                skills,
                compensation,
                status
            )
            VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Open')
            RETURNING *
            `,
            [
                jobId,
                title,
                department,
                openings,
                experience,
                location,
                employment_type || "Full Time",
                job_description,
                skills,
                compensation
            ]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error("Error creating job:", error);

        res.status(500).json({
            message: "Failed to create job"
        });
    }
});



// =========================
// JOB APPLICATION APIs
// =========================

// Get all job applications
app.get("/api/job-applications", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT *
            FROM public.job_applications
            ORDER BY id DESC
        `);

        res.json(result.rows);

    } catch (error) {
        console.error("Error fetching job applications:", error);

        res.status(500).json({
            message: "Failed to fetch job applications"
        });
    }
});


app.post("/api/job-applications", async (req, res) => {
    try {
        const {
            job_id,
            candidate_name,
            email,
            phone,
            location,
            address,
            linkedin_url,
            github_url,
            portfolio_url,
            highest_education,
            college,
            graduation_year,
            cgpa_percentage,
            candidate_type,
            current_company,
            current_designation,
            total_experience,
            current_ctc,
            expected_ctc,
            notice_period,
            joining_date,
            skills,
            certifications,
            project_name,
            project_description,
            technologies_used,
            resume_url,
            willing_to_relocate,
            why_join,
            why_suitable,
            cover_letter,
            source,
            declaration
        } = req.body;

        if (!job_id || !candidate_name || !email) {
            return res.status(400).json({
                message: "Job ID, candidate name and email are required"
            });
        }

        const applicationIdResult = await pool.query(`
            SELECT
                'APP' ||
                LPAD(
                    (COALESCE(MAX(id), 0) + 1)::text,
                    3,
                    '0'
                ) AS application_id
            FROM public.job_applications
        `);

        const applicationId =
            applicationIdResult.rows[0].application_id;

        const result = await pool.query(
            `
            INSERT INTO public.job_applications
            (
                application_id,
                job_id,
                candidate_name,
                email,
                phone,
                location,
                address,
                linkedin_url,
                github_url,
                portfolio_url,
                highest_education,
                college,
                graduation_year,
                cgpa_percentage,
                candidate_type,
                current_company,
                current_designation,
                total_experience,
                current_ctc,
                expected_ctc,
                notice_period,
                joining_date,
                skills,
                certifications,
                project_name,
                project_description,
                technologies_used,
                resume_url,
                willing_to_relocate,
                why_join,
                why_suitable,
                cover_letter,
                source,
                declaration,
                status
            )
            VALUES
            (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                $31, $32, $33, $34, 'Applied'
            )
            RETURNING *
            `,
            [
                applicationId,
                job_id,
                candidate_name,
                email,
                phone || null,
                location || null,
                address || null,
                linkedin_url || null,
                github_url || null,
                portfolio_url || null,
                highest_education || null,
                college || null,
                graduation_year || null,
                cgpa_percentage || null,
                candidate_type || null,
                current_company || null,
                current_designation || null,
                total_experience || null,
                current_ctc || null,
                expected_ctc || null,
                notice_period || null,
                joining_date || null,
                skills || null,
                certifications || null,
                project_name || null,
                project_description || null,
                technologies_used || null,
                resume_url || null,
                willing_to_relocate ?? false,
                why_join || null,
                why_suitable || null,
                cover_letter || null,
                source || null,
                declaration ?? false
            ]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error("Error creating job application:", error);

        res.status(500).json({
            message: "Failed to create job application"
        });
    }
});

// Update application status
app.put("/api/job-applications/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                message: "Status is required"
            });
        }

        const result = await pool.query(
            `
            UPDATE public.job_applications
            SET status = $1
            WHERE id = $2
            RETURNING *
            `,
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Application not found"
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error("Error updating application status:", error);

        res.status(500).json({
            message: "Failed to update application status"
        });
    }
});



// ================================
// RESUME UPLOAD
// ================================

app.post("/api/upload-resume", upload.single("resume"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: "Resume file is required",
            });
        }

        const fileExtension = req.file.originalname.split(".").pop();

        const fileName = `resume-${Date.now()}.${fileExtension}`;
        
        const { error } = await supabase.storage
            .from("resumes")
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false,
            });

        if (error) {
            console.error("Supabase upload error:", error);

            return res.status(500).json({
                message: "Failed to upload resume",
            });
        }

        const { data } = supabase.storage
            .from("resumes")
            .getPublicUrl(fileName);

        res.status(200).json({
            message: "Resume uploaded successfully",
            resume_url: data.publicUrl,
        });

    } catch (error) {
        console.error("Resume upload error:", error);

        res.status(500).json({
            message: "Server error while uploading resume",
        });
    }
});


app.post("/api/login", async (req, res) => {
  try {
    const { employee_id, password } = req.body;

    if (!employee_id || !password) {
      return res.status(400).json({
        message: "Employee ID and password are required",
      });
    }

    const result = await pool.query(
      `SELECT *
       FROM employees
       WHERE employee_id = $1`,
      [employee_id.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid employee ID or password",
      });
    }

    const employee = result.rows[0];

    if (employee.access_disabled === true) {
      return res.status(403).json({
        message: "Your account has been disabled. Please contact HR.",
      });
    }

    // Compare plain password with bcrypt hash
    const passwordMatch = await bcrypt.compare(
      password,
      employee.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid employee ID or password",
      });
    }

    return res.status(200).json({
      message: "Login successful",
      employee: employee,
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      message: "Server error during login",
    });
  }
});
// =========================
// SERVER
// =========================

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`HRMS Backend running on port ${PORT}`);
});