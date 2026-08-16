
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Attendance.css"

function Attendance() {
    const attendanceData= [
        {
            employeeID: "EMP001",
            employeeName: "Sakthivel",
            department: "IT",
            date: "14 Aug 2026",
            punchIn: "09:02",
            punchOut: "18:15",
            shiftStart: "09:00",
            shiftEnd: "18:00",
            break: 45,
            status: "Present",
            project: "HRMS Portal",
        },

        {
            employeeID: "EMP002",
            employeeName: "Sundhar",
            department: "IT",
            date: "14 Aug 2026",
            punchIn: "09:12",
            punchOut: "18:00",
            shiftStart: "09:00",
            shiftEnd: "18:00",
            break :"32min",
            status: "Present",
            project: "HRMS Portal",
        },

        {
            employeeID: "EMP003",
            employeeName: "John Doe",
            department: "IT",
            date: "14 Aug 2026",
            punchIn: "09:22",
            punchOut: "17:20",
            shiftStart: "09:00",
            shiftEnd: "18:00",
            break :"22min",
            status: "Present",
            project: "HRMS Portal",
        },
    ];
    return(
        <DashboardLayout>

        <div className="attendance-page">

            {/*Page Header*/}
            <div className="attendance-header">

                <div>
                    <h1>Attendance</h1>
                    <p>Manage Employee Attendance</p>
                </div>

            </div>

            {/*Attendance Summary*/}

            <div className="attendance-summary">

                {/*Card 1*/}

                <div className="attendance-card">
                    <h3>Total Hours Today</h3>
                    <h2>8.3 / 9</h2>
                    <p>Today's working hours</p>
                </div>

                <div className="attendance-card">
                    <h3>Total Hours Week</h3>
                    <h2>10 / 40</h2>
                    <p>This week's  working hours</p>
                </div>

                <div className="attendance-card">
                    <h3>Total Hours Month</h3>
                    <h2>75 / 98 </h2>
                    <p>This month's working hours</p>
                </div>

                <div className="attendance-card">
                    <h3>Overtime this Month</h3>
                    <h2>16 / 28</h2>
                    <p>This month's working hours</p>
                </div>
            </div>
        
            <div className="attendance-table-container">

                <table className="attendance-table">

                    <thead>
                        <tr>
                            <th>Employee  ID</th>
                            <th>Employee Name</th>
                            <th>Department</th>
                            <th>Date</th>
                            <th>Punch In</th>
                            <th>Status</th>
                            <th>Punch Out</th>
                            <th>Break</th>
                            <th>Shift</th>
                            <th>Project</th>
                        </tr>
                    </thead>

                  <tbody>
                    {attendanceData.map((employee) => (

                        <tr key={employee.employeeID}>

                            <td>{employee.employeeID}</td>

                            <td>{employee.employeeName}</td>

                            <td>{employee.department}</td>

                            <td>{employee.date}</td>

                            <td>{employee.punchIn}</td>

                            <td>
                                <span className="status present">
                                    {employee.status}
                                </span>
                            </td>

                            <td>{employee.punchOut}</td>

                            <td>{employee.break}</td>

                            <td>
                                {employee.shiftStart} - {employee.shiftEnd}
                            </td>

                            <td>{employee.project}</td>

                        </tr>
                    ))}
                  </tbody>

                </table>
            </div>

        </div>
    </DashboardLayout>
    );
}

export default Attendance;