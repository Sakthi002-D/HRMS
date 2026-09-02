import { useNavigate } from "react-router-dom";
import { useState } from "react";
import "./EmployeeLogin.css";

function EmployeeLogin() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();

    // Keep your existing employee login credentials here
    if (username && password) {
      // Change this route if your employee dashboard route is different
      navigate("/employee-dashboard");
    } else {
      alert("Please enter username and password.");
    }
  };

  return (
    <div className="employee-login-page">

      {/* LEFT SIDE */}
      <div className="employee-login-left">

        <div className="employee-brand">
          <img
            src="/SC logo.png"
            alt="Shelter Group"
          />

          <span>SHELTER GROUP</span>
        </div>

        <div className="employee-left-content">

          <p className="employee-welcome">
            WELCOME TO SHELTER GROUP
          </p>

          <h1>
            Empowering employees
            <br />
            through smarter HR
            <br />
            management.
          </h1>

          <p className="employee-description">
            Access your employee portal, manage attendance,
            leave requests, and stay connected with HR activities
            from one centralized platform.
          </p>

        </div>

        <div className="employee-circle employee-circle-one"></div>
        <div className="employee-circle employee-circle-two"></div>

      </div>


      {/* RIGHT SIDE */}
      <div className="employee-login-right">

        <div className="employee-login-box">

          <img
            className="employee-login-logo"
            src="/SC logo.png"
            alt="Shelter Group"
          />

          <h2>Employee Sign In</h2>

          <p className="employee-login-subtitle">
            Please enter your details to sign in
          </p>


          <form onSubmit={handleLogin}>

            <label>Username</label>

            <div className="employee-input-box">
              <input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>


            <label>Password</label>

            <div className="employee-input-box employee-password-box">

              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button
                type="button"
                className="employee-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>

            </div>


            <div className="employee-login-options">

              <label className="employee-remember">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                className="employee-forgot"
              >
                Forgot Password?
              </button>

            </div>


            <button
              type="submit"
              className="employee-sign-in-btn"
            >
              Sign In
            </button>

          </form>


          <p className="employee-hrms-text">
            HRMS - Human Resource Management System
          </p>

          <p className="employee-copyright">
            © 2026 Shelter Group. All rights reserved.
          </p>

        </div>

      </div>

    </div>
  );
}

export default EmployeeLogin;