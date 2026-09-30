import { createContext, useContext } from "react";

export const DialogContext = createContext(null);

export const DIALOG_ICONS = { danger: "!", warning: "!", info: "i", success: "✓" };

const useDialogs = () => {
    const context = useContext(DialogContext);
    if (!context) throw new Error("Dialog hooks must be used inside <DialogProvider>");
    return context;
};

// const confirm = useConfirm(); if (await confirm({ variant, title, message, ... })) { ... }
export const useConfirm = () => useDialogs().confirm;

// const showAlert = useAlert(); await showAlert({ variant, title, message });
export const useAlert = () => useDialogs().alert;
