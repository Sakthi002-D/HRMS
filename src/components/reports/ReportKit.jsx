import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    AlertTriangle,
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    Inbox,
    Search,
    SearchX,
} from "lucide-react";
import "./ReportKit.css";

export function ReportPage({ tone = "blue", children }) {
    return <div className={`rp-page rp-tone-${tone}`}>{children}</div>;
}

export function ReportHero({ icon: Icon, title, subtitle, actions, backTo = "/reports" }) {
    const { t } = useTranslation();
    return (
        <header className="rp-hero">
            <div className="rp-hero-main">
                {Icon && (
                    <span className="rp-hero-icon">
                        <Icon size={26} strokeWidth={1.8} />
                    </span>
                )}
                <div className="rp-hero-text">
                    <nav className="rp-crumbs" aria-label="Breadcrumb">
                        <Link to={backTo}>{t("reports.hub.title", { defaultValue: "Reports" })}</Link>
                        <ChevronRight size={13} className="rp-flip" />
                        <span>{title}</span>
                    </nav>
                    <h1>{title}</h1>
                    {subtitle && <span className="rp-hero-sub">{subtitle}</span>}
                </div>
            </div>
            <div className="rp-hero-actions">
                {actions}
                <Link className="rp-btn rp-btn-glass" to={backTo}>
                    <ArrowLeft size={15} className="rp-flip" />
                    {t("reports.common.backToReports", { defaultValue: "Back to Reports" })}
                </Link>
            </div>
        </header>
    );
}

export function StatGrid({ children }) {
    return <div className="rp-stats">{children}</div>;
}

export function StatCard({ icon: Icon, tone, label, value, hint, progress, loading }) {
    return (
        <div className={`rp-stat ${tone ? `rp-tone-${tone}` : ""}`}>
            <div className="rp-stat-top">
                <span className="rp-stat-label">{label}</span>
                {Icon && (
                    <span className="rp-stat-icon">
                        <Icon size={18} strokeWidth={2} />
                    </span>
                )}
            </div>
            <strong className={`rp-stat-value ${loading ? "is-loading" : ""}`}>{loading ? " " : value}</strong>
            {progress != null && !loading && (
                <span className="rp-stat-progress" aria-hidden="true">
                    <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
                </span>
            )}
            {hint && <span className="rp-stat-hint">{hint}</span>}
        </div>
    );
}

export function ReportPanel({ title, subtitle, actions, className = "", children }) {
    return (
        <section className={`rp-panel ${className}`}>
            {(title || actions) && (
                <div className="rp-panel-head">
                    <div>
                        {title && <h2>{title}</h2>}
                        {subtitle && <span className="rp-panel-sub">{subtitle}</span>}
                    </div>
                    {actions && <div className="rp-panel-actions">{actions}</div>}
                </div>
            )}
            {children}
        </section>
    );
}

export function ReportAlert({ tone = "success", children }) {
    return <div className={`rp-alert rp-alert-${tone}`} role="status">{children}</div>;
}

const niceStep = (rawStep) => {
    const exponent = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const fraction = rawStep / exponent;
    const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return Math.max(1, nice * exponent);
};

const TICK_INTERVALS = 4;

export function ReportChart({ title, subtitle, labels, series }) {
    const { t } = useTranslation();

    const hasData = labels.length > 0 && series.some((item) => item.values.some((value) => value > 0));
    const maxValue = Math.max(0, ...series.flatMap((item) => item.values));
    const step = niceStep(Math.max(maxValue, 1) / TICK_INTERVALS);
    const ceiling = step * TICK_INTERVALS;
    const ticks = Array.from({ length: TICK_INTERVALS + 1 }, (_, index) => index * step);

    return (
        <ReportPanel
            title={title}
            subtitle={subtitle}
            className="rp-chart"
            actions={(
                <div className="rp-legend">
                    {series.map((item) => (
                        <span key={item.name}>
                            <i style={{ background: item.color }} />
                            {item.name}
                            <b dir="ltr">{item.values.reduce((sum, value) => sum + value, 0).toLocaleString()}</b>
                        </span>
                    ))}
                </div>
            )}
        >
            {!hasData ? (
                <div className="rp-empty rp-empty-chart">
                    <span className="rp-empty-icon"><Inbox size={22} /></span>
                    <strong>{t("reports.common.chartEmpty", { defaultValue: "Nothing to chart yet" })}</strong>
                    <span>{t("reports.common.chartEmptyHint", { defaultValue: "The chart appears as soon as there is data." })}</span>
                </div>
            ) : (
                <div className="rp-chart-body">
                    <div className="rp-chart-yaxis" aria-hidden="true">
                        {ticks.map((tick, index) => (
                            <span key={tick} style={{ bottom: `${(index / TICK_INTERVALS) * 100}%` }} dir="ltr">{tick}</span>
                        ))}
                    </div>
                    <div className="rp-chart-scroll">
                        <div className="rp-chart-plot" style={{ minWidth: `${labels.length * 76}px` }}>
                            <div className="rp-chart-lines" aria-hidden="true">
                                {ticks.map((tick, index) => (
                                    <i key={tick} style={{ bottom: `${(index / TICK_INTERVALS) * 100}%` }} />
                                ))}
                            </div>
                            <div className="rp-chart-cols">
                                {labels.map((label, labelIndex) => (
                                    <div className="rp-chart-col" key={`${label}-${labelIndex}`}>
                                        <div className="rp-chart-bars">
                                            {series.map((item) => {
                                                const value = item.values[labelIndex] || 0;
                                                const percent = (value / ceiling) * 100;
                                                return (
                                                    <div className="rp-bar-wrap" key={item.name} title={`${item.name}: ${value} - ${label}`}>
                                                        {value > 0 && <span className="rp-bar-value" style={{ bottom: `calc(${percent}% + 4px)` }} dir="ltr">{value}</span>}
                                                        <b
                                                            className="rp-bar"
                                                            style={{ height: `${percent}%`, background: item.color, minHeight: value > 0 ? "3px" : 0 }}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <span className="rp-chart-label" title={label}>{label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ReportPanel>
    );
}

const pageWindow = (current, total) => {
    const pages = new Set([1, total, current - 1, current, current + 1]);
    const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
    const result = [];
    sorted.forEach((page, index) => {
        if (index > 0 && page - sorted[index - 1] > 1) result.push(`gap-${page}`);
        result.push(page);
    });
    return result;
};

export function Avatar({ name }) {
    const initials = String(name || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase();
    return <span className="rp-avatar" aria-hidden="true">{initials || "?"}</span>;
}

export function StatusPill({ tone = "slate", children, title }) {
    return <span className={`rp-pill rp-pill-${tone}`} title={title}>{children}</span>;
}

export function ReportTable({
    title,
    subtitle,
    columns,
    rows,
    rowKey,
    loading = false,
    error = "",
    emptyText,
    loadingText,
    searchText,
    pageSize = 10,
    footer,
    minWidth = 760,
}) {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return rows;
        return rows.filter((row) => {
            const haystack = searchText
                ? searchText(row)
                : Object.values(row).filter((value) => value === null || typeof value !== "object").join(" ");
            return String(haystack).toLowerCase().includes(needle);
        });
    }, [rows, query, searchText]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const start = (currentPage - 1) * pageSize;
    const visible = filtered.slice(start, start + pageSize);
    const showPager = !loading && !error && filtered.length > pageSize;

    let stateBlock = null;
    if (loading) {
        stateBlock = (
            <div className="rp-skeleton" aria-busy="true" aria-label={loadingText}>
                {Array.from({ length: 5 }, (_, index) => <i key={index} />)}
            </div>
        );
    } else if (error) {
        stateBlock = (
            <div className="rp-empty rp-empty-error">
                <span className="rp-empty-icon"><AlertTriangle size={22} /></span>
                <strong>{error}</strong>
            </div>
        );
    } else if (rows.length === 0) {
        stateBlock = (
            <div className="rp-empty">
                <span className="rp-empty-icon"><Inbox size={22} /></span>
                <strong>{emptyText}</strong>
            </div>
        );
    } else if (filtered.length === 0) {
        stateBlock = (
            <div className="rp-empty">
                <span className="rp-empty-icon"><SearchX size={22} /></span>
                <strong>{t("reports.common.noResults", { defaultValue: "No matching records" })}</strong>
                <span>{t("reports.common.noResultsHint", { defaultValue: "Try a different search term." })}</span>
            </div>
        );
    }

    return (
        <ReportPanel
            title={title}
            subtitle={subtitle}
            className="rp-table-panel"
            actions={(
                <>
                    {!loading && !error && rows.length > 0 && (
                        <span className="rp-count">
                            {t("reports.common.records", { count: filtered.length, defaultValue: "{{count}} records" })}
                        </span>
                    )}
                    <label className="rp-search">
                        <Search size={15} />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setPage(1);
                            }}
                            placeholder={t("reports.common.search", { defaultValue: "Search..." })}
                            aria-label={t("reports.common.search", { defaultValue: "Search..." })}
                        />
                    </label>
                </>
            )}
        >
            {stateBlock || (
                <div className="rp-table-scroll">
                    <table className="rp-table" style={{ minWidth: `${minWidth}px` }}>
                        <thead>
                            <tr>
                                {columns.map((column) => (
                                    <th key={column.key} className={column.align ? `is-${column.align}` : ""}>{column.header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((row) => (
                                <tr key={rowKey(row)}>
                                    {columns.map((column) => (
                                        <td key={column.key} className={`${column.align ? `is-${column.align}` : ""} ${column.nowrap ? "is-nowrap" : ""}`}>
                                            {column.render ? column.render(row) : row[column.key]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                        {footer && <tfoot>{footer}</tfoot>}
                    </table>
                </div>
            )}

            {showPager && (
                <div className="rp-pager">
                    <span className="rp-pager-info" dir="ltr">
                        {t("reports.common.showing", {
                            from: start + 1,
                            to: Math.min(start + pageSize, filtered.length),
                            total: filtered.length,
                            defaultValue: "Showing {{from}}-{{to}} of {{total}}",
                        })}
                    </span>
                    <div className="rp-pager-controls">
                        <button
                            type="button"
                            className="rp-page-btn"
                            onClick={() => setPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            aria-label={t("reports.common.previous", { defaultValue: "Previous" })}
                        >
                            <ChevronLeft size={16} className="rp-flip" />
                        </button>
                        {pageWindow(currentPage, pageCount).map((item) => (
                            typeof item === "string" ? (
                                <span key={item} className="rp-page-gap">…</span>
                            ) : (
                                <button
                                    type="button"
                                    key={item}
                                    className={`rp-page-btn ${item === currentPage ? "is-active" : ""}`}
                                    onClick={() => setPage(item)}
                                    aria-current={item === currentPage ? "page" : undefined}
                                >
                                    {item}
                                </button>
                            )
                        ))}
                        <button
                            type="button"
                            className="rp-page-btn"
                            onClick={() => setPage(currentPage + 1)}
                            disabled={currentPage === pageCount}
                            aria-label={t("reports.common.next", { defaultValue: "Next" })}
                        >
                            <ChevronRight size={16} className="rp-flip" />
                        </button>
                    </div>
                </div>
            )}
        </ReportPanel>
    );
}
