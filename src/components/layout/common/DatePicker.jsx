import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import "./DatePicker.css";

const formatDisplayDate = (value) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
};

function DatePicker({ value, onChange, placeholder = "DD-MM-YYYY" }) {
  const wrapperRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const selectedDate = value ? new Date(`${value}T00:00:00`) : new Date();
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );

  useEffect(() => {
    const closePicker = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closePicker);
    return () => document.removeEventListener("mousedown", closePicker);
  }, []);

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
    onChange(`${visibleMonth.getFullYear()}-${month}-${date}`);
    setOpen(false);
  };

  return (
    <div className="date-picker" ref={wrapperRef}>
      <button
        type="button"
        className={`date-picker-trigger${open ? " is-open" : ""}`}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className={value ? "" : "date-picker-placeholder"}>
          {formatDisplayDate(value) || placeholder}
        </span>
        <CalendarDays size={17} />
      </button>

      {open && (
        <div className="date-picker-popup">
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
                {days.map((day, index) =>
                  day ? (
                    <button
                      type="button"
                      key={`${visibleMonth.getMonth()}-${day}`}
                      className={
                        value ===
                        `${visibleMonth.getFullYear()}-${String(
                          visibleMonth.getMonth() + 1
                        ).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                          ? "selected"
                          : ""
                      }
                      onClick={() => selectDate(day)}
                    >
                      {day}
                    </button>
                  ) : (
                    <span key={`empty-${index}`} />
                  )
                )}
              </div>
            </>
          )}
          <div className="date-picker-footer">
            <button type="button" onClick={() => onChange("")}>
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                const month = String(today.getMonth() + 1).padStart(2, "0");
                const date = String(today.getDate()).padStart(2, "0");
                onChange(`${today.getFullYear()}-${month}-${date}`);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DatePicker;
