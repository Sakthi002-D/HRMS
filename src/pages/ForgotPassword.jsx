import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ForgotPassword.css";

const API_URL = "http://localhost:5000";

function ForgotPassword() {
  const navigate = useNavigate();

  const [employeeId, setEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendOTP = async (e) => {
    e.preventDefault();

    if (!employeeId.trim()) {
      alert("Please enter Employee ID");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/forgot-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            employee_id: employeeId.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Unable to send OTP");
        return;
      }

      alert(
        `OTP generated successfully.\nRegistered email: ${data.email}`
      );

      // Temporarily store Employee ID
      localStorage.setItem(
        "resetEmployeeId",
        employeeId.trim()
      );

      navigate("/verify-otp");

    } catch (error) {
      console.error("Forgot password error:", error);
      alert("Unable to connect to backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="forgot-password-page">
      <div className="forgot-password-card">

        <div className="forgot-icon">
          🔐
        </div>

        <h1>Forgot Password?</h1>

        <p>
          Enter your Employee ID to reset your password.
        </p>

        <form onSubmit={handleSendOTP}>

          <label>Employee ID</label>

          <input
            type="text"
            placeholder="Enter Employee ID"
            value={employeeId}
            onChange={(e) =>
              setEmployeeId(e.target.value)
            }
          />

          <button
            type="submit"
            disabled={loading}
          >
            {loading ? "Sending..." : "Send OTP"}
          </button>

        </form>

        <button
          className="back-login-btn"
          onClick={() => navigate("/login")}
        >
          ← Back to Login
        </button>

      </div>
    </div>
  );
}

export default ForgotPassword;