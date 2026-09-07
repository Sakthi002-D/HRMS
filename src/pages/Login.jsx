import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

const API_URL = "http://localhost:5000";

function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ==================================================
  // IF USER IS ALREADY LOGGED IN
  // ==================================================
  useEffect(() => {
    const hrSession = sessionStorage.getItem("loggedInHR");
    const employeeSession =
      sessionStorage.getItem("loggedInEmployee");

    if (hrSession) {
      navigate("/hr-dashboard", { replace: true });
      return;
    }

    if (employeeSession) {
      navigate("/employee-dashboard", { replace: true });
    }
  }, [navigate]);

  // ==================================================
  // LOGIN
  // ==================================================
  const handleLogin = async (e) => {
    e.preventDefault();

    const employeeId = username.trim();
    const userPassword = password;

    if (!employeeId || !userPassword) {
      alert("Please enter Employee ID and password");
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
          employee_id: employeeId,
          password: userPassword,
        }),
      });

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch (error) {
        console.error("Backend returned non-JSON:", text);

        alert(
          `Login API error (${response.status}). Check backend /api/login route.`
        );

        return;
      }

      if (!response.ok) {
        alert(
          data.message || "Invalid username or password"
        );
        return;
      }

      const employee = data.employee;

      if (!employee) {
        alert("Employee details not received from server");
        return;
      }

      // ==================================================
      // CLEAR OLD LOGIN SESSIONS
      // ==================================================
      sessionStorage.removeItem("loggedInEmployee");
      sessionStorage.removeItem("loggedInHR");

      // ==================================================
      // GET ROLE
      // ==================================================
      const role = String(employee.role || "")
        .trim()
        .toLowerCase();

      console.log("Logged in user:", employee);
      console.log("User role:", role);

      // ==================================================
      // HR LOGIN
      // ==================================================
      if (role === "hr") {
        sessionStorage.setItem(
          "loggedInHR",
          JSON.stringify(employee)
        );

        // IMPORTANT: replace login history
        navigate("/hr-dashboard", {
          replace: true,
        });

        return;
      }

      // ==================================================
      // EMPLOYEE LOGIN
      // ==================================================
      if (role === "employee") {
        sessionStorage.setItem(
          "loggedInEmployee",
          JSON.stringify(employee)
        );

        navigate("/employee-dashboard", {
          replace: true,
        });

        return;
      }

      // ==================================================
      // UNKNOWN ROLE
      // ==================================================
      alert(
        `Invalid role "${employee.role}". Please contact administrator.`
      );

    } catch (error) {
      console.error("Login error:", error);

      alert(
        "Unable to connect to backend. Please make sure the server is running."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">

      {/* LEFT SIDE */}
      <div className="login-left">

        <div className="login-brand">
          <img
            src="/SC logo.png"
            alt="Shelter Group"
          />

          <span>SHELTER GROUP</span>
        </div>

        <div className="login-left-content">

          <p className="login-welcome">
            WELCOME TO SHELTER GROUP
          </p>

          <h1>
            Empowering people
            <br />
            through smarter HR
            <br />
            management.
          </h1>

          <p>
            Manage your workforce, streamline HR
            operations, and keep everything connected
            in one centralized platform.
          </p>

        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="login-right">

        <div className="login-card">

          <img
            className="login-logo"
            src="/SC logo.png"
            alt="Shelter Group"
          />

          <h2>Sign In</h2>

          <p className="login-subtitle">
            Please enter your login details
          </p>

          <form onSubmit={handleLogin}>

            {/* USERNAME */}
            <label>
              Username / Employee ID
            </label>

            <div className="login-input-box">

              <input
                type="text"
                placeholder="Enter username or employee ID"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value)
                }
                autoComplete="username"
                required
              />

            </div>

            {/* PASSWORD */}
            <label>
              Password
            </label>

            <div className="login-input-box password-input">

              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                autoComplete="current-password"
                required
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword(
                    (prev) => !prev
                  )
                }
              >
                {showPassword ? "Hide" : "Show"}
              </button>

            </div>

            {/* LOGIN BUTTON */}
            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading
                ? "Signing In..."
                : "Sign In"}
            </button>

          </form>

          {/* FORGOT PASSWORD */}
          <button
            type="button"
            className="forgot-password-link"
            onClick={() =>
              navigate("/forgot-password")
            }
          >
            Forgot Password?
          </button>

          <p className="login-footer">
            HRMS - Human Resource Management System
          </p>

          <p className="login-copyright">
            © 2026 Shelter Group. All rights reserved.
          </p>

        </div>

      </div>

    </div>
  );
}

export default Login;