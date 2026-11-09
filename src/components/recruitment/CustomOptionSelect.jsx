// Dropdown with a "+ Other" option: the user can add their own options (kept in this browser's
// localStorage under `storageKey`) and delete them again with the red ×. Built-in options can't be deleted.
// Same look and behaviour as the MPR Department dropdown (mpr-dept-* classes in recruitment.css).
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isDialogOpen, useCloseOnDialog } from "../common/dialog/closeMenus";

export const OTHER_OPTION = "Other";

const readSavedOptions = (storageKey) => {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
        return Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : [];
    } catch {
        return [];
    }
};

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

function CustomOptionSelect({ id, menuClassName = "", value, onChange, options, storageKey, placeholder, otherPlaceholder, itemLabel, onError, disabled = false }) {
    const [customOptions, setCustomOptions] = useState(() => readSavedOptions(storageKey));
    const [newOption, setNewOption] = useState("");
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState(null);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);
    useCloseOnDialog(open, setOpen);

    const hasValue = Boolean(value) && value !== OTHER_OPTION;
    // A saved MPR (draft / Sent Back) may use a custom option this browser doesn't know yet: still list it
    const unknownValue = hasValue && ![...options, ...customOptions].includes(value) ? value : null;

    const saveCustomOptions = (list) => {
        setCustomOptions(list);
        try {
            localStorage.setItem(storageKey, JSON.stringify(list));
        } catch {
            // Storage blocked (private mode): the list still works until the page is refreshed
        }
    };

    // The menu is drawn in document.body (a portal) with position: fixed,
    // so the form's scroll box and the accordion cards can never clip it.
    // This keeps the menu lined up with the field while it is open.
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
            const preferredHeight = 240;
            const spaceBelow = window.innerHeight - rect.bottom - gap - edge;
            const spaceAbove = rect.top - gap - edge;
            const openUp = spaceBelow < Math.min(preferredHeight, 160) && spaceAbove > spaceBelow;
            const maxHeight = Math.max(120, Math.min(preferredHeight, openUp ? spaceAbove : spaceBelow));

            setMenuStyle({
                left: rect.left,
                width: rect.width,
                maxHeight,
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

    const chooseOption = (option) => {
        onChange(option);
        onError("");
        setOpen(false);
    };

    const chooseOther = () => {
        setNewOption("");
        onError("");
        setOpen(false);
        onChange(OTHER_OPTION);
    };

    const addOption = () => {
        const name = newOption.trim();

        if (!name || sameName(name, OTHER_OPTION)) {
            onError(`Enter a valid ${itemLabel} name.`);
            return;
        }

        if ([...options, ...customOptions].some((item) => sameName(item, name))) {
            onError(`This ${itemLabel} already exists.`);
            return;
        }

        saveCustomOptions([...customOptions, name]);
        onChange(name);
        setNewOption("");
        onError("");
    };

    const deleteOption = (option) => {
        saveCustomOptions(customOptions.filter((item) => item !== option));
        if (value === option) onChange("");
        onError("");
    };

    const optionButton = (option) => (
        <button
            type="button"
            className={`mpr-dept-option${value === option ? " is-selected" : ""}`}
            onClick={() => chooseOption(option)}
        >
            {option}
        </button>
    );

    return (
        <>
            <div className="mpr-dept-picker">
                <button
                    ref={buttonRef}
                    id={id}
                    type="button"
                    className={`mpr-dept-field${hasValue ? "" : " is-placeholder"}${open ? " is-open" : ""}`}
                    onClick={() => !isDialogOpen() && setOpen((current) => !current)}
                    disabled={disabled}
                    aria-expanded={open}
                >
                    <span className="mpr-dept-field-value">{hasValue ? value : placeholder}</span>
                    <span className="mpr-dept-field-chevron" aria-hidden="true">{open ? "⌃" : "⌄"}</span>
                </button>

                {open && menuStyle && createPortal(
                    <div ref={menuRef} className={`mpr-dept-menu ${menuClassName}`.trim()} style={menuStyle}>
                        {options.map((option) => <div key={option}>{optionButton(option)}</div>)}

                        {unknownValue && <div>{optionButton(unknownValue)}</div>}

                        {customOptions.map((option) => (
                            <div key={option} className="mpr-dept-option-row">
                                {optionButton(option)}
                                <button
                                    type="button"
                                    className="mpr-dept-delete"
                                    onClick={() => deleteOption(option)}
                                    title={`Delete ${option}`}
                                    aria-label={`Delete ${option}`}
                                >
                                    ×
                                </button>
                            </div>
                        ))}

                        <button type="button" className="mpr-dept-option is-other" onClick={chooseOther}>
                            + Other
                        </button>
                    </div>,
                    document.body
                )}
            </div>

            {value === OTHER_OPTION && (
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <input
                        type="text"
                        value={newOption}
                        onChange={(event) => setNewOption(event.target.value)}
                        onKeyDown={(event) => {
                            // Enter adds the option instead of submitting the whole form
                            if (event.key === "Enter") {
                                event.preventDefault();
                                addOption();
                            }
                        }}
                        placeholder={otherPlaceholder}
                        maxLength={100}
                        aria-label={otherPlaceholder}
                    />
                    <button type="button" className="save-job-btn" onClick={addOption} disabled={!newOption.trim()}>
                        Add
                    </button>
                </div>
            )}
        </>
    );
}

export default CustomOptionSelect;
