import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import "./DatePicker.css";

const POPUP_GAP = 8;
const SCREEN_MARGIN = 8;
const SMALL_SCREEN = 640;

const toDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Months since year 0, for comparing visible month against minDate
const monthIndex = (year, month) => year * 12 + month;

const normalizeDateValue = (value) => {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return "";
  const normalized = text.slice(0, 10);
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "" : normalized;
};

const formatDisplayDate = (value) => {
  const normalized = normalizeDateValue(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-");
  return `${day}-${month}-${year}`;
};

/*
  Optional props:
  - minDate (YYYY-MM-DD): dates before it are disabled (earlier months stay viewable)
  - today (YYYY-MM-DD): "today" for the Today button, e.g. in the company timezone (default: browser)
  - autoPosition: render the popup above everything (portal) and flip it right/up to stay on screen
*/
function DatePicker({ value, onChange, placeholder = "DD-MM-YYYY", minDate, today, autoPosition = false }) {
  const wrapperRef = useRef(null);
  const popupRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const normalizedValue = normalizeDateValue(value);
  const todayKey = normalizeDateValue(today) || toDateKey(new Date());
  const minKey = normalizeDateValue(minDate);
  const minDateObject = minKey ? new Date(`${minKey}T00:00:00`) : null;
  const minMonthIndex = minDateObject
    ? monthIndex(minDateObject.getFullYear(), minDateObject.getMonth())
    : null;
  const selectedDate = new Date(`${normalizedValue || todayKey}T00:00:00`);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );
  const visibleMonthIndex = monthIndex(visibleMonth.getFullYear(), visibleMonth.getMonth());
  const isDateDisabled = (dateKey) => Boolean(minKey) && dateKey < minKey;

  useEffect(() => {
    const closePicker = (event) => {
      if (
        !wrapperRef.current?.contains(event.target) &&
        !popupRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closePicker);
    return () => document.removeEventListener("mousedown", closePicker);
  }, []);

  // Place the floating popup: right-align if it would overflow the boundary
  // (modal marked with data-datepicker-boundary, or the viewport), open upward
  // if there is no room below, and centre under the input on small screens.
  useLayoutEffect(() => {
    if (!open || !autoPosition) return undefined;

    const place = () => {
      const wrapper = wrapperRef.current;
      const popup = popupRef.current;
      if (!wrapper || !popup) return;

      const trigger = wrapper.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const boundary = wrapper.closest("[data-datepicker-boundary]")?.getBoundingClientRect();
      const width = popup.offsetWidth;
      const height = popup.offsetHeight;

      const minLeft = Math.max(SCREEN_MARGIN, boundary ? boundary.left + SCREEN_MARGIN : 0);
      const maxRight = Math.min(
        viewportWidth - SCREEN_MARGIN,
        boundary ? boundary.right - SCREEN_MARGIN : viewportWidth
      );

      let left;
      if (viewportWidth < SMALL_SCREEN) {
        left = trigger.left + trigger.width / 2 - width / 2;
      } else {
        left = trigger.left;
        if (left + width > maxRight) left = trigger.right - width;
      }
      left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxRight - width));

      const spaceBelow = viewportHeight - trigger.bottom - SCREEN_MARGIN;
      const spaceAbove = trigger.top - SCREEN_MARGIN;
      let top = trigger.bottom + POPUP_GAP;
      if (height + POPUP_GAP > spaceBelow && spaceAbove > spaceBelow) {
        top = Math.max(SCREEN_MARGIN, trigger.top - POPUP_GAP - height);
      }

      popup.style.left = `${Math.round(left)}px`;
      popup.style.top = `${Math.round(top)}px`;
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, autoPosition, yearPickerOpen, visibleMonth]);

  const togglePicker = () => {
    if (!open && minMonthIndex !== null && visibleMonthIndex < minMonthIndex) {
      setVisibleMonth(new Date(minDateObject.getFullYear(), minDateObject.getMonth(), 1));
    }
    setOpen((previous) => !previous);
  };

  const days = useMemo(() => {
    const firstDay = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1
    ).getDay();
    const daysInMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      0
    ).getDate();
    return [
      ...Array.from({ length: firstDay }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
  }, [visibleMonth]);

  const selectDate = (day) => {
    const month = String(visibleMonth.getMonth() + 1).padStart(2, "0");
    const date = String(day).padStart(2, "0");
    const dateKey = `${visibleMonth.getFullYear()}-${month}-${date}`;
    if (isDateDisabled(dateKey)) return;
    onChange(dateKey);
    setOpen(false);
  };

  const popup = open && (
        <div
          ref={popupRef}
          className={`date-picker-popup${autoPosition ? " is-floating" : ""}`}
        >
          <div className="date-picker-nav">
            <button
              type="button"
              onClick={() =>
                setVisibleMonth(
                  new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1)
                )
              }
              aria-label="Previous month"
            >
              <ChevronLeft size={17} />
            </button>
            <div className="date-picker-heading">
              <span>
                {visibleMonth.toLocaleString("en-US", {
                  month: "long",
                })}
              </span>
              <button
                type="button"
                className="date-picker-year"
                onClick={() => setYearPickerOpen((previous) => !previous)}
              >
                {visibleMonth.getFullYear()}
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                setVisibleMonth(
                  new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1)
                )
              }
              aria-label="Next month"
            >
              <ChevronRight size={17} />
            </button>
          </div>
          {yearPickerOpen ? (
            <div className="date-picker-years">
              {Array.from({ length: 131 }, (_, index) => {
                const year = new Date().getFullYear() - 100 + index;
                return (
                  <button
                    type="button"
                    key={year}
                    className={year === visibleMonth.getFullYear() ? "selected" : ""}
                    onClick={() => {
                      setVisibleMonth(
                        new Date(year, visibleMonth.getMonth(), 1)
                      );
                      setYearPickerOpen(false);
                    }}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="date-picker-weekdays">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="date-picker-days">
                {days.map((day, index) => {
                  if (!day) return <span key={`empty-${index}`} />;
                  const dateKey = `${visibleMonth.getFullYear()}-${String(
                    visibleMonth.getMonth() + 1
                  ).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  return (
                    <button
                      type="button"
                      key={`${visibleMonth.getMonth()}-${day}`}
                      className={normalizedValue === dateKey ? "selected" : ""}
                      disabled={isDateDisabled(dateKey)}
                      onClick={() => selectDate(day)}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="date-picker-footer">
            <button type="button" onClick={() => onChange("")}>
              Clear
            </button>
            <button
              type="button"
              disabled={isDateDisabled(todayKey)}
              onClick={() => {
                const todayDate = new Date(`${todayKey}T00:00:00`);
                setVisibleMonth(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
                onChange(todayKey);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
  );

  return (
    <div className="date-picker" ref={wrapperRef}>
      <button
        type="button"
        className={`date-picker-trigger${open ? " is-open" : ""}`}
        onClick={togglePicker}
      >
        <span className={value ? "" : "date-picker-placeholder"}>
          {formatDisplayDate(value) || placeholder}
        </span>
        <CalendarDays size={17} />
      </button>

      {popup && (autoPosition ? createPortal(popup, document.body) : popup)}
    </div>
  );
}

export default DatePicker;
