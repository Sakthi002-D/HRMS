import { useState } from "react";
import "./Employees.css";

function Employees() {
    const [employees, setEmployees] = useState ([
        {
            id: "EMP001",
            name: "Sakthivel",
            designation: "Web Developer",
            department: "IT",
            email: "sakthive@company.com",
            phone: "123-456-7890",
            status: "Active",
        },

        {
            id: "EMP002",
            name: "Sundhar",
            designation: "Web Developer",
            department: "IT",
            email: "sundhar@company.com",
            phone: "123-456-7890",
            status: "Inactive",
        },

        {
            id: "EMP003",
            name: "John Doe",
            designation: "Web Developer",
            department: "IT",
            email: "John.doe@company.com",
            phone: "123-456-7890",
            status: "Active",
        },
    ]);

    const [search, setSearch] = useState("");

    const filteredEmployees = employees.filter((employee) =>
    employee.name.toLowerCase().includes(search.toLowerCase()) ||
    employee.id.toLowerCase().includes(search.toLowerCase()) ||
    employee.department.toLowerCase().includes(search.toLowerCase())
);


const deleteEmployee = (id) => {

    const confirmDelete = window.confirm(
        "Are you sure you want to delete this employee?"
    );

    if (confirmDelete) {
        setEmployees(
            employees.filter((employee) => employee.id !== id)
        );
    }
};

  return (
    <div className="employees-page">

      {/* Page Header */}
      <div className="employees-header">

        <div>
          <h1>Employees</h1>
          <p>Manage all company employees</p>
        </div>

        <button className="add-employee-btn">
          + Add Employee
        </button>

      </div>


      {/* Search */}
      <div className="employee-tools">

        <input
          type="text"
          placeholder="Search employee..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

      </div>


      {/* Employee Table */}
      <div className="employee-table-container">

        <table className="employee-table">

          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Designation</th>
              <th>Department</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>

            {filteredEmployees.map((employee) => (

              <tr key={employee.id}>

                <td>{employee.id}</td>

                <td>{employee.name}</td>

                <td>{employee.designation}</td>

                <td>{employee.department}</td>

                <td>{employee.email}</td>

                <td>{employee.phone}</td>

                <td>
                  <span
                    className={
                      employee.status === "Active"
                        ? "status active"
                        : "status inactive"
                    }
                  >
                    {employee.status}
                  </span>
                </td>

                <td>
                  <button className="edit-btn">
                    Edit
                  </button>

                  <button
                    className="delete-btn"
                    onClick={() => deleteEmployee(employee.id)}
                  >
                    Delete
                  </button>
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}

export default Employees;

