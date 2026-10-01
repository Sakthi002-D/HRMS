// Same navbar as the landing page (logo + Login), for the public Careers pages.
import { Link } from "react-router-dom";
import "../../pages/Home.css";

function CareersHeader() {
    return (
        <nav className="navbar">
            <div className="logo-section">
                <Link to="/" aria-label="Shelter Group home">
                    <img className="logo" src="/shelter logo.png" alt="Shelter Group" />
                </Link>
            </div>

            <div className="nav-buttons">
                <Link to="/login" className="login-btn">
                    Login
                </Link>
            </div>
        </nav>
    );
}

export default CareersHeader;
