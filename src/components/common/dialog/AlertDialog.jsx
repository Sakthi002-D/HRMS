// The app's message dialog ("Please check" / "Success"): icon, title, message and an OK button.
import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { DIALOG_ICONS } from "./dialogContext";
import useDialogFocus from "./useDialogFocus";
import useScrollLock from "./useScrollLock";
import "./Dialog.css";

const DEFAULT_TITLES = { danger: "Please check", warning: "Please check", info: "Notice", success: "Success" };

function AlertDialog({ open, onClose, variant = "danger", title, message, buttonText = "OK" }) {
    const dialogRef = useRef(null);
    const buttonRef = useRef(null);
    const titleId = useId();

    useDialogFocus(open, { dialogRef, initialFocusRef: buttonRef, onEscape: onClose });
    useScrollLock(open);

    if (!open) return null;

    return createPortal(
        <div className="app-alert-overlay" role="presentation" onClick={onClose}>
            <section
                ref={dialogRef}
                className={`app-alert-dialog app-dialog-${variant}`}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="app-alert-icon" aria-hidden="true">{DIALOG_ICONS[variant] || "!"}</div>
                <div className="app-alert-copy">
                    <h2 id={titleId}>{title || DEFAULT_TITLES[variant]}</h2>
                    <div className="app-dialog-message">{message}</div>
                </div>
                <button ref={buttonRef} type="button" className="app-alert-close" onClick={onClose}>{buttonText}</button>
            </section>
        </div>,
        document.body
    );
}

export default AlertDialog;
