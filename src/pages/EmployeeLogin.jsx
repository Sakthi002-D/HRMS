import { useNavigate } from "react-router-dom";
import { useState } from "react";
import "./HRLogin.css";

function EmployeeLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();

    
        if (username === "EMP001" && password === "1234") {
        navigate("/hr-employee-dashboard");
        }else {
            alert("Invalid username or password. Please try again.");
        }
  };

  return (
    <div className="login-page">

      <div className="login-container">

        <img
          src="/SC logo.png"
          alt="Shelter Group"
          className="logo"
        />

        <h1>Employee Login</h1>

        <form onSubmit={handleLogin}>

          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit" className="login-submit">
            Login
          </button>

        </form>

      </div>

    </div>
  );
}

export default EmployeeLogin;