import { useNavigate } from "react-router-dom";
import { useState } from "react";
import "./HRLogin.css";

function HRLogin() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();

    if (username === "admin" && password === "1234") {
      navigate("/hr-dashboard");
    } else {
      alert("Invalid username or password. Please try again.");
    }
  };

  return (
    <div className="hr-login-page">

      {/* LEFT SIDE */}
      <div className="hr-login-left">

        <div className="brand">
          <img src="/SC logo.png" alt="Shelter Group" />
          <span>SHELTER GROUP</span>
        </div>

        <div className="left-content">
          <p className="welcome-text">WELCOME TO SHELTER GROUP</p>

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
            Please enter your details to sign in
          </p>

          <form onSubmit={handleLogin}>

            <label>Username</label>

            <div className="input-box">
              <input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>


            <label>Password</label>

            <div className="input-box password-box">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>


            <div className="login-options">

              <label className="remember">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                className="forgot-password"
                onClick={() => alert("Please contact HR administrator.")}
              >
                Forgot Password?
              </button>

            </div>


            <button type="submit" className="sign-in-btn">
              Sign In
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