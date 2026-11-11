import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarCheck, Eye, EyeOff, Info, Loader2, LockKeyhole, ShieldCheck, UserRound, Users } from "lucide-react";
import "./Login.css";
import API_URL from "../config/api";
import { useAlert } from "../components/common/dialog/dialogContext";
import { clearStaleSession, storeAuthToken } from "../utils/auth";

function Login() {
  const showAlert = useAlert();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ==================================================
  // IF USER IS ALREADY LOGGED IN
  // ==================================================
  useEffect(() => {
    clearStaleSession();
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
      showAlert("Please enter Employee ID and password");
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
      } catch {
        console.error("Backend returned non-JSON:", text);

        showAlert(
          `Login API error (${response.status}). Check backend /api/login route.`
        );

        return;
      }

      if (!response.ok) {
        showAlert(
          data.message || "Invalid username or password"
        );
        return;
      }

      const employee = data.employee;

      if (!employee) {
        showAlert("Employee details not received from server");
        return;
      }

      // ==================================================
      // CLEAR OLD LOGIN SESSIONS
      // ==================================================
      sessionStorage.removeItem("loggedInEmployee");
      sessionStorage.removeItem("loggedInHR");
      storeAuthToken(data.token);

      // ==================================================
      // GET ROLE
      // ==================================================
      const role = String(data.role || "")
        .trim()
        .toLowerCase();
      employee.role = role;

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

        // IMPORTANT: replace login history (same as HR)
        navigate("/employee-dashboard", {
          replace: true,
        });

        return;
      }

      // ==================================================
      // UNKNOWN ROLE
      // ==================================================
      showAlert(
        `Invalid role "${employee.role}". Please contact administrator.`
      );

    } catch (error) {
      console.error("Login error:", error);

      showAlert(
        "Unable to connect to backend. Please make sure the server is running."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lg-page">

      {/* LEFT: brand panel (same dark banner as the portals) */}
      <aside className="lg-brand">
        <Link to="/" className="lg-logo" aria-label="Shelter Group home">
          <img src="/SC logo.png" alt="" />
          <span>SHELTER GROUP</span>
        </Link>

        <div className="lg-brand-copy">
          <span className="lg-kicker">Welcome to Shelter Group</span>
          <h1>
            Empowering people through <em>smarter HR</em> management.
          </h1>
          <p>
            Manage your workforce, streamline HR operations and keep
            everything connected in one centralized platform.
          </p>

          <ul className="lg-points">
            <li>
              <span><Users size={18} aria-hidden="true" /></span>
              <div>
                <strong>HR portal</strong>
                <small>Employees, approvals, recruitment and payroll</small>
              </div>
            </li>
            <li>
              <span><CalendarCheck size={18} aria-hidden="true" /></span>
              <div>
                <strong>Employee self-service</strong>
                <small>Leave, attendance, payslips and documents</small>
              </div>
            </li>
            <li>
              <span><ShieldCheck size={18} aria-hidden="true" /></span>
              <div>
                <strong>Secure access</strong>
                <small>Your account, your data, protected sign-in</small>
              </div>
            </li>
          </ul>
        </div>

        <p className="lg-brand-foot">© 2026 Shelter Group. All rights reserved.</p>
      </aside>

      {/* RIGHT: sign-in card */}
      <main className="lg-main">
        <Link to="/" className="lg-back">
          <ArrowLeft size={16} aria-hidden="true" /> Back to home
        </Link>

        <div className="lg-card">
          <img className="lg-card-logo" src="/SC logo.png" alt="Shelter Group" />

          <h2>Welcome back</h2>
          <p className="lg-sub">Sign in to your Shelter Group HRMS account</p>

          <form onSubmit={handleLogin} className="lg-form">

            <div className="lg-field">
              <label htmlFor="login-username">Username / Employee ID</label>
              <div className="lg-input">
                <UserRound size={17} aria-hidden="true" />
                <input
                  id="login-username"
                  type="text"
                  placeholder="e.g. EMP3544"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  dir="ltr"
                  required
                />
              </div>
            </div>

            <div className="lg-field">
              <div className="lg-label-row">
                <label htmlFor="login-password">Password</label>
                <button
                  type="button"
                  className="lg-link"
                  onClick={() => navigate("/forgot-password")}
                >
                  Forgot password?
                </button>
              </div>
              <div className="lg-input">
                <LockKeyhole size={17} aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  dir="ltr"
                  required
                />
                <button
                  type="button"
                  className="lg-eye"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button type="submit" className="lg-submit" disabled={loading}>
              {loading ? (
                <><Loader2 size={18} className="lg-spin" aria-hidden="true" /> Signing in...</>
              ) : (
                <>Sign In <ArrowRight size={18} aria-hidden="true" /></>
              )}
            </button>

          </form>

          <p className="lg-hint">
            <Info size={14} aria-hidden="true" />
            Employees sign in with EMP + employee ID (for example EMP3544).
          </p>

          <div className="lg-card-foot">
            <span>HRMS · Human Resource Management System</span>
            <Link to="/careers">Looking for a job? View careers</Link>
          </div>
        </div>
      </main>

    </div>
  );
}

export default Login;
