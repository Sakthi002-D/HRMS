import { Link } from "react-router-dom";
import { Briefcase, CalendarDays, Clock3, DoorOpen, FileBarChart, UserPlus, UserRound, Wallet } from "lucide-react";
import "./Home.css";

// Modules shown in the bottom photo strip
const MODULES = [
  { label: "RECRUITMENT", Icon: UserPlus },
  { label: "ATTENDANCE", Icon: Clock3 },
  { label: "LEAVE", Icon: CalendarDays },
  { label: "PAYROLL", Icon: Wallet },
  { label: "RESIGNATION", Icon: DoorOpen },
  { label: "REPORTS", Icon: FileBarChart },
];

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
        <Link to="/login" className="login-btn">
            Login
        </Link>

          <Link to="/careers">
            <button className="career-btn">Careers</button>
          </Link>
        </div>

      </nav>


      {/* Hero Section */}
      <section className="hero">

        {/* Background video (the skyline photo shows while it loads) */}
        <video
          className="hero-video"
          autoPlay
          muted
          loop
          playsInline
          poster="/images/home-hero.jpeg"
          aria-hidden="true"
        >
          <source src="/videos/home-hero.mp4" type="video/mp4" />
        </video>
        <div className="hero-video-overlay" aria-hidden="true" />

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

        </div>

      </section>


      {/* Our portals (middle photo strip) */}
      <section className="features">

        <div className="home-section-title">
          <span className="title-line" />
          <h2>OUR PORTALS</h2>
          <span className="title-line" />
        </div>

        <div className="portal-cards">

          <div className="portal-col">
            <div className="portal-circle">
              <Briefcase size={34} strokeWidth={1.4} />
            </div>
            <div className="portal-box">
              <h3>HR<br />PORTAL</h3>
              <p>
                Manage employees, approvals, recruitment,
                attendance and payroll from one place.
              </p>
            </div>
          </div>

          <div className="portal-col">
            <div className="portal-circle">
              <UserRound size={34} strokeWidth={1.4} />
            </div>
            <div className="portal-box">
              <h3>EMPLOYEE<br />PORTAL</h3>
              <p>
                Apply for leave, view payslips and request
                certificates anytime.
              </p>
            </div>
          </div>

        </div>

      </section>





      {/* What you can manage (bottom photo strip) */}
      <section className="cta-band">

        <div className="home-section-title">
          <span className="title-line" />
          <h2>WHAT YOU CAN MANAGE</h2>
          <span className="title-line" />
        </div>

        <div className="module-row">
          {MODULES.map(({ label, Icon }) => (
            <div className="module-item" key={label}>
              <div className="module-circle">
                <Icon size={26} strokeWidth={1.4} />
              </div>
              <span>{label}</span>
            </div>
          ))}
        </div>

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