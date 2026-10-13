import { useState } from "react";
import { Grid2X2, LayoutList } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Reports.css";

function Reports() {

    const { t } = useTranslation();
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState("list");
    return (
        <DashboardLayout>

            <div className="reports-page">

                {/* Header */}
                <div className="reports-header">
                    <div>
                        <h1>{t("reports.hub.title", { defaultValue: "Reports" })}</h1>
                        <p>{t("reports.hub.subtitle", { defaultValue: "View and analyze HR reports" })}</p>
                    </div>
                    <div className="reports-header-actions">
                        <button className={`report-view-toggle ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")} aria-label={t("employeesList.listView", { defaultValue: "List view" })} title={t("employeesList.listView", { defaultValue: "List view" })}>
                            <LayoutList size={16} />
                        </button>
                        <button className={`report-view-toggle ${viewMode === "grid" ? "active" : ""}`} onClick={() => setViewMode("grid")} aria-label={t("employeesList.gridView", { defaultValue: "Grid view" })} title={t("employeesList.gridView", { defaultValue: "Grid view" })}>
                            <Grid2X2 size={15} />
                        </button>
                    </div>
                </div>

                {/* Report Sections */}
                <div className="reports-container">
                    <div className={`report-grid ${viewMode === "grid" ? "report-grid-view" : ""}`}>

                        <div className="report-item">
                            <h3>{t("reports.hub.cards.employee.title", { defaultValue: "Employee Report" })}</h3>
                            <p>{t("reports.hub.cards.employee.description", { defaultValue: "View employee details and department information." })}</p>
                            <button onClick={() => navigate("/employee-report")}>
                                {t("reports.hub.viewReport", { defaultValue: "View Report" })}
                            </button>
                        </div>

                        <div className="report-item">
                            <h3>{t("reports.hub.cards.attendance.title", { defaultValue: "Attendance Report" })}</h3>
                            <p>{t("reports.hub.cards.attendance.description", { defaultValue: "View employee attendance and working hours." })}</p>
                            <button onClick={() => navigate("/attendance-report")}>
                                {t("reports.hub.viewReport", { defaultValue: "View Report" })}
                            </button>
                        </div>

                        <div className="report-item">
                            <h3>{t("reports.hub.cards.leave.title", { defaultValue: "Leave Report" })}</h3>
                            <p>{t("reports.hub.cards.leave.description", { defaultValue: "View leave requests, approvals and leave usage." })}</p>
                            <button onClick={() => navigate("/leave-report")}>
                                {t("reports.hub.viewReport", { defaultValue: "View Report" })}
                            </button>
                        </div>

                        <div className="report-item">
                            <h3>{t("reports.hub.cards.payroll.title", { defaultValue: "Payroll Report" })}</h3>
                            <p>{t("reports.hub.cards.payroll.description", { defaultValue: "View salary, deductions and payroll information." })}</p>
                            <button onClick={() => navigate("/payroll-report")}>
                                {t("reports.hub.viewReport", { defaultValue: "View Report" })}
                            </button>
                        </div>

                        <div className="report-item">
                            <h3>{t("reports.hub.cards.accrual.title", { defaultValue: "Annual Leave Accrual" })}</h3>
                            <p>{t("reports.hub.cards.accrual.description", { defaultValue: "Monthly annual leave days and liability amount per employee, for Finance." })}</p>
                            <button onClick={() => navigate("/annual-leave-accrual-report")}>
                                {t("reports.hub.viewReport", { defaultValue: "View Report" })}
                            </button>
                        </div>

                    </div>

                </div>

            </div>

        </DashboardLayout>
    );
}

export default Reports;