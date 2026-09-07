import { useEffect, useState } from "react";
import { ArrowLeft, Building2, Users, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./DepartmentOverview.css";

function DepartmentOverview() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("http://localhost:5000/api/dashboard/departments")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load department data");
        return response.json();
      })
      .then(setDepartments)
      .catch(() => setError("Department data could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const totalEmployees = departments.reduce(
    (total, department) => total + department.employee_count,
    0
  );

  return (
    <DashboardLayout>
      <div className="department-overview">
        <header className="department-overview-header">
          <div>
            <Link className="department-back-link" to="/hr-dashboard">
              <ArrowLeft size={16} /> Back to dashboard
            </Link>
            <p className="department-eyebrow">WORKFORCE STRUCTURE</p>
            <h1>Department Overview</h1>
            <p className="department-intro">
              See how active employees are distributed across the organization.
            </p>
          </div>
          <div className="department-header-icon" aria-hidden="true">
            <Building2 size={27} />
          </div>
        </header>

        <section className="department-flow" aria-label="Department employee flow chart">
          <div className="department-flow-root">
            <div className="department-flow-icon"><Users size={22} /></div>
            <div>
              <span>Active workforce</span>
              <strong>{loading ? "..." : totalEmployees}</strong>
              <small>employees across the organization</small>
            </div>
          </div>

          <div className="department-flow-line" aria-hidden="true" />

          {loading ? (
            <div className="department-empty">Loading department data...</div>
          ) : error ? (
            <div className="department-empty department-error">{error}</div>
          ) : departments.length === 0 ? (
            <div className="department-empty">No active department data available.</div>
          ) : (
            <div className="department-nodes">
              {departments.map((department, index) => {
                const percentage = totalEmployees
                  ? Math.round((department.employee_count / totalEmployees) * 100)
                  : 0;

                return (
                  <article className={`department-node node-${index % 5}`} key={department.department}>
                    <div className="department-node-connector" aria-hidden="true" />
                    <div className="department-node-top">
                      <span className="department-node-icon"><UserRound size={18} /></span>
                      <span className="department-percentage">{percentage}%</span>
                    </div>
                    <h2>{department.department}</h2>
                    <strong>{department.employee_count}</strong>
                    <span>active employees</span>
                    <div className="department-progress" aria-hidden="true">
                      <span style={{ width: `${percentage}%` }} />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

export default DepartmentOverview;
