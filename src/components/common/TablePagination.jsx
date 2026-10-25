import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import "./TablePagination.css";

// Splits a list into pages. Goes back to page 1 when the list or page size changes.
export function usePagination(items = [], initialSize = 10) {
    const [pageSize, setPageSize] = useState(initialSize);
    const [page, setPage] = useState(1);
    const total = items.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));

    useEffect(() => { setPage(1); }, [pageSize, total]);
    useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

    const pageItems = useMemo(
        () => items.slice((page - 1) * pageSize, page * pageSize),
        [items, page, pageSize]
    );

    return { page, setPage, pageSize, setPageSize, pageCount, pageItems, total };
}

// "Rows per page [10 ▾]"  or, with `inline`, a plain dropdown "10 per page"
export function RowsPerPage({ value, onChange, options = [10, 25, 50], inline = false }) {
    const { t } = useTranslation();
    const rowsPerPage = t("employeeAttendance.rowsPerPage", { defaultValue: "Rows per page" });

    if (inline) {
        return (
            <select
                className="tp-rows-inline"
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                aria-label={rowsPerPage}
                title={rowsPerPage}
            >
                {options.map((size) => <option key={size} value={size}>{t("recruitment.pagination.perPage", { size, defaultValue: "{{size}} per page" })}</option>)}
            </select>
        );
    }

    return (
        <label className="tp-rows">
            <span>{rowsPerPage}</span>
            <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
                {options.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
        </label>
    );
}

// "<  1  2  3  >" - shows at most 3 page numbers around the current page
export function Pagination({ page, pageCount, onChange }) {
    const { t } = useTranslation();
    if (pageCount <= 1) return null;

    const first = Math.max(1, Math.min(page - 1, pageCount - 2));
    const last = Math.min(pageCount, first + 2);
    const pages = [];
    for (let i = first; i <= last; i += 1) pages.push(i);

    return (
        <nav className="tp-pagination" aria-label={t("recruitment.pagination.tablePages", { defaultValue: "Table pages" })}>
            <button
                type="button"
                className="tp-nav"
                disabled={page === 1}
                aria-label={t("employeesList.pagination.previousLabel", { defaultValue: "Previous page" })}
                onClick={() => onChange(page - 1)}
            >
                &lt;
            </button>
            {pages.map((item) => (
                <button
                    key={item}
                    type="button"
                    className={`tp-page${item === page ? " active" : ""}`}
                    aria-current={item === page ? "page" : undefined}
                    onClick={() => onChange(item)}
                >
                    {item}
                </button>
            ))}
            <button
                type="button"
                className="tp-nav"
                disabled={page === pageCount}
                aria-label={t("employeesList.pagination.nextLabel", { defaultValue: "Next page" })}
                onClick={() => onChange(page + 1)}
            >
                &gt;
            </button>
        </nav>
    );
}