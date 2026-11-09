// Floating dropdown menus (Department, Designation, CustomOptionSelect, employee search, DatePicker)
// must never sit over a confirm / alert dialog. Dialogs fire this event when they open; every open
// menu listens and closes itself. While a dialog is open, menus refuse to open.
import { useEffect } from "react";

export const CLOSE_MENUS_EVENT = "mpr:close-menus";

export const closeAllMenus = () => window.dispatchEvent(new Event(CLOSE_MENUS_EVENT));

// True while a confirm / alert dialog (Dialog.css overlay) is on screen
export const isDialogOpen = () => Boolean(document.querySelector(".app-alert-overlay"));

// Closes this menu (setOpen(false)) when a dialog opens
export function useCloseOnDialog(open, setOpen) {
    useEffect(() => {
        if (!open) return undefined;
        const close = () => setOpen(false);
        window.addEventListener(CLOSE_MENUS_EVENT, close);
        return () => window.removeEventListener(CLOSE_MENUS_EVENT, close);
    }, [open, setOpen]);
}
