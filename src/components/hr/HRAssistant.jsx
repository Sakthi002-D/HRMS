import { Bot, Send, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API_URL from "../../config/api";
import "./HRAssistant.css";

function HRAssistant({ dashboardData: initialDashboardData = null, employeeRequests: initialRequests = [], notifications: initialNotifications = [] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [dashboardState, setDashboardState] = useState(initialDashboardData);
  const [requestsState, setRequestsState] = useState(initialRequests);
  const [notificationsState, setNotificationsState] = useState(initialNotifications);
  const [moduleData, setModuleData] = useState({ employees: [], attendance: [], leaves: [], payroll: [], tickets: [] });
  const [dataLoading, setDataLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi, I am your HR assistant. Ask me about workforce numbers, attendance, leave, payroll, or pending requests.",
    },
  ]);

  const metrics = useMemo(() => ({
    employees: dashboardState?.totalEmployees ?? dashboardState?.employeeCount ?? "not available",
    present: dashboardState?.presentToday ?? dashboardState?.present_today ?? "not available",
    leave: dashboardState?.onLeave ?? dashboardState?.on_leave ?? "not available",
    pendingRequests: requestsState.filter((request) => request.status === "Pending").length,
    unread: notificationsState.filter((notification) => !notification.read).length,
    inactive: moduleData.employees.filter((employee) => String(employee.status || "").toLowerCase() === "inactive").length,
    pendingLeaves: moduleData.leaves.filter((leave) => String(leave.status || "").toLowerCase() === "pending").length,
    payrollRecords: moduleData.payroll.length,
    openTickets: moduleData.tickets.filter((ticket) => !["closed", "resolved"].includes(String(ticket.status || "").toLowerCase())).length,
  }), [dashboardState, requestsState, notificationsState, moduleData]);

  useEffect(() => {
    if (!open || dataLoading || dataLoaded) return;
    setDataLoading(true);
    Promise.allSettled([
      fetch(`${API_URL}/api/dashboard`).then((response) => response.ok ? response.json() : null),
      fetch(`${API_URL}/api/hr/employee-requests`).then((response) => response.ok ? response.json() : []),
      fetch(`${API_URL}/api/leaves`).then((response) => response.ok ? response.json() : []),
      fetch(`${API_URL}/api/employees`).then((response) => response.ok ? response.json() : []),
      fetch(`${API_URL}/api/attendance`).then((response) => response.ok ? response.json() : []),
      fetch(`${API_URL}/api/payroll`).then((response) => response.ok ? response.json() : []),
      fetch(`${API_URL}/api/tickets`).then((response) => response.ok ? response.json() : []),
    ]).then((results) => {
      const value = (index, fallback) => results[index]?.status === "fulfilled" ? results[index].value : fallback;
      const leaves = value(2, []);
      setDashboardState(value(0, dashboardState));
      setRequestsState(value(1, initialRequests));
      setNotificationsState(leaves.filter((leave) => String(leave.status || "").toLowerCase() === "pending").map((leave) => ({ read: false, type: "leave", title: `${leave.employee_name || leave.employee_id} requested leave` })));
      setModuleData({ employees: value(3, []), attendance: value(4, []), leaves, payroll: value(5, []), tickets: value(6, []) });
    }).finally(() => {
      setDataLoading(false);
      setDataLoaded(true);
    });
  }, [open, dataLoading, dataLoaded]);

  const answerQuestion = (question) => {
    const normalized = question.toLowerCase();
    if (normalized.includes("employee") || normalized.includes("workforce") || normalized.includes("headcount") || normalized.includes("staff")) {
      return { text: `The current workforce count is ${metrics.employees}. ${metrics.inactive ? `${metrics.inactive} inactive employee${metrics.inactive === 1 ? "" : "s"} found.` : "All current employee records are active."}`, action: ["/employees", "Open Employees"] };
    }
    if (normalized.includes("present") || normalized.includes("attendance")) {
      return { text: `Present today: ${metrics.present}. Attendance records loaded: ${moduleData.attendance.length}.`, action: ["/attendance", "Open Attendance"] };
    }
    if (normalized.includes("leave")) {
      return { text: `Employees on leave today: ${metrics.leave}. Pending leave requests: ${metrics.pendingLeaves}.`, action: ["/leave-management", "Review Leave"] };
    }
    if (normalized.includes("request") || normalized.includes("approval") || normalized.includes("pending")) {
      return { text: `There are ${metrics.pendingRequests} pending employee request${metrics.pendingRequests === 1 ? "" : "s"} awaiting review.`, action: ["/hr-dashboard", "Review Requests"] };
    }
    if (normalized.includes("notification") || normalized.includes("alert")) {
      return { text: `You have ${metrics.unread} unread notification${metrics.unread === 1 ? "" : "s"}.`, action: ["/hr-dashboard", "View Notifications"] };
    }
    if (normalized.includes("payroll") || normalized.includes("salary")) {
      return { text: `Payroll records loaded: ${metrics.payrollRecords}. Open Payroll for salary details and updates.`, action: ["/payroll", "Open Payroll"] };
    }
    if (normalized.includes("ticket") || normalized.includes("issue") || normalized.includes("support")) {
      return { text: `There are ${metrics.openTickets} open ticket${metrics.openTickets === 1 ? "" : "s"}.`, action: ["/tickets", "Open Ticketing"] };
    }
    if (normalized.includes("report") || normalized.includes("analytics") || normalized.includes("summary")) {
      return { text: "Reports can help you compare attendance, leave, payroll, and employee trends.", action: ["/reports", "Open Reports"] };
    }
    if (normalized.includes("recruit") || normalized.includes("job") || normalized.includes("hiring")) {
      return { text: "Recruitment tools are available for job openings and candidate applications.", action: ["/recruitment", "Open Recruitment"] };
    }
    return { text: "I can help with employees, attendance, leave, payroll, tickets, recruitment, reports, notifications, and pending requests. Try a suggested question.", action: null };
  };

  const submitMessage = (event) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    setMessages((current) => [
      ...current,
      { role: "user", text: trimmed },
      { role: "assistant", ...answerQuestion(trimmed) },
    ]);
    setMessage("");
  };

  const askSuggested = (question) => {
    setMessage(question);
  };

  return (
    <>
      {open && (
        <section className="hr-assistant-panel" aria-label="HR assistant">
          <header className="hr-assistant-header">
            <div className="hr-assistant-title">
              <span className="hr-assistant-avatar"><Bot size={18} /></span>
              <div><strong>HR Assistant</strong><small>Workforce insights</small></div>
            </div>
            <button type="button" className="hr-assistant-close" onClick={() => setOpen(false)} aria-label="Close HR assistant"><X size={18} /></button>
          </header>
          <div className="hr-assistant-messages">
            {dataLoading && <div className="hr-assistant-loading">Loading HR data...</div>}
            {messages.map((item, index) => <div className={`hr-assistant-message ${item.role}`} key={`${item.role}-${index}`}><span>{item.text}</span>{item.action && <button type="button" onClick={() => navigate(item.action[0])}>{item.action[1]}</button>}</div>)}
          </div>
          <div className="hr-assistant-suggestions">
            {["How many employees do we have?", "Who is present today?", "Any pending requests?", "Show open tickets"].map((question) => <button type="button" key={question} onClick={() => askSuggested(question)}>{question}</button>)}
          </div>
          <form className="hr-assistant-input" onSubmit={submitMessage}>
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask an HR question..." aria-label="Ask an HR question" />
            <button type="submit" aria-label="Send question"><Send size={16} /></button>
          </form>
        </section>
      )}
      <button type="button" className={`hr-assistant-launcher${open ? " is-open" : ""}`} onClick={() => setOpen((current) => !current)} aria-label="Open HR assistant" title="HR Assistant">
        {open ? <X size={21} /> : <><Sparkles size={17} /><Bot size={20} /></>}
      </button>
    </>
  );
}

export default HRAssistant;
