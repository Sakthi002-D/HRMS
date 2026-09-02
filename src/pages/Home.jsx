import { Link } from "react-router-dom";
import "./Home.css";

function Home() {
  return (
    <div className="home">

      {/* Navbar */}
      <nav className="navbar">

        <div className="logo-section">
          <img
            className="logo"
            src="/shelter logo.png"
            alt="Shelter Group"
          />
        </div>

        <div className="nav-buttons">
          <Link to="/hr-login">
            <button className="hr-btn">HR Login</button>
          </Link>

          <Link to="/employee-login">
            <button className="employee-btn">Employee Login</button>
          </Link>

          <Link to="/candidate-jobs">
            <button className="career-btn">Careers</button>
          </Link>
        </div>

      </nav>


      {/* Hero Section */}
      <section className="hero">

        <div className="hero-content">

          <p className="welcome-text">
            WELCOME TO SHELTER GROUP
          </p>

          <h1>
            Human Resource
            <br />
            Management System
          </h1>

          <p className="hero-description">
            A centralized platform to manage employees, attendance,
            leave, payroll, recruitment and other HR activities efficiently.
          </p>

          <div className="hero-actions">

            <Link to="/hr-login">
              <button className="primary-btn">
                HR Login →
              </button>
            </Link>

            <Link to="/employee-login">
              <button className="secondary-btn">
                Employee Login
              </button>
            </Link>

          </div>

        </div>

      </section>


      {/* Features Section */}
      <section className="features">

        <div className="section-heading">
          <p>OUR HRMS PLATFORM</p>
          <h2>Everything You Need to Manage Your Workforce</h2>
          <span>
            Simple, centralized and efficient HR management.
          </span>
        </div>


        <div className="feature-container">

          <div className="feature-card">
            <div className="feature-icon">👥</div>
            <h3>Employees</h3>
            <p>
              Manage employee profiles, departments,
              designations and employee information.
            </p>
          </div>


          <div className="feature-card">
            <div className="feature-icon">🕒</div>
            <h3>Attendance</h3>
            <p>
              Monitor employee attendance, punch-in,
              punch-out and working hours.
            </p>
          </div>


          <div className="feature-card">
            <div className="feature-icon">📅</div>
            <h3>Leave Management</h3>
            <p>
              Manage leave requests, approvals,
              leave balance and eligibility.
            </p>
          </div>


          <div className="feature-card">
            <div className="feature-icon">💰</div>
            <h3>Payroll</h3>
            <p>
              Manage employee salary and
              payroll-related information.
            </p>
          </div>


          <div className="feature-card">
            <div className="feature-icon">🎫</div>
            <h3>Ticketing</h3>
            <p>
              Manage employee requests and
              HR support tickets efficiently.
            </p>
          </div>


          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Reports</h3>
            <p>
              Generate useful employee,
              attendance, leave and payroll reports.
            </p>
          </div>

        </div>

      </section>


      {/* CTA Section */}
      <section className="cta-section">

        <div>
          <h2>Manage Your Workforce Smarter</h2>

          <p>
            Access your HRMS portal and manage your
            workforce from one centralized platform.
          </p>
        </div>

        <Link to="/hr-login">
          <button className="cta-btn">
            Get Started →
          </button>
        </Link>

      </section>


      {/* Footer */}
      <footer className="footer">

        <div className="footer-logo">
          <img
            src="/shelter logo.png"
            alt="Shelter Group"
          />
        </div>

        <p>
          © 2026 Shelter Group. All rights reserved.
        </p>

        <p>
          HRMS - Human Resource Management System
        </p>

      </footer>

    </div>
  );
}

export default Home;