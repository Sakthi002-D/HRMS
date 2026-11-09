import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";

Chart.register(BarController, BarElement, CategoryScale, Legend, LinearScale, Tooltip);

const AXIS_COLOR = "#000000";
const GRID_COLOR = "#eef2f6";

// Chart.js draws on a canvas, so it is created and destroyed around React
function BarChart({ config, label }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const chart = new Chart(canvasRef.current, config);
    return () => chart.destroy();
  }, [config]);

  return <div className="hrw-chart"><canvas ref={canvasRef} role="img" aria-label={label} /></div>;
}

function Widget({ title, children, className = "", action }) {
  return (
    <section className={`hrw-card ${className}`}>
      <div className="hrw-card-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// Loading / failed / empty share one message so a widget never crashes on missing data
function WidgetBody({ state, isEmpty, children }) {
  const { t } = useTranslation();
  if (state.status === "loading") return <p className="hrw-empty">{t("hrDashboard.widgets.loading", { defaultValue: "Loading..." })}</p>;
  if (state.status === "failed") return <p className="hrw-empty">{t("hrDashboard.widgets.failed", { defaultValue: "Unable to load this data" })}</p>;
  if (isEmpty) return <p className="hrw-empty">{t("hrDashboard.widgets.noData", { defaultValue: "No data yet" })}</p>;
  return children;
}

export function AttendanceTrend({ state }) {
  const { t, i18n } = useTranslation();
  const data = state.data;

  const config = useMemo(() => {
    if (!data?.hasData) return null;
    const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" });
    return {
      type: "bar",
      data: {
        labels: data.days.map((day) => weekday.format(new Date(`${day.date}T00:00:00Z`))),
        datasets: [
          { label: t("hrDashboard.widgets.present", { defaultValue: "Present" }), data: data.days.map((day) => day.present), backgroundColor: "#f97316", borderRadius: 4, maxBarThickness: 34 },
          { label: t("hrDashboard.widgets.absent", { defaultValue: "Absent" }), data: data.days.map((day) => day.absent), backgroundColor: "#facc15", borderRadius: 4, maxBarThickness: 34 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", align: "end", labels: { boxWidth: 12, boxHeight: 12, color: AXIS_COLOR } } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: AXIS_COLOR } },
          y: { stacked: true, beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: AXIS_COLOR, precision: 0 } },
        },
      },
    };
  }, [data, i18n.language, t]);

  const summary = data && [
    [t("hrDashboard.widgets.present", { defaultValue: "Present" }), data.totals.present],
    [t("hrDashboard.widgets.absent", { defaultValue: "Absent" }), data.totals.absent],
    [t("hrDashboard.widgets.weeklyAvg", { defaultValue: "Weekly Avg" }), data.weeklyAvg === null ? "—" : `${data.weeklyAvg}%`],
  ];

  return (
    <Widget
      title={t("hrDashboard.widgets.attendanceTrend", { defaultValue: "Attendance Trend" })}
      className="hrw-wide"
      action={<span className="hrw-tag">{t("hrDashboard.widgets.thisWeek", { defaultValue: "This week" })}</span>}
    >
      <WidgetBody state={state} isEmpty={!data?.hasData}>
        <div className="hrw-summary">
          {summary?.map(([label, value]) => (
            <div key={label}><strong>{value}</strong><span>{label}</span></div>
          ))}
        </div>
        {config && <BarChart config={config} label={t("hrDashboard.widgets.attendanceTrend", { defaultValue: "Attendance Trend" })} />}
      </WidgetBody>
    </Widget>
  );
}

export function DepartmentDistribution({ state }) {
  const { t } = useTranslation();
  const departments = state.data?.departments;

  const config = useMemo(() => {
    if (!departments?.length) return null;
    const shortName = (name) => (name.length > 14 ? `${name.slice(0, 13)}…` : name);
    return {
      type: "bar",
      data: {
        // Second line of each label is the percentage
        labels: departments.map((item) => [shortName(item.department), `${item.percent}%`]),
        datasets: [{
          label: t("hrDashboard.widgets.employees", { defaultValue: "Employees" }),
          data: departments.map((item) => item.count),
          backgroundColor: "#fdba74",
          hoverBackgroundColor: "#f97316",
          borderRadius: 8,
          maxBarThickness: 64,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (items) => departments[items[0].dataIndex].department } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: AXIS_COLOR, maxRotation: 0, autoSkip: false } },
          y: { beginAtZero: true, grid: { color: GRID_COLOR }, ticks: { color: AXIS_COLOR, precision: 0 } },
        },
      },
    };
  }, [departments, t]);

  return (
    <Widget title={t("hrDashboard.widgets.distribution", { defaultValue: "Top Employee Distribution" })}>
      <WidgetBody state={state} isEmpty={!departments?.length}>
        {config && <BarChart config={config} label={t("hrDashboard.widgets.distribution", { defaultValue: "Top Employee Distribution" })} />}
      </WidgetBody>
    </Widget>
  );
}

export function RecruitmentStats({ state, action }) {
  const { t } = useTranslation();
  const data = state.data;
  const stageLabel = (stage) => t(`hrDashboard.widgets.stages.${stage.toLowerCase().replace(/\s+/g, "_")}`, { defaultValue: stage });

  return (
    <Widget title={t("hrDashboard.widgets.recruitment", { defaultValue: "Recruitment Statistics" })} action={action}>
      <WidgetBody state={state} isEmpty={!data?.applicants}>
        <div className="hrw-summary">
          <div><strong>{data?.applicants}</strong><span>{t("hrDashboard.widgets.applicants", { defaultValue: "Total Applicants" })}</span></div>
          <div><strong>{data?.hired}</strong><span>{t("hrDashboard.widgets.hired", { defaultValue: "Hired" })}</span></div>
          <div>
            <strong>{data?.avgDaysToHire ?? "—"}</strong>
            <span>{t("hrDashboard.widgets.avgDays", { defaultValue: "Avg days to hire" })}</span>
          </div>
        </div>
        <div className="hrw-pipeline" aria-hidden="true">
          {data?.stages.filter((item) => item.count > 0).map((item) => (
            <i key={item.stage} className={`stage-${item.stage.toLowerCase().replace(/\s+/g, "-")}`} style={{ flexGrow: item.count }} />
          ))}
        </div>
        <ul className="hrw-stages">
          {data?.stages.map((item) => (
            <li key={item.stage} className={`stage-${item.stage.toLowerCase().replace(/\s+/g, "-")}`}>
              <strong>{stageLabel(item.stage)}</strong>
              <span>{item.percent}% · {item.count}</span>
            </li>
          ))}
        </ul>
      </WidgetBody>
    </Widget>
  );
}
