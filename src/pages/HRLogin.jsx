import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./HRLogin.css";

const API_URL = "http://localhost:5000";

function HRLogin() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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

      if (!user) {
        alert("User details not found");
        return;
      }

      // Clear previous sessions
      sessionStorage.removeItem("loggedInEmployee");
      sessionStorage.removeItem("loggedInHR");

      const role = user.role?.toLowerCase();

      // =========================
      // HR LOGIN
      // =========================
      if (role === "hr") {
        sessionStorage.setItem(
          "loggedInHR",
          JSON.stringify(user)
        );

        navigate("/hr-dashboard", {
          replace: true,
        });

        return;
      }

      // =========================
      // EMPLOYEE LOGIN
      // =========================
      if (role === "employee") {
        sessionStorage.setItem(
          "loggedInEmployee",
          JSON.stringify(user)
        );

        navigate("/employee-dashboard", {
          replace: true,
        });

        return;
      }

      alert("Invalid user role. Please contact administrator.");

    } catch (error) {
      console.error("HR Login error:", error);
      alert("Unable to connect to backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hr-login-page">

      {/* LEFT SIDE */}
      <div className="hr-login-left">

        <div className="brand">
          <img
            src="/SC logo.png"
            alt="Shelter Group"
          />

          <span>SHELTER GROUP</span>
        </div>

        <div className="left-content">

          <p className="welcome-text">
            WELCOME TO SHELTER GROUP
          </p>

          <h1>
            Empowering people
            <br />
            through smarter HR
            <br />
            management.
          </h1>

          <p className="description">
            Manage your workforce, streamline HR operations,
            and keep everything connected in one centralized platform.
          </p>

        </div>

        <div className="circle circle-one"></div>
        <div className="circle circle-two"></div>

      </div>


      {/* RIGHT SIDE */}
      <div className="hr-login-right">

        <div className="login-box">

          <img
            className="login-logo"
            src="/SC logo.png"
            alt="Shelter Group"
          />

          <h2>HR Sign In</h2>

          <p className="login-subtitle">
            Please enter your HR credentials
          </p>


          <form onSubmit={handleLogin}>

            {/* USERNAME / EMPLOYEE ID */}

            <label>
              HR ID / Username
            </label>

            <div className="input-box">

              <input
                type="text"
                placeholder="Enter HR ID"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value)
                }
                required
              />

            </div>


            {/* PASSWORD */}

            <label>
              Password
            </label>

            <div className="input-box password-box">

              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                placeholder="Enter your password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword(!showPassword)
                }
              >
                {showPassword ? "Hide" : "Show"}
              </button>

            </div>


            {/* FORGOT PASSWORD */}

            <div className="login-options">

              <button
                type="button"
                className="forgot-password"
                onClick={() =>
                  navigate("/forgot-password")
                }
              >
                Forgot Password?
              </button>

            </div>


            {/* LOGIN BUTTON */}

            <button
              type="submit"
              className="sign-in-btn"
              disabled={loading}
            >
              {loading
                ? "Signing In..."
                : "Sign In"}
            </button>

          </form>


          <p className="hrms-text">
            HRMS - Human Resource Management System
          </p>

          <p className="copyright">
            © 2026 Shelter Group. All rights reserved.
          </p>

        </div>

      </div>

    </div>
  );
}

export default HRLogin;