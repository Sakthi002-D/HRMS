import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ResetPassword.css";

const API_URL = "http://localhost:5000";

function ResetPassword() {
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const employeeId = localStorage.getItem("resetEmployeeId");
  const otpVerified = localStorage.getItem("otpVerified");

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      alert("Please enter both passwords");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    if (!employeeId || otpVerified !== "true") {
      alert("OTP verification required");
      navigate("/forgot-password");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            employee_id: employeeId,
            new_password: newPassword,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Failed to reset password");
        return;
      }

      alert("Password reset successfully!");

      // Clear reset information
      localStorage.removeItem("resetEmployeeId");
      localStorage.removeItem("otpVerified");

      navigate("/login");

    } catch (error) {
      console.error("Reset password error:", error);
      alert("Unable to connect to backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reset-password-page">
      <div className="reset-password-card">

        <div className="reset-icon">
          🔐
        </div>

        <h1>Create New Password</h1>

        <p>
          Enter a new password for your HRMS account.
        </p>

        <form onSubmit={handleResetPassword}>

          <label>New Password</label>

          <input
            type="password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) =>
              setNewPassword(e.target.value)
            }
          />

          <label>Confirm Password</label>

          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) =>
              setConfirmPassword(e.target.value)
            }
          />

          <button
            type="submit"
            disabled={loading}
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>

        </form>

      </div>
    </div>
  );
}

export default ResetPassword;
