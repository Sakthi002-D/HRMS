// Searchable employee dropdown (MPR "Employee Being Replaced"): same look as the Department dropdown
// (mpr-dept-* classes in recruitment.css). The menu is drawn in document.body so nothing can clip it.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const optionLabel = (employee) => {
    const details = [employee.designation, employee.department].filter(Boolean).join(" · ");
    return `${employee.name} (${employee.employee_id})${details ? ` – ${details}` : ""}`;
};

function EmployeeSearchSelect({ value, onChange, employees, loading = false, loadError = "", savedName = "", placeholder }) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState(null);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);

    const sorted = useMemo(() => [...employees].sort((a, b) => String(a.name).localeCompare(String(b.name))), [employees]);
    const search = query.trim().toLowerCase();
    const matches = search
        ? sorted.filter((employee) => [employee.name, employee.employee_id, employee.designation, employee.department].some((field) => String(field || "").toLowerCase().includes(search)))
        : sorted;

    const selected = sorted.find((employee) => employee.employee_id === value);
    // A saved MPR may name someone who is no longer active: still show them
    const selectedLabel = selected ? optionLabel(selected) : value && (savedName ? `${savedName} (${value})` : value);

    // Keeps the menu lined up with the field while it is open
    useLayoutEffect(() => {
        if (!open) return undefined;

        const placeMenu = () => {
            const button = buttonRef.current;
            if (!button) {
                setOpen(false);
                return;
            }

            const rect = button.getBoundingClientRect();

            // Field scrolled out of the form's visible area: close the menu
            const scrollBox = button.closest(".mpr-accordion-form");
            if (scrollBox) {
                const box = scrollBox.getBoundingClientRect();
                if (rect.bottom < box.top || rect.top > box.bottom) {
                    setOpen(false);
                    return;
                }
            }

            const gap = 4;
            const edge = 8;
            const preferredHeight = 280;
            const spaceBelow = window.innerHeight - rect.bottom - gap - edge;
            const spaceAbove = rect.top - gap - edge;
            const openUp = spaceBelow < Math.min(preferredHeight, 180) && spaceAbove > spaceBelow;

            setMenuStyle({
                left: rect.left,
                width: rect.width,
                maxHeight: Math.max(140, Math.min(preferredHeight, openUp ? spaceAbove : spaceBelow)),
                ...(openUp
                    ? { bottom: window.innerHeight - rect.top + gap }
                    : { top: rect.bottom + gap }),
            });
        };

        const closeOnOutsideClick = (event) => {
            if (buttonRef.current?.contains(event.target)) return;
            if (menuRef.current?.contains(event.target)) return;
            setOpen(false);
        };

        const closeOnEscape = (event) => {
            if (event.key === "Escape") setOpen(false);
        };

        placeMenu();
        window.addEventListener("scroll", placeMenu, true);
        window.addEventListener("resize", placeMenu);
        document.addEventListener("pointerdown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);

        return () => {
            window.removeEventListener("scroll", placeMenu, true);
            window.removeEventListener("resize", placeMenu);
            document.removeEventListener("pointerdown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [open]);

    const toggle = () => {
        setQuery("");
        setOpen((current) => !current);
    };

    const choose = (employeeId) => {
        onChange(employeeId);
        setOpen(false);
    };

    const emptyText = loading ? "Loading..." : loadError || "No employees found";

    return (
        <div className="mpr-dept-picker">
            <button
                ref={buttonRef}
                type="button"
                className={`mpr-dept-field${selectedLabel ? "" : " is-placeholder"}${open ? " is-open" : ""}`}
                onClick={toggle}
                aria-expanded={open}
            >
                <span className="mpr-dept-field-value">{selectedLabel || placeholder}</span>
                <span className="mpr-dept-field-chevron" aria-hidden="true">{open ? "⌃" : "⌄"}</span>
            </button>

            {open && menuStyle && createPortal(
                <div ref={menuRef} className="mpr-dept-menu" style={menuStyle}>
                    <div className="mpr-dept-search">
                        <input
                            type="text"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search name, ID, designation or department"
                            aria-label="Search employees"
                            autoFocus
                        />
                    </div>

                    {matches.map((employee) => (
                        <div key={employee.employee_id}>
                            <button
                                type="button"
                                className={`mpr-dept-option${value === employee.employee_id ? " is-selected" : ""}`}
                                onClick={() => choose(employee.employee_id)}
                            >
                                {optionLabel(employee)}
                            </button>
                        </div>
                    ))}

                    {matches.length === 0 && <p className="mpr-dept-empty">{emptyText}</p>}
                </div>,
                document.body
            )}
        </div>
    );
}

export default EmployeeSearchSelect;
