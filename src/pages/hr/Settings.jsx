import { useState } from "react";
import { Bell, Check, ChevronDown, Globe2, LockKeyhole, Mail, Palette, Save, ShieldCheck, UserRound } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./Settings.css";

const settingGroups = [
    { id: "general", label: "General Settings", icon: Globe2 },
    { id: "website", label: "Website Settings", icon: Palette },
    { id: "app", label: "App Settings", icon: Bell },
    { id: "system", label: "System Settings", icon: ShieldCheck },
    { id: "financial", label: "Financial Settings", icon: Save },
    { id: "other", label: "Other Settings", icon: UserRound },
];

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

function Settings() {
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
    };

    return (
        <DashboardLayout>
            <div className="settings-page">
                <header className="settings-header">
                    <div>
                        <h1>Settings</h1>
                        <p>Manage your HRMS preferences and application configuration.</p>
                    </div>
                </header>

                <div className="settings-layout">
                    <aside className="settings-navigation">
                        {settingGroups.map(({ id, label, icon: Icon }) => (
                            <button key={id} className={activeGroup === id ? "active" : ""} onClick={() => setActiveGroup(id)}>
                                <Icon size={17} />
                                <span>{label}</span>
                                <ChevronDown size={15} />
                            </button>
                        ))}
                    </aside>

                    <main className="settings-content">
                        <section className="settings-card">
                            <div className="settings-card-heading">
                                <div><span className="settings-eyebrow">CONFIGURATION</span><h2>{settingGroups.find((group) => group.id === activeGroup)?.label}</h2><p>Update the settings used across your HRMS workspace.</p></div>
                                <div className="settings-heading-icon"><LockKeyhole size={20} /></div>
                            </div>

                            {activeGroup === "general" && <GeneralSettings settings={settings} updateSetting={updateSetting} />}
                            {activeGroup === "website" && <WebsiteSettings settings={settings} updateSetting={updateSetting} />}
                            {activeGroup === "app" && <AppSettings settings={settings} updateSetting={updateSetting} />}
                            {activeGroup === "system" && <SystemSettings settings={settings} updateSetting={updateSetting} />}
                            {activeGroup === "financial" && <FinancialSettings settings={settings} updateSetting={updateSetting} />}
                            {activeGroup === "other" && <OtherSettings settings={settings} updateSetting={updateSetting} />}

                            <div className="settings-card-footer">
                                {saved && <span className="settings-saved"><Check size={15} /> Changes saved</span>}
                                <button className="settings-save-button" onClick={saveSettings}><Save size={15} /> Save Changes</button>
                            </div>
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
    return <div className="settings-form-grid">
        <Field label="Company Name"><input value={settings.companyName} onChange={(event) => updateSetting("companyName", event.target.value)} /></Field>
        <Field label="Company Email"><input type="email" value={settings.companyEmail} onChange={(event) => updateSetting("companyEmail", event.target.value)} /></Field>
        <Field label="Timezone"><select value={settings.timezone} onChange={(event) => updateSetting("timezone", event.target.value)}><option>Asia/Kolkata</option><option>Asia/Qatar</option><option>UTC</option></select></Field>
        <Field label="Language"><select value={settings.language} onChange={(event) => updateSetting("language", event.target.value)}><option>English</option><option>Tamil</option><option>Hindi</option></select></Field>
    </div>;
}

function WebsiteSettings({ settings, updateSetting }) {
    return <div className="settings-form-grid">
        <Field label="Primary Theme Color" hint="Used for main buttons and accents."><div className="color-field"><input type="color" value={settings.primaryColor} onChange={(event) => updateSetting("primaryColor", event.target.value)} /><input value={settings.primaryColor} onChange={(event) => updateSetting("primaryColor", event.target.value)} /></div></Field>
        <Field label="Date Format"><select value={settings.dateFormat} onChange={(event) => updateSetting("dateFormat", event.target.value)}><option>DD-MM-YYYY</option><option>MM-DD-YYYY</option><option>YYYY-MM-DD</option></select></Field>
    </div>;
}

function AppSettings({ settings, updateSetting }) {
    return <div className="settings-toggle-list">
        <Toggle label="Email Notifications" description="Receive important HRMS updates by email." checked={settings.emailNotifications} onChange={(value) => updateSetting("emailNotifications", value)} />
        <Toggle label="Leave Notifications" description="Notify HR when a leave request is submitted." checked={settings.leaveNotifications} onChange={(value) => updateSetting("leaveNotifications", value)} />
        <Toggle label="Attendance Reminders" description="Send reminders for missing attendance records." checked={settings.attendanceReminders} onChange={(value) => updateSetting("attendanceReminders", value)} />
    </div>;
}

function SystemSettings({ settings, updateSetting }) {
    return <div className="settings-form-grid"><Field label="Session Timeout"><select value={settings.sessionTimeout} onChange={(event) => updateSetting("sessionTimeout", event.target.value)}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></Field></div>;
}

function FinancialSettings({ settings, updateSetting }) {
    return <div className="settings-form-grid"><Field label="Currency"><select value={settings.currency} onChange={(event) => updateSetting("currency", event.target.value)}><option>INR</option><option>USD</option><option>QAR</option><option>EUR</option></select></Field><Field label="Currency Symbol"><input value={settings.currencySymbol} onChange={(event) => updateSetting("currencySymbol", event.target.value)} /></Field></div>;
}

function OtherSettings({ settings, updateSetting }) {
    return <div className="settings-form-grid"><Field label="Support Email"><input type="email" value={settings.supportEmail} onChange={(event) => updateSetting("supportEmail", event.target.value)} /></Field></div>;
}

function Toggle({ label, description, checked, onChange }) {
    return <div className="settings-toggle-row"><div><strong>{label}</strong><p>{description}</p></div><button type="button" className={`settings-switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} aria-pressed={checked}><span /></button></div>;
}

export default Settings;
