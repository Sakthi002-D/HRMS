import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

// The user's language choice is remembered in this browser
export const LANGUAGE_STORAGE_KEY = "hrms-language";

export const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "ar", label: "العربية (Arabic)" },
];

const savedLanguage = (() => {
    try {
        return localStorage.getItem(LANGUAGE_STORAGE_KEY) === "ar" ? "ar" : "en";
    } catch {
        return "en";
    }
})();

i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
        ar: { translation: ar },
    },
    lng: savedLanguage,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
});

// Switch the whole app's language and remember it
export function changeAppLanguage(code) {
    const next = code === "ar" ? "ar" : "en";
    i18n.changeLanguage(next);
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
        // Storage blocked (private mode): the language still changes for this visit
    }
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