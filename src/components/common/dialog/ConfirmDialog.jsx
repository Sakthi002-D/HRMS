// Confirmation dialog in the style of the app's "Please check" alert dialog.
import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { DIALOG_ICONS } from "./dialogContext";
import useDialogFocus from "./useDialogFocus";
import useScrollLock from "./useScrollLock";
import "./Dialog.css";

function ConfirmDialog({
    open,
    onConfirm,
    onCancel,
    onDismiss, // Esc / backdrop; defaults to onCancel
    variant = "info",
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    loading = false,
    error = "",
}) {
    const dialogRef = useRef(null);
    const cancelRef = useRef(null);
    const titleId = useId();
    const messageId = useId();

    const cancel = () => {
        if (!loading) onCancel?.();
    };
    const dismiss = () => {
        if (!loading) (onDismiss || onCancel)?.();
    };

    // Cancel gets focus first: the safer choice for destructive actions
    useDialogFocus(open, { dialogRef, initialFocusRef: cancelRef, onEscape: dismiss });
    useScrollLock(open);

    if (!open) return null;

    return createPortal(
        <div className="app-alert-overlay" role="presentation" onClick={dismiss}>
            <section
                ref={dialogRef}
                className={`app-alert-dialog app-dialog-${variant}`}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={messageId}
                aria-busy={loading}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="app-alert-icon" aria-hidden="true">{DIALOG_ICONS[variant] || "!"}</div>
                <div className="app-alert-copy">
                    <h2 id={titleId}>{title}</h2>
                    <div id={messageId} className="app-dialog-message">{message}</div>
                    {error && <p className="app-dialog-error" role="alert">{error}</p>}
                </div>
                <div className="app-dialog-actions">
                    <button ref={cancelRef} type="button" className="app-dialog-button secondary" onClick={cancel} disabled={loading}>
                        {cancelText}
                    </button>
                    <button type="button" className={`app-dialog-button primary ${variant}`} onClick={() => !loading && onConfirm?.()} disabled={loading}>
                        {loading && <span className="app-dialog-spinner" aria-hidden="true" />}
                        {confirmText}
                    </button>
                </div>
            </section>
        </div>,
        document.body
    );
}

export default ConfirmDialog;
