// HR Resignations → month filter. Looks like the shared DatePicker (same trigger box, calendar icon and
// popup classes from DatePicker.css), but picks a month: the popup shows the year with previous / next
// buttons and the 12 months. The value stays "YYYY-MM" ("" = no filter), the same as <input type="month">.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import "../layout/common/DatePicker.css";

const MONTH_KEYS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const isMonthValue = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
const toMonthValue = (year, monthIndex) => `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

function ResignationMonthPicker({ value, onChange, label }) {
    const { t } = useTranslation();
    const wrapperRef = useRef(null);
    const [open, setOpen] = useState(false);
    const selected = isMonthValue(value) ? value : "";
    const [year, setYear] = useState(() => (selected ? Number(selected.slice(0, 4)) : new Date().getFullYear()));

    useEffect(() => {
        const closeOutside = (event) => {
            if (!wrapperRef.current?.contains(event.target)) setOpen(false);
        };
        const closeOnEscape = (event) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", closeOutside);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("mousedown", closeOutside);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, []);

    const togglePicker = () => {
        // Open on the selected month's year (or this year when nothing is selected)
        if (!open) setYear(selected ? Number(selected.slice(0, 4)) : new Date().getFullYear());
        setOpen((previous) => !previous);
    };

    const choose = (monthValue) => {
        onChange(monthValue);
        setOpen(false);
    };

    // "MM-YYYY", like DatePicker shows "DD-MM-YYYY"
    const display = selected ? `${selected.slice(5, 7)}-${selected.slice(0, 4)}` : "";

    return (
        <div className="date-picker resignation-month-picker" ref={wrapperRef}>
            <button
                type="button"
                className={`date-picker-trigger${open ? " is-open" : ""}`}
                onClick={togglePicker}
                aria-label={label}
                title={label}
                aria-expanded={open}
            >
                <span className={display ? "" : "date-picker-placeholder"}>{display || "MM-YYYY"}</span>
                <CalendarDays size={17} />
            </button>

            {open && (
                <div className="date-picker-popup" role="dialog" aria-label={t("hrResignations.monthPicker.choose", { defaultValue: "Choose month" })}>
                    <div className="date-picker-nav">
                        <button type="button" onClick={() => setYear((current) => current - 1)} aria-label={t("hrResignations.monthPicker.previousYear", { defaultValue: "Previous year" })}>
                            <ChevronLeft size={17} />
                        </button>
                        <div className="date-picker-heading">
                            <span><bdi>{year}</bdi></span>
                        </div>
                        <button type="button" onClick={() => setYear((current) => current + 1)} aria-label={t("hrResignations.monthPicker.nextYear", { defaultValue: "Next year" })}>
                            <ChevronRight size={17} />
                        </button>
                    </div>

                    <div className="date-picker-years resignation-month-grid">
                        {MONTH_KEYS.map((key, index) => {
                            const monthValue = toMonthValue(year, index);
                            return (
                                <button
                                    type="button"
                                    key={key}
                                    className={monthValue === selected ? "selected" : ""}
                                    aria-pressed={monthValue === selected}
                                    onClick={() => choose(monthValue)}
                                >
                                    {t(`employeeRequest.months.${key}`, { defaultValue: key.charAt(0).toUpperCase() + key.slice(1) })}
                                </button>
                            );
                        })}
                    </div>

                    <div className="date-picker-footer">
                        <button type="button" onClick={() => choose("")}>
                            {t("hrResignations.monthPicker.clear", { defaultValue: "Clear" })}
                        </button>
                        <button type="button" onClick={() => choose(toMonthValue(new Date().getFullYear(), new Date().getMonth()))}>
                            {t("hrResignations.monthPicker.thisMonth", { defaultValue: "This month" })}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ResignationMonthPicker;
