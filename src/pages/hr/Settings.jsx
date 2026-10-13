import { useState } from "react";
import { Bell, Briefcase, Check, ChevronDown, DoorOpen, GitBranch, Globe2, LockKeyhole, Mail, Palette, Save, ShieldCheck, UserRound } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { api, getSessionEmployeeId } from "../../components/recruitment/recruitmentApi";
import ApprovalWorkflowSettings from "./settings/ApprovalWorkflowSettings";
import RecruitmentMastersSettings from "./settings/RecruitmentMastersSettings";
import { ResignationNoticeSettings } from "./settings/ResignationSettings";
import "./Settings.css";
import { useTranslation } from "react-i18next";
import { LANGUAGES, changeAppLanguage } from "../../i18n";

const settingGroups = [
    { id: "general", label: "General Settings", icon: Globe2 },
    { id: "website", label: "Website Settings", icon: Palette },
    { id: "app", label: "App Settings", icon: Bell },
    { id: "system", label: "System Settings", icon: ShieldCheck },
    { id: "financial", label: "Financial Settings", icon: Save },
    { id: "other", label: "Other Settings", icon: UserRound },
    { id: "approval", label: "Approval Workflows", icon: GitBranch },
    { id: "recruitment", label: "Recruitment Masters", icon: Briefcase },
    { id: "resignation", label: "Resignation", icon: DoorOpen },
];

// These groups save through their own buttons (stored on the server)
const SERVER_GROUPS = ["approval", "recruitment", "resignation"];

const initialSettings = {
    companyName: "Shelter Group",
    companyEmail: "admin@sheltergroup.com",
    timezone: "Asia/Kolkata",
    language: "English",
    primaryColor: "#042330",
    dateFormat: "DD-MM-YYYY",
    emailNotifications: true,
    leaveNotifications: true,
    attendanceReminders: true,
    sessionTimeout: "30",
    currency: "INR",
    currencySymbol: "₹",
    supportEmail: "support@sheltergroup.com",
};

// Currencies offered in Financial Settings, with the symbol filled in automatically
const CURRENCIES = [
    { code: "QAR", name: "Qatari Riyal", symbol: "QR" },
    { code: "INR", name: "Indian Rupee", symbol: "₹" },
    { code: "AED", name: "UAE Dirham", symbol: "AED" },
    { code: "SAR", name: "Saudi Riyal", symbol: "SAR" },
    { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD" },
    { code: "BHD", name: "Bahraini Dinar", symbol: "BD" },
    { code: "OMR", name: "Omani Rial", symbol: "OMR" },
    { code: "USD", name: "US Dollar", symbol: "$" },
    { code: "EUR", name: "Euro", symbol: "€" },
    { code: "GBP", name: "British Pound", symbol: "£" },
];

function Settings() {
    const { t } = useTranslation();
    const [activeGroup, setActiveGroup] = useState("general");
    const [settings, setSettings] = useState(() => {
        try {
            return { ...initialSettings, ...JSON.parse(localStorage.getItem("hrmsSettings") || "{}") };
        } catch {
            return initialSettings;
        }
    });
    const [saved, setSaved] = useState(false);

    const updateSetting = (field, value) => {
        setSettings((current) => ({ ...current, [field]: value }));
        setSaved(false);
    };

    const saveSettings = () => {
        localStorage.setItem("hrmsSettings", JSON.stringify(settings));
        setSaved(true);

        // Manpower Requests use the company currency and timezone ("today" for application dates), so share them with the server
        api("/api/recruitment/settings", {
            method: "PUT",
            body: { actor_id: getSessionEmployeeId(), settings: { currency: settings.currency, currencySymbol: settings.currencySymbol, timezone: settings.timezone } },
        }).catch((error) => console.error("Unable to sync currency / timezone for recruitment:", error));
    };

    return (
        <DashboardLayout>
            <div className="settings-page">
                <header className="settings-header">
                    <div>
                        <h1>{t("settings.title", { defaultValue: "Settings" })}</h1>
                        <p>{t("settings.subtitle", { defaultValue: "Manage your HRMS preferences and application configuration." })}</p>
                    </div>
                </header>

                <div className="settings-layout">
                    <aside className="settings-navigation">
                        {settingGroups.map(({ id, label, icon: Icon }) => (
                            <button key={id} className={activeGroup === id ? "active" : ""} onClick={() => setActiveGroup(id)}>
                                <Icon size={17} />
                                <span>{t(`settings.menu.${id}`, { defaultValue: label })}</span>
                                <ChevronDown size={15} />
                            </button>
                        ))}
                    </aside>

                    <main className="settings-content">
                        <section className="settings-card">
                            <div className="settings-card-heading">
                                <div><span className="settings-eyebrow">{t("settings.configuration", { defaultValue: "CONFIGURATION" })}</span><h2>{t(`settings.menu.${activeGroup}`, { defaultValue: settingGroups.find((group) => group.id === activeGroup)?.label })}</h2><p>{t("settings.cardSubtitle", { defaultValue: "Update the settings used across your HRMS workspace." })}</p></div>
                                <div className="settings-heading-icon"><LockKeyhole size={20} /></div>
                            </div>

                            {activeGroup === "general" && <GeneralSettings settings={settings} updateSetting={updateSetting} />}
                            {activeGroup === "website" && <WebsiteSettings settings={settings} updateSetting={updateSetting} />}
                            {activeGroup === "app" && <AppSettings settings={settings} updateSetting={updateSetting} />}
                            {activeGroup === "system" && <SystemSettings settings={settings} updateSetting={updateSetting} />}
                            {activeGroup === "financial" && <FinancialSettings settings={settings} updateSetting={updateSetting} />}
                            {activeGroup === "other" && <OtherSettings settings={settings} updateSetting={updateSetting} />}
                            {activeGroup === "approval" && <ApprovalWorkflowSettings />}
                            {activeGroup === "recruitment" && <RecruitmentMastersSettings />}
                            {activeGroup === "resignation" && <ResignationNoticeSettings />}

                            {!SERVER_GROUPS.includes(activeGroup) && (
                                <div className="settings-card-footer">
                                    {saved && <span className="settings-saved"><Check size={15} /> {t("settings.common.changesSaved", { defaultValue: "Changes saved" })}</span>}
                                    <button className="settings-save-button" onClick={saveSettings}><Save size={15} /> {t("profileEdit.save", { defaultValue: "Save Changes" })}</button>
                                </div>
                            )}
                        </section>
                    </main>
                </div>
            </div>
        </DashboardLayout>
    );
}

function Field({ label, children, hint }) {
    return <label className="settings-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function GeneralSettings({ settings, updateSetting }) {
    const { t, i18n } = useTranslation();
    const currentLanguage = i18n.language === "ar" ? "ar" : "en";

    return <div className="settings-form-grid">
        <Field label={t("settings.general.companyName", { defaultValue: "Company Name" })}><input value={settings.companyName} onChange={(event) => updateSetting("companyName", event.target.value)} /></Field>
        <Field label={t("settings.general.companyEmail", { defaultValue: "Company Email" })}><input type="email" dir="ltr" value={settings.companyEmail} onChange={(event) => updateSetting("companyEmail", event.target.value)} /></Field>
        <Field label={t("settings.general.timezone", { defaultValue: "Timezone" })}><select dir="ltr" value={settings.timezone} onChange={(event) => updateSetting("timezone", event.target.value)}><option value="Asia/Kolkata">Asia/Kolkata</option><option value="Asia/Qatar">Asia/Qatar</option><option value="UTC">UTC</option></select></Field>
        <Field label={t("settings.language")} hint={t("settings.general.languageHint", { defaultValue: "Changes the language for the HR portal until you log out." })}>
            <select
                value={currentLanguage}
                onChange={(event) => {
                    changeAppLanguage(event.target.value);
                    updateSetting("language", event.target.value === "ar" ? "Arabic" : "English");
                }}
            >
                {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
            </select>
        </Field>
    </div>;
}

function WebsiteSettings({ settings, updateSetting }) {
    const { t } = useTranslation();
    return <div className="settings-form-grid">
        <Field label={t("settings.website.primaryColor", { defaultValue: "Primary Theme Color" })} hint={t("settings.website.primaryColorHint", { defaultValue: "Used for main buttons and accents." })}><div className="color-field"><input type="color" value={settings.primaryColor} onChange={(event) => updateSetting("primaryColor", event.target.value)} /><input dir="ltr" value={settings.primaryColor} onChange={(event) => updateSetting("primaryColor", event.target.value)} /></div></Field>
        <Field label={t("settings.website.dateFormat", { defaultValue: "Date Format" })}><select dir="ltr" value={settings.dateFormat} onChange={(event) => updateSetting("dateFormat", event.target.value)}><option value="DD-MM-YYYY">DD-MM-YYYY</option><option value="MM-DD-YYYY">MM-DD-YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option></select></Field>
    </div>;
}

function AppSettings({ settings, updateSetting }) {
    const { t } = useTranslation();
    return <div className="settings-toggle-list">
        <Toggle label={t("settings.app.emailNotifications", { defaultValue: "Email Notifications" })} description={t("settings.app.emailNotificationsHint", { defaultValue: "Receive important HRMS updates by email." })} checked={settings.emailNotifications} onChange={(value) => updateSetting("emailNotifications", value)} />
        <Toggle label={t("settings.app.leaveNotifications", { defaultValue: "Leave Notifications" })} description={t("settings.app.leaveNotificationsHint", { defaultValue: "Notify HR when a leave request is submitted." })} checked={settings.leaveNotifications} onChange={(value) => updateSetting("leaveNotifications", value)} />
        <Toggle label={t("settings.app.attendanceReminders", { defaultValue: "Attendance Reminders" })} description={t("settings.app.attendanceRemindersHint", { defaultValue: "Send reminders for missing attendance records." })} checked={settings.attendanceReminders} onChange={(value) => updateSetting("attendanceReminders", value)} />
    </div>;
}

function SystemSettings({ settings, updateSetting }) {
    const { t } = useTranslation();
    return <div className="settings-form-grid"><Field label={t("settings.system.sessionTimeout", { defaultValue: "Session Timeout" })}><select value={settings.sessionTimeout} onChange={(event) => updateSetting("sessionTimeout", event.target.value)}><option value="15">{t("settings.system.minutes", { count: 15, defaultValue: "{{count}} minutes" })}</option><option value="30">{t("settings.system.minutes", { count: 30, defaultValue: "{{count}} minutes" })}</option><option value="60">{t("settings.system.minutes", { count: 60, defaultValue: "{{count}} minutes" })}</option></select></Field></div>;
}

function FinancialSettings({ settings, updateSetting }) {
    const { t } = useTranslation();
    // Choosing a currency also fills in its symbol (HR can still edit the symbol afterwards)
    const changeCurrency = (code) => {
        updateSetting("currency", code);
        const match = CURRENCIES.find((currency) => currency.code === code);
        if (match) updateSetting("currencySymbol", match.symbol);
    };

    return <div className="settings-form-grid">
        <Field label={t("settings.financial.currency", { defaultValue: "Currency" })}>
            <select value={settings.currency} onChange={(event) => changeCurrency(event.target.value)}>
                {CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>{currency.code} – {t(`settings.financial.currencies.${currency.code}`, { defaultValue: currency.name })}</option>
                ))}
            </select>
        </Field>
        <Field label={t("settings.financial.currencySymbol", { defaultValue: "Currency Symbol" })} hint={t("settings.financial.currencySymbolHint", { defaultValue: "Filled in automatically from the currency. You can change it if needed." })}>
            <input dir="ltr" value={settings.currencySymbol} onChange={(event) => updateSetting("currencySymbol", event.target.value)} />
        </Field>
    </div>;
}

function OtherSettings({ settings, updateSetting }) {
    const { t } = useTranslation();
    return <div className="settings-form-grid"><Field label={t("settings.other.supportEmail", { defaultValue: "Support Email" })}><input type="email" dir="ltr" value={settings.supportEmail} onChange={(event) => updateSetting("supportEmail", event.target.value)} /></Field></div>;
}

function Toggle({ label, description, checked, onChange }) {
    return <div className="settings-toggle-row"><div><strong>{label}</strong><p>{description}</p></div><button type="button" className={`settings-switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} aria-pressed={checked}><span /></button></div>;
}

export default Settings;
