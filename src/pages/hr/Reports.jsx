import { useState } from "react";
import {
    ArrowRight,
    BarChart3,
    CalendarClock,
    CalendarRange,
    Grid2X2,
    LayoutList,
    PiggyBank,
    Search,
    SearchX,
    Users,
    Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { ReportPage } from "../../components/reports/ReportKit";
import "./Reports.css";

const REPORTS = [
    {
        key: "employee",
        path: "/employee-report",
        icon: Users,
        tone: "blue",
        tag: "live",
        titleDefault: "Employee Report",
        descriptionDefault: "View employee details and department information.",
    },
    {
        key: "attendance",
        path: "/attendance-report",
        icon: CalendarClock,
        tone: "teal",
        tag: "daily",
        titleDefault: "Attendance Report",
        descriptionDefault: "View employee attendance and working hours.",
    },
    {
        key: "leave",
        path: "/leave-report",
        icon: CalendarRange,
        tone: "violet",
        tag: "live",
        titleDefault: "Leave Report",
        descriptionDefault: "View leave requests, approvals and leave usage.",
    },
    {
        key: "payroll",
        path: "/payroll-report",
        icon: Wallet,
        tone: "amber",
        tag: "preview",
        titleDefault: "Payroll Report",
        descriptionDefault: "View salary, deductions and payroll information.",
    },
    {
        key: "accrual",
        path: "/annual-leave-accrual-report",
        icon: PiggyBank,
        tone: "green",
        tag: "finance",
        titleDefault: "Annual Leave Accrual",
        descriptionDefault: "Monthly annual leave days and liability amount per employee, for Finance.",
    },
];

const TAG_DEFAULTS = { live: "Live data", daily: "Today", preview: "Preview", finance: "Finance" };

function Reports() {

    const { t } = useTranslation();
    const [viewMode, setViewMode] = useState("grid");
    const [query, setQuery] = useState("");

    const reports = REPORTS.map((report) => ({
        ...report,
        title: t(`reports.hub.cards.${report.key}.title`, { defaultValue: report.titleDefault }),
        description: t(`reports.hub.cards.${report.key}.description`, { defaultValue: report.descriptionDefault }),
    }));

    const needle = query.trim().toLowerCase();
    const visible = needle
        ? reports.filter((report) => `${report.title} ${report.description}`.toLowerCase().includes(needle))
        : reports;

    return (
        <DashboardLayout>

            <ReportPage tone="blue">

                <header className="rp-hero hub-hero">
                    <div className="rp-hero-main">
                        <span className="rp-hero-icon">
                            <BarChart3 size={26} strokeWidth={1.8} />
                        </span>
                        <div className="rp-hero-text">
                            <span className="hub-kicker">{t("reports.hub.kicker", { defaultValue: "Analytics" })}</span>
                            <h1>{t("reports.hub.title", { defaultValue: "Reports" })}</h1>
                            <span className="rp-hero-sub">{t("reports.hub.subtitle", { defaultValue: "View and analyze HR reports" })}</span>
                        </div>
                    </div>

                    <div className="rp-hero-actions">
                        <label className="hub-search">
                            <Search size={15} />
                            <input
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={t("reports.hub.search", { defaultValue: "Search reports..." })}
                                aria-label={t("reports.hub.search", { defaultValue: "Search reports..." })}
                            />
                        </label>
                        <div className="hub-toggle" role="group">
                            <button
                                type="button"
                                className={viewMode === "grid" ? "active" : ""}
                                onClick={() => setViewMode("grid")}
                                aria-pressed={viewMode === "grid"}
                                aria-label={t("employeesList.gridView", { defaultValue: "Grid view" })}
                                title={t("employeesList.gridView", { defaultValue: "Grid view" })}
                            >
                                <Grid2X2 size={15} />
                            </button>
                            <button
                                type="button"
                                className={viewMode === "list" ? "active" : ""}
                                onClick={() => setViewMode("list")}
                                aria-pressed={viewMode === "list"}
                                aria-label={t("employeesList.listView", { defaultValue: "List view" })}
                                title={t("employeesList.listView", { defaultValue: "List view" })}
                            >
                                <LayoutList size={16} />
                            </button>
                        </div>
                    </div>
                </header>

                {visible.length === 0 ? (
                    <div className="rp-panel rp-empty">
                        <span className="rp-empty-icon"><SearchX size={22} /></span>
                        <strong>{t("reports.hub.noMatch", { defaultValue: "No reports match your search" })}</strong>
                    </div>
                ) : (
                    <div className={`hub-grid ${viewMode === "list" ? "hub-grid-list" : ""}`}>
                        {visible.map(({ key, path, icon: Icon, tone, tag, title, description }) => (
                            <Link key={key} to={path} className={`hub-card rp-tone-${tone}`}>
                                <div className="hub-card-top">
                                    <span className="hub-card-icon">
                                        <Icon size={22} strokeWidth={1.9} />
                                    </span>
                                    <span className="hub-card-tag">
                                        {t(`reports.hub.tags.${tag}`, { defaultValue: TAG_DEFAULTS[tag] })}
                                    </span>
                                </div>
                                <div className="hub-card-body">
                                    <h3>{title}</h3>
                                    <span className="hub-card-desc">{description}</span>
                                </div>
                                <span className="hub-card-cta">
                                    {t("reports.hub.viewReport", { defaultValue: "View Report" })}
                                    <ArrowRight size={15} className="rp-flip" />
                                </span>
                            </Link>
                        ))}
                    </div>
                )}

            </ReportPage>

        </DashboardLayout>
    );
}

export default Reports;
