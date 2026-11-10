import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

// Month + year filter in one popover: year chips on top, a 12-month grid below.
// month / year are "all" or "01".."12" / "2026".
function PeriodPicker({ month, year, monthOptions, yearOptions, onChange }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onPointer = (event) => {
            if (!wrapperRef.current?.contains(event.target)) setOpen(false);
        };
        const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const monthLabel = monthOptions.find((option) => option.value === month)?.label;
    const label = month === "all" && year === "all"
        ? t("employeeHero.allPeriods", { defaultValue: "All time" })
        : [month === "all" ? t("employeeHero.allMonths", { defaultValue: "All months" }) : monthLabel, year === "all" ? t("employeeHero.allYears", { defaultValue: "All years" }) : year].join(" · ");

    const now = new Date();
    const thisMonth = String(now.getMonth() + 1).padStart(2, "0");
    const thisYear = String(now.getFullYear());
    // Any year can be stepped to: from 2000 up to next year
    const MIN_YEAR = 2000;
    const MAX_YEAR = now.getFullYear() + 1;
    const shownYear = year === "all" ? now.getFullYear() : Number(year);
    const stepYear = (delta) => {
        // From "All", the first step lands on this year
        const next = year === "all" ? shownYear : Math.min(MAX_YEAR, Math.max(MIN_YEAR, shownYear + delta));
        onChange({ year: String(next) });
    };

    return (
        <div className="eperiod" ref={wrapperRef}>
            <button type="button" className={`eperiod-trigger${open ? " open" : ""}${month !== "all" || year !== "all" ? " active" : ""}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog">
                <CalendarDays size={15} aria-hidden="true" />
                <span>{label}</span>
                <ChevronDown size={15} aria-hidden="true" />
            </button>

            {open && (
                <div className="eperiod-pop" role="dialog" aria-label={t("employeeHero.choosePeriod", { defaultValue: "Choose month and year" })}>
                    <div className="eperiod-section">
                        <div className="eperiod-year-head">
                            <span className="eperiod-title">{t("employeeAttendance.year", { defaultValue: "Year" })}</span>
                            <div className="eperiod-stepper">
                                <button type="button" onClick={() => stepYear(-1)} disabled={year !== "all" && shownYear <= MIN_YEAR} aria-label={t("employeeHero.previousYear", { defaultValue: "Previous year" })}><ChevronLeft size={15} /></button>
                                <strong aria-live="polite">{year === "all" ? t("employeeHero.allStatuses", { defaultValue: "All" }) : year}</strong>
                                <button type="button" onClick={() => stepYear(1)} disabled={year !== "all" && shownYear >= MAX_YEAR} aria-label={t("employeeHero.nextYear", { defaultValue: "Next year" })}><ChevronRight size={15} /></button>
                            </div>
                        </div>
                        <div className="eperiod-years">
                            {["all", ...new Set([...(year !== "all" && !yearOptions.includes(year) ? [year] : []), ...yearOptions])].map((value) => (
                                <button type="button" key={value} className={year === value ? "selected" : ""} onClick={() => onChange({ year: value })}>
                                    {value === "all" ? t("employeeHero.allStatuses", { defaultValue: "All" }) : value}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="eperiod-section">
                        <span className="eperiod-title">{t("employeeAttendance.month", { defaultValue: "Month" })}</span>
                        <div className="eperiod-months">
                            <button type="button" className={`wide${month === "all" ? " selected" : ""}`} onClick={() => onChange({ month: "all" })}>
                                {t("employeeHero.allMonths", { defaultValue: "All months" })}
                            </button>
                            {monthOptions.map((option) => (
                                <button
                                    type="button"
                                    key={option.value}
                                    className={`${month === option.value ? "selected" : ""}${option.value === thisMonth && (year === thisYear || year === "all") ? " current" : ""}`}
                                    onClick={() => onChange({ month: option.value })}
                                >
                                    {option.short}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="eperiod-foot">
                        <button type="button" onClick={() => onChange({ month: thisMonth, year: thisYear })}>
                            {t("employeeHero.thisMonth", { defaultValue: "This Month" })}
                        </button>
                        <button type="button" className="primary" onClick={() => setOpen(false)}>
                            {t("employeeHero.done", { defaultValue: "Done" })}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default PeriodPicker;
