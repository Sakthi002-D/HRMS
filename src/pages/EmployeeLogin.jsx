import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./EmployeeLogin.css";

const API_URL = "https://hrms-cuoq.onrender.com";

function EmployeeLogin() {
    const navigate = useNavigate();

    const [employeeId, setEmployeeId] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();

        if (!employeeId.trim() || !password.trim()) {
            alert("Please enter Employee ID and Password");
            return;
        }

        try {
            setLoading(true);

            const response = await fetch(
                `${API_URL}/api/employees`
            );

            if (!response.ok) {
                throw new Error("Failed to fetch employees");
            }

            const employees = await response.json();

            const employee = employees.find(
                (item) =>
                    String(item.employee_id).toLowerCase() ===
                        employeeId.trim().toLowerCase() &&
                    String(item.password) === password
            );

            if (!employee) {
                alert("Invalid Employee ID or Password");
                return;
            }

            if (employee.status !== "Active") {
                alert("Your employee account is inactive");
                return;
            }

            localStorage.setItem(
                "loggedInEmployee",
                JSON.stringify(employee)
            );

            navigate("/employee-dashboard");

        } catch (error) {
            console.error("Employee login error:", error);
            alert("Unable to connect to backend");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="employee-login-page">
            <div className="employee-login-card">

                <div className="employee-login-icon">
                    👤
                </div>

                <h1>Employee Login</h1>

                <p className="employee-login-subtitle">
                    Login to access your HRMS account
                </p>

                <form onSubmit={handleLogin}>

                    {/* Employee ID */}
                    <div className="employee-input-group">
                        <label>Employee ID</label>

                        <input
                            type="text"
                            placeholder="Enter Employee ID"
                            value={employeeId}
                            onChange={(e) =>
                                setEmployeeId(e.target.value)
                            }
                        />
                    </div>

                    {/* Password */}
                    <div className="employee-input-group">
                        <label>Password</label>

                        <input
                            type="password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) =>
                                setPassword(e.target.value)
                            }
                        />
                    </div>

                    <button
                        type="submit"
                        className="employee-login-btn"
                        disabled={loading}
                    >
                        {loading
                            ? "Logging in..."
                            : "Login"}
                    </button>

                </form>

                <button
                    className="back-home-btn"
                    onClick={() => navigate("/")}
                >
                    ← Back to Home
                </button>

            </div>
        </div>
    );
}

export default EmployeeLogin;