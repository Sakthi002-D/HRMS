import { useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Tickets.css";

function Tickets() {
    const [search, setSearch] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("all");

    const [ticketData, setTicketData] = useState([
        {
            ticketID: "TKT001",
            employeeID: "EMP001",
            employeeName: "Sakthivel",
            subject: "System Login Issue",
            category: "IT Support",
            priority: "High",
            createdDate: "18 Aug 2026",
            status: "Open",
        },
        {
            ticketID: "TKT002",
            employeeID: "EMP002",
            employeeName: "Sundhar",
            subject: "Leave Balance Issue",
            category: "HR",
            priority: "Medium",
            createdDate: "17 Aug 2026",
            status: "In Progress",
        },
        {
            ticketID: "TKT003",
            employeeID: "EMP003",
            employeeName: "John Doe",
            subject: "Payroll Query",
            category: "Payroll",
            priority: "High",
            createdDate: "16 Aug 2026",
            status: "Resolved",
        },
        {
            ticketID: "TKT004",
            employeeID: "EMP004",
            employeeName: "Rahul",
            subject: "Laptop Request",
            category: "IT Support",
            priority: "Low",
            createdDate: "15 Aug 2026",
            status: "Open",
        },
    ]);

    const filteredTickets = ticketData.filter((ticket) => {
        const matchesSearch =
            ticket.employeeName
                .toLowerCase()
                .includes(search.toLowerCase()) ||
            ticket.ticketID
                .toLowerCase()
                .includes(search.toLowerCase()) ||
            ticket.subject
                .toLowerCase()
                .includes(search.toLowerCase());

        const matchesStatus =
            selectedStatus === "all" ||
            ticket.status.toLowerCase() === selectedStatus.toLowerCase();

        return matchesSearch && matchesStatus;
    });

    const updateTicketStatus = (ticketID, newStatus) => {
        setTicketData((previousTickets) =>
            previousTickets.map((ticket) =>
                ticket.ticketID === ticketID
                    ? { ...ticket, status: newStatus }
                    : ticket
            )
        );
    };

    const openCount = ticketData.filter(
        (ticket) => ticket.status === "Open"
    ).length;

    const progressCount = ticketData.filter(
        (ticket) => ticket.status === "In Progress"
    ).length;

    const resolvedCount = ticketData.filter(
        (ticket) => ticket.status === "Resolved"
    ).length;

    return (
        <DashboardLayout>

            <div className="tickets-page">

                {/* Header */}
                <div className="tickets-header">
                    <h1>Tickets</h1>
                    <p>Manage Employee Support Tickets</p>
                </div>

                {/* Filters */}
                <div className="tickets-tools">

                    <input
                        type="text"
                        placeholder="Search ticket or employee..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                    >
                        <option value="all">All Status</option>
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                    </select>

                </div>

                {/* Summary Cards */}
                <div className="tickets-summary">

                    <div className="ticket-card">
                        <h3>Total Tickets</h3>
                        <h2>{ticketData.length}</h2>
                        <p>All support tickets</p>
                    </div>

                    <div className="ticket-card">
                        <h3>Open</h3>
                        <h2>{openCount}</h2>
                        <p>Tickets awaiting action</p>
                    </div>

                    <div className="ticket-card">
                        <h3>In Progress</h3>
                        <h2>{progressCount}</h2>
                        <p>Currently being handled</p>
                    </div>

                    <div className="ticket-card">
                        <h3>Resolved</h3>
                        <h2>{resolvedCount}</h2>
                        <p>Completed tickets</p>
                    </div>

                </div>

                {/* Ticket Table */}
                <div className="tickets-table-container">

                    <h2>Support Tickets</h2>

                    <table className="tickets-table">

                        <thead>
                            <tr>
                                <th>Ticket ID</th>
                                <th>Employee</th>
                                <th>Subject</th>
                                <th>Category</th>
                                <th>Priority</th>
                                <th>Created Date</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>

                            {filteredTickets.map((ticket) => (

                                <tr key={ticket.ticketID}>

                                    <td>{ticket.ticketID}</td>

                                    <td>
                                        <strong>{ticket.employeeName}</strong>
                                        <br />
                                        <small>{ticket.employeeID}</small>
                                    </td>

                                    <td>{ticket.subject}</td>

                                    <td>{ticket.category}</td>

                                    <td>
                                        <span
                                            className={`ticket-priority ${ticket.priority.toLowerCase()}`}
                                        >
                                            {ticket.priority}
                                        </span>
                                    </td>

                                    <td>{ticket.createdDate}</td>

                                    <td>
                                        <span
                                            className={`ticket-status ${ticket.status
                                                .toLowerCase()
                                                .replace(" ", "-")}`}
                                        >
                                            {ticket.status}
                                        </span>
                                    </td>

                                    <td>

                                        {ticket.status === "Open" && (
                                            <button
                                                className="progress-btn"
                                                onClick={() =>
                                                    updateTicketStatus(
                                                        ticket.ticketID,
                                                        "In Progress"
                                                    )
                                                }
                                            >
                                                Start
                                            </button>
                                        )}

                                        {ticket.status === "In Progress" && (
                                            <button
                                                className="resolve-btn"
                                                onClick={() =>
                                                    updateTicketStatus(
                                                        ticket.ticketID,
                                                        "Resolved"
                                                    )
                                                }
                                            >
                                                Resolve
                                            </button>
                                        )}

                                        {ticket.status === "Resolved" && (
                                            <span className="completed-text">
                                                Completed
                                            </span>
                                        )}

                                    </td>

                                </tr>

                            ))}

                        </tbody>

                    </table>

                </div>

            </div>

        </DashboardLayout>
    );
}

export default Tickets;