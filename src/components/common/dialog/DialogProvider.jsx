// App-wide dialogs, replacing window.confirm / window.alert (hooks in dialogContext.js).
//
//   const confirm = useConfirm();
//   if (await confirm({ variant: "danger", title: "Delete?", message: "..." })) { ... }
//
// Pass onConfirm (async) to keep the dialog open while it runs: the confirm button
// shows a spinner (and loadingText), a thrown error is shown in the dialog, and the
// Promise resolves true only after onConfirm succeeds. Esc / backdrop resolve
// `dismissValue` (default false), for dialogs whose Cancel button is an action.
//
//   const showAlert = useAlert();
//   await showAlert({ variant: "success", message: "Saved" });   // resolves when closed
import { useCallback, useMemo, useRef, useState } from "react";
import AlertDialog from "./AlertDialog";
import ConfirmDialog from "./ConfirmDialog";
import { DialogContext } from "./dialogContext";

function DialogProvider({ children }) {
    const [confirmState, setConfirmState] = useState(null);
    const [alertQueue, setAlertQueue] = useState([]);
    const busyRef = useRef(false);

    const confirm = useCallback((options = {}) => new Promise((resolve) => {
        busyRef.current = false;
        setConfirmState({ options, resolve, loading: false, error: "" });
    }), []);

    const showAlert = useCallback((options = {}) => new Promise((resolve) => {
        const alert = typeof options === "string" ? { message: options } : options;
        setAlertQueue((queue) => [...queue, { ...alert, resolve }]);
    }), []);

    const value = useMemo(() => ({ confirm, alert: showAlert }), [confirm, showAlert]);

    const closeConfirm = (result) => {
        confirmState?.resolve(result);
        setConfirmState(null);
    };

    const handleConfirm = async () => {
        // The ref blocks a double click before React re-renders the disabled button
        if (!confirmState || busyRef.current) return;
        const { onConfirm } = confirmState.options;
        if (!onConfirm) {
            closeConfirm(true);
            return;
        }
        busyRef.current = true;
        setConfirmState((current) => current && { ...current, loading: true, error: "" });
        try {
            await onConfirm();
            busyRef.current = false;
            closeConfirm(true);
        } catch (error) {
            busyRef.current = false;
            setConfirmState((current) => current && { ...current, loading: false, error: error?.message || "Something went wrong. Please try again." });
        }
    };

    const handleCancel = () => {
        if (!busyRef.current) closeConfirm(false);
    };

    // Esc / backdrop resolve options.dismissValue (default false, same as Cancel)
    const handleDismiss = () => {
        if (!busyRef.current) closeConfirm(confirmState?.options.dismissValue ?? false);
    };

    const currentAlert = alertQueue[0];
    const closeAlert = () => {
        currentAlert?.resolve();
        setAlertQueue((queue) => queue.slice(1));
    };

    const options = confirmState?.options || {};

    return (
        <DialogContext.Provider value={value}>
            {children}
            <ConfirmDialog
                open={Boolean(confirmState)}
                variant={options.variant}
                title={options.title}
                message={options.message}
                cancelText={options.cancelText}
                confirmText={confirmState?.loading && options.loadingText ? options.loadingText : options.confirmText}
                loading={Boolean(confirmState?.loading)}
                error={confirmState?.error}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
                onDismiss={handleDismiss}
            />
            <AlertDialog
                open={!confirmState && Boolean(currentAlert)}
                variant={currentAlert?.variant}
                title={currentAlert?.title}
                message={currentAlert?.message}
                buttonText={currentAlert?.buttonText}
                onClose={closeAlert}
            />
        </DialogContext.Provider>
    );
}

export default DialogProvider;
