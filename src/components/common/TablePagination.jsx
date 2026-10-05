import { useEffect, useMemo, useState } from "react";
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
    if (inline) {
        return (
            <select
                className="tp-rows-inline"
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                aria-label="Rows per page"
                title="Rows per page"
            >
                {options.map((size) => <option key={size} value={size}>{size} per page</option>)}
            </select>
        );
    }

    return (
        <label className="tp-rows">
            <span>Rows per page</span>
            <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
                {options.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
        </label>
    );
}

// "← Previous  1  2  3  …  Next →"
export function Pagination({ page, pageCount, onChange }) {
    if (pageCount <= 1) return null;

    const pages = [];
    if (pageCount <= 7) {
        for (let i = 1; i <= pageCount; i += 1) pages.push(i);
    } else {
        pages.push(1);
        const start = Math.max(2, page - 1);
        const end = Math.min(pageCount - 1, page + 1);
        if (start > 2) pages.push("start-gap");
        for (let i = start; i <= end; i += 1) pages.push(i);
        if (end < pageCount - 1) pages.push("end-gap");
        pages.push(pageCount);
    }

    return (
        <nav className="tp-pagination" aria-label="Table pages">
            <button type="button" className="tp-nav" disabled={page === 1} onClick={() => onChange(page - 1)}>
                ← Previous
            </button>
            {pages.map((item) =>
                typeof item === "number" ? (
                    <button
                        key={item}
                        type="button"
                        className={`tp-page${item === page ? " active" : ""}`}
                        aria-current={item === page ? "page" : undefined}
                        onClick={() => onChange(item)}
                    >
                        {item}
                    </button>
                ) : (
                    <span key={item} className="tp-gap">…</span>
                )
            )}
            <button type="button" className="tp-nav" disabled={page === pageCount} onClick={() => onChange(page + 1)}>
                Next →
            </button>
        </nav>
    );
}