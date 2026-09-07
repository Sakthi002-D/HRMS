import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./VerifyOTP.css";

const API_URL = "http://localhost:5000";

function VerifyOTP() {
  const navigate = useNavigate();

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const employeeId = localStorage.getItem("resetEmployeeId");

  const handleVerifyOTP = async (e) => {
    e.preventDefault();

    if (!otp.trim()) {
      alert("Please enter OTP");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/verify-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            employee_id: employeeId,
            otp: otp.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Invalid OTP");
        return;
      }

      localStorage.setItem("otpVerified", "true");

      navigate("/reset-password");

    } catch (error) {
      console.error("OTP verification error:", error);
      alert("Unable to connect to backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="verify-otp-page">
      <div className="verify-otp-card">

        <div className="verify-otp-icon">
          📩
        </div>

        <h1>Verify OTP</h1>

        <p>
          Enter the 6-digit OTP sent to your registered email.
        </p>

        <form onSubmit={handleVerifyOTP}>

          <label>OTP</label>

          <input
            type="text"
            maxLength="6"
            placeholder="Enter 6-digit OTP"
            value={otp}
            onChange={(e) =>
              setOtp(e.target.value.replace(/\D/g, ""))
            }
          />

          <button
            type="submit"
            disabled={loading}
          >
            {loading ? "Verifying..." : "Verify OTP"}
          </button>

        </form>

        <button
          className="back-login-btn"
          onClick={() => navigate("/forgot-password")}
        >
          ← Back
        </button>

      </div>
    </div>
  );
}

export default VerifyOTP;