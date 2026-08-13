
import "./Employees.css";
function Employees() {
    return(
        <div className="employes-page">

            <div className="employees-header">
                
                    <div>
                        <h1>Employees</h1>
                        <p>Manage all company employees</p>
                    </div>


                    <button className="add-employee-btn">
                        + Add Employee
                    </button>
            </div>

                <div className="employees-card">
                    
                    <table className="employees-table">
                        <thead>
                            <tr>
                                <th>Employee ID</th>
                                <th>Name</th>
                                <th>Designation</th>
                                <th>Department</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Status</th>
                            </tr>
                        </thead>

                        <tbody>
                            <tr>
                                <td>EMP001</td>
                                <td>Sakthivel</td>
                                <td>Web Developer</td>
                                <td>IT</td>
                                <td>sakthivel@company.com</td>
                                <td>123-456-7890</td>
                                <td>
                                    <span className="active-status">Active</span>
                                </td>
                            </tr>

                            <tr>
                                <td>EMP002</td>
                                <td>Sundhar</td>
                                <td>Software Engineer</td>
                                <td>IT</td>
                                <td>sundhar.@company.com</td>
                                <td>098-765-4321</td>
                                <td>
                                    <span className="inactive-status">Inactive</span>
                                </td>
                            </tr>

                            <tr>
                                <td>EMP003</td>
                                <td>John Doe</td>
                                <td>Project Manager</td>
                                <td>IT</td>
                                <td>john.doe@company.com</td>
                                <td>111-222-3333</td>
                                <td>
                                    <span className="active-status">Active</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
    );

}

export default Employees;
                               