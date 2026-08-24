import express from "express";
import cors from "cors";
import pool from "./db.js";

const app = express();

app.use(cors());
app.use(express.json());

// Test API
app.get("/", (req, res) => {
    res.json({
        message: "HRMS Backend is running",
    });
});


// =========================
// ATTENDANCE APIs
// =========================

// Get all attendance records
app.get("/api/attendance", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                a.id, 
                a.employee_id, 
                e.name AS employee_name, 
                e.department, 
                a.attendance_date, 
                a.punch_in, 
                a.status, 
                a.punch_out, 
                a.break_minutes, 
                a.shift, 
                a.project 
            FROM attendance a 
            JOIN employees e 
                ON a.employee_id = e.employee_id 
            ORDER BY a.attendance_date DESC, a.id ASC`
        );

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
            department,
            designation,
            email,
            phone,
            joining_date,
            status
        } = req.body;

        const result = await pool.query(
            `UPDATE employees 
             SET
                employee_id = $1,
                name = $2,
                department = $3,
                designation = $4,
                email = $5,
                phone = $6,
                joining_date = $7,
                status = $8
             WHERE employee_id = $9
             RETURNING *`,
            [
                employee_id,
                name,
                department,
                designation,
                email,
                phone,
                joining_date,
                status,
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

// Get all leave requests
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



app.put("/api/leaves/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const result = await pool.query(
            `UPDATE leaves
             SET status = $1
             WHERE id = $2
             RETURNING *`,
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Leave not found"
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error("Error updating leave status:", error);

        res.status(500).json({
            message: "Failed to update leave status"
        });
    }
});


// =========================
// SERVER
// =========================

const PORT = 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});