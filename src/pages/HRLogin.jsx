import { useNavigate } from "react-router-dom";
import { useState } from "react";
import "./HRLogin.css";

function HRLogin() {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");


    const handleLogin = (e) => {
        e.preventDefault();

        if (username === "admin" && password === "1234") {
        navigate("/hr-dashboard");
        }else {
            alert("Invalid username or password. Please try again.");
        }
    };


    return (
        <div className="login-page">
            <div className="login-container">

                <img
                className="logo"
                src="/SC logo.png"
                alt="Shelter Group" />
         
            <h1>HR Login</h1>

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
                <button type="submit" className="login-submit">Login</button>
            </form>


        </div>
        </div>
    );
}

export default HRLogin;
