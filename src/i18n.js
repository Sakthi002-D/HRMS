import { useLayoutEffect } from "react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

// Each portal remembers its own language in this browser
export const LANGUAGE_STORAGE_KEYS = {
    hr: "hrms-language-hr",
    employee: "hrms-language-employee",
};
// Old shared key (no longer used). Kept only so any old import doesn't break.
export const LANGUAGE_STORAGE_KEY = "hrms-language";

export const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "ar", label: "العربية (Arabic)" },
];

// The portal that is open right now: "hr", "employee", or null (Login, Careers, other pages)
let activePortal = null;

// Both portals keep the language only for the current login (sessionStorage, cleared on logout).
const storageFor = () => sessionStorage;

const readSavedLanguage = (portal) => {
    const key = LANGUAGE_STORAGE_KEYS[portal];
    if (!key) return "en";
    try {
        return storageFor(portal).getItem(key) === "ar" ? "ar" : "en";
    } catch {
        return "en";
    }
};

// Always start in English; a portal switches to its own saved language when it opens
i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
        ar: { translation: ar },
    },
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
});

// Switch the language and remember it for the portal that is open (HR or Employee only)
export function changeAppLanguage(code) {
    const next = code === "ar" ? "ar" : "en";
    i18n.changeLanguage(next);
    const key = LANGUAGE_STORAGE_KEYS[activePortal];
    if (!key) return; // Outside a portal: change for this visit only, save nothing
    try {
        storageFor(activePortal).setItem(key, next);
    } catch {
        // Storage blocked (private mode): the language still changes for this visit
    }
}

// Forget a portal's saved language (used on logout). Also removes any older localStorage copy.
export function clearPortalLanguage(portal) {
    const key = LANGUAGE_STORAGE_KEYS[portal];
    if (!key) return;
    try {
        storageFor(portal).removeItem(key);
        localStorage.removeItem(key);
    } catch {
        // Storage blocked: nothing to clear
    }
}

// Call once at the top of a portal's layout: usePortalLanguage("hr") / usePortalLanguage("employee").
// Opening the portal applies its saved language; leaving it (e.g. logout → Login) goes back to English.
export function usePortalLanguage(portal) {
    useLayoutEffect(() => {
        activePortal = portal;
        const saved = readSavedLanguage(portal);
        if (i18n.language !== saved) i18n.changeLanguage(saved);
        return () => {
            activePortal = null;
            if (i18n.language !== "en") i18n.changeLanguage("en");
        };
    }, [portal]);
}

// Arabic is written right-to-left: flip the page direction with the language
function applyDirection(language) {
    const html = document.documentElement;
    html.dir = language === "ar" ? "rtl" : "ltr";
    html.lang = language === "ar" ? "ar" : "en";
}
applyDirection(i18n.language);
i18n.on("languageChanged", applyDirection);

export default i18n;