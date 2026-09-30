import { useEffect, useRef } from "react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal dialog keyboard handling: focuses `initialFocusRef` on open, keeps Tab
// inside the dialog, calls onEscape for Esc, and restores the previous focus on close.
// Keys are handled in the capture phase and Esc is stopped there, so a modal
// underneath (or a date picker inside it) never sees it.
export default function useDialogFocus(open, { dialogRef, initialFocusRef, onEscape }) {
    const onEscapeRef = useRef(onEscape);

    useEffect(() => {
        onEscapeRef.current = onEscape;
    }, [onEscape]);

    useEffect(() => {
        if (!open) return undefined;
        const previous = document.activeElement;
        (initialFocusRef?.current || dialogRef.current)?.focus();

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onEscapeRef.current?.();
                return;
            }
            if (event.key !== "Tab" || !dialogRef.current) return;

            const focusable = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
            if (focusable.length === 0) {
                event.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!dialogRef.current.contains(document.activeElement)) {
                event.preventDefault();
                first.focus();
            } else if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
        };
    }, [open, dialogRef, initialFocusRef]);
}
