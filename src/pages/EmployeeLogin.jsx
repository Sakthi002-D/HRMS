import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./EmployeeLogin.css";
import { useAlert } from "../components/common/dialog/dialogContext";
import { storeAuthToken } from "../utils/auth";
import API_URL from "../config/api";

function EmployeeLogin() {
    const showAlert = useAlert();
    const navigate = useNavigate();

    const [employeeId, setEmployeeId] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();

        if (!employeeId.trim() || !password.trim()) {
            showAlert("Please enter Employee ID and Password");
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
                    employee_id: employeeId.trim(),
                    password,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                showAlert(data.message || "Invalid Employee ID or Password");
                return;
            }

            if (data.role !== "employee" || !data.employee) {
                showAlert("This account does not have employee portal access.");
                return;
            }

            sessionStorage.removeItem("loggedInHR");
            sessionStorage.removeItem("loggedInEmployee");
            storeAuthToken(data.token);
            data.employee.role = data.role;
            sessionStorage.setItem(
                "loggedInEmployee",
                JSON.stringify(data.employee)
            );

            navigate("/employee-dashboard");

        } catch (error) {
            console.error("Employee login error:", error);
            showAlert("Unable to connect to backend");
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