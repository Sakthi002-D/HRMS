import "./App.css";

function App() {
  return (
    <div className="home">

      <nav className="navbar">
        <img className="logo" src="/shelter logo.png" alt="Shelter Group" />
       <div className="hero-buttons">
            <button className="hr-btn">HR Login</button>
            <button className="employee-btn">Employee Login</button>
       </div>
        
      </nav>

      <section className="hero">
        <div className="hero-content">
          <h1> HRMS - Human Resource Management System</h1>

          <p>
            A centralized platform to manage employees, attendance,
            leave, payroll, and other HR activities efficiently.
          </p>

        </div>
      </section>

      <section className="features">
        <h2>HRMS Features</h2>

        <div className="feature-container">

          <div className="feature-card">
            <h3>Attendance</h3>
            <p>Monitor employee attendance and working hours.</p>
          </div>

          <div className="feature-card">
            <h3>Leave Management</h3>
            <p>Manage leave requests, balance and eligibility.</p>
          </div>

          <div className="feature-card">
            <h3>Payroll</h3>
            <p>Manage payroll-related employee information.</p>
          </div>

          <div className="feature-card">
            <h3>Ticketing</h3>
            <p>Manage employee requests and support tickets.</p>
          </div>

        </div>
      </section>

    </div>
  );
}

export default App;