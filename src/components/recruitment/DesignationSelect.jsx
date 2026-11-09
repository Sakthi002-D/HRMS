// Searchable Designation dropdown (MPR "Grade & Designation"): same look as the Department dropdown
// (mpr-dept-* classes in recruitment.css). The menu is drawn in document.body so nothing can clip it.
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isDialogOpen, useCloseOnDialog } from "../common/dialog/closeMenus";

function DesignationSelect({ value, onChange, options, disabled = false, placeholder, invalid = false }) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState(null);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);
    useCloseOnDialog(open, setOpen);

    const search = query.trim().toLowerCase();
    const matches = search ? options.filter((name) => name.toLowerCase().includes(search)) : options;

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
                width: Math.max(rect.width, 220),
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
        if (isDialogOpen()) return;
        setQuery("");
        setOpen((current) => !current);
    };

    const choose = (name) => {
        onChange(name);
        setOpen(false);
    };

    return (
        <div className="mpr-dept-picker">
            <button
                ref={buttonRef}
                type="button"
                className={`mpr-dept-field${value ? "" : " is-placeholder"}${open ? " is-open" : ""}${invalid ? " is-invalid" : ""}`}
                onClick={toggle}
                disabled={disabled}
                aria-expanded={open}
                aria-invalid={invalid}
            >
                <span className="mpr-dept-field-value">{value || placeholder}</span>
                <span className="mpr-dept-field-chevron" aria-hidden="true">{open ? "⌃" : "⌄"}</span>
            </button>

            {open && menuStyle && createPortal(
                <div ref={menuRef} className="mpr-dept-menu" style={menuStyle}>
                    <div className="mpr-dept-search">
                        <input
                            type="text"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search designation"
                            aria-label="Search designations"
                            autoFocus
                        />
                    </div>

                    {matches.map((name) => (
                        <div key={name}>
                            <button
                                type="button"
                                className={`mpr-dept-option${value === name ? " is-selected" : ""}`}
                                onClick={() => choose(name)}
                            >
                                {name}
                            </button>
                        </div>
                    ))}

                    {matches.length === 0 && <p className="mpr-dept-empty">No designations found</p>}
                </div>,
                document.body
            )}
        </div>
    );
}

export default DesignationSelect;
