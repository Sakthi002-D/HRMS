import { Bell, BriefcaseBusiness, Clock3, Globe2, KeyRound, LayoutGrid, LogOut, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, changeAppLanguage } from "../i18n";

// Employee portal login name: EMP + employee ID (see backend accountCredentials.js)
const loginUsername = (employeeId) => {
    const id = String(employeeId || "").trim();
    return id && !/^EMP/i.test(id) ? `EMP${id}` : id;
};

function Toggle({ on, onChange, label }) {
    return (
        <button type="button" role="switch" className={`eset-switch${on ? " on" : ""}`} aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
            <span />
        </button>
    );
}

function Row({ icon: Icon, title, hint, children }) {
    return (
        <div className="eset-row">
            <span className="eset-row-icon" aria-hidden="true"><Icon size={16} /></span>
            <div className="eset-row-text">
                <strong>{title}</strong>
                {hint && <small>{hint}</small>}
            </div>
            <div className="eset-row-control">{children}</div>
        </div>
    );
}

function EmployeeSettings({
    employee, notificationsEnabled, setNotificationsEnabled, compactMode, setCompactMode, timeZone, setTimeZone,
    todayShift, liveNow, unreadNotifications, onOpenNotifications, onEditProfile, onChangePassword, onLogout,
}) {
    const { t, i18n } = useTranslation();
    const currentLanguage = i18n.language === "ar" ? "ar" : "en";
    const username = loginUsername(employee.employee_id);
    const zoneTime = (zone) => {
        try {
            return liveNow.toLocaleTimeString("en-IN", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: true });
        } catch {
            return "";
        }
    };
    const dash = <span className="eset-muted">-</span>;

    return (
        <section className="employee-settings-view eset">
            <header className="edash-hero">
                <div className="edash-hero-copy">
                    <span className="edash-hero-kicker">{t("employeeHero.kicker", { defaultValue: "Employee Portal" })}</span>
                    <h1>{t("employeeHeader.settings.title", { defaultValue: "Settings" })}</h1>
                    <p>{t("employeeHeader.settings.subtitle", { defaultValue: "Manage your account and dashboard preferences" })}</p>
                    <div className="edash-hero-chips">
                        <span><UserRound size={14} aria-hidden="true" /><bdi dir="ltr">{username}</bdi></span>
                        <span><ShieldCheck size={14} aria-hidden="true" />{t("employeeSettings.active", { defaultValue: "Active" })}</span>
                        <span><Globe2 size={14} aria-hidden="true" />{t(timeZone === "Asia/Dubai" ? "employeeSettings.tzDubai" : "employeeSettings.tzQatar")}</span>
                    </div>
                </div>
                <div className="edash-hero-side">
                    <button type="button" className="edash-hero-bell" onClick={onOpenNotifications} aria-label={t("employeeNotifications.openNotifications", { defaultValue: "Open notifications" })}>
                        <Bell size={22} />
                        {unreadNotifications > 0 && <span className="edash-hero-bell-count">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
                    </button>
                </div>
            </header>

            <div className="eset-grid">
                {/* Sign-in and password */}
                <article className="eset-card">
                    <header className="eset-card-head">
                        <span className="eset-card-icon"><KeyRound size={18} /></span>
                        <div>
                            <h2>{t("employeeSettings.accountSecurity", { defaultValue: "Account & Security" })}</h2>
                            <p>{t("employeeSettings.accountSecurityHint", { defaultValue: "Protect your account access" })}</p>
                        </div>
                    </header>
                    <Row icon={UserRound} title={t("employeeSettings.username", { defaultValue: "Username" })} hint={t("employeeSettings.usernameHint", { defaultValue: "Use this to sign in to the employee portal" })}>
                        <span className="eset-code" dir="ltr">{username}</span>
                    </Row>
                    <Row icon={KeyRound} title={t("employeeSettings.password", { defaultValue: "Password" })} hint={t("employeeSettings.passwordHint", { defaultValue: "Change your account password anytime" })}>
                        <button type="button" className="eset-button" onClick={onChangePassword}>{t("employeeSettings.changePassword", { defaultValue: "Change Password" })}</button>
                    </Row>
                    <Row icon={ShieldCheck} title={t("employeeSettings.accountStatus", { defaultValue: "Account status" })} hint={t("employeeSettings.accountStatusHint", { defaultValue: "Your employee account is active" })}>
                        <span className="eset-pill">{t("employeeSettings.active", { defaultValue: "Active" })}</span>
                    </Row>
                </article>

                {/* Language, time zone, layout */}
                <article className="eset-card">
                    <header className="eset-card-head">
                        <span className="eset-card-icon"><SlidersHorizontal size={18} /></span>
                        <div>
                            <h2>{t("employeeSettings.preferences", { defaultValue: "Preferences" })}</h2>
                            <p>{t("employeeSettings.preferencesHint", { defaultValue: "Saved on this device for your account" })}</p>
                        </div>
                    </header>
                    <Row icon={Globe2} title={t("employeeSettings.language", { defaultValue: "Language" })} hint={t("employeeSettings.languageHint", { defaultValue: "Choose the language for your portal" })}>
                        <select className="eset-select" value={currentLanguage} onChange={(event) => changeAppLanguage(event.target.value)} aria-label={t("employeeSettings.language", { defaultValue: "Language" })}>
                            {LANGUAGES.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                        </select>
                    </Row>
                    <Row icon={Clock3} title={t("employeeSettings.timeZone", { defaultValue: "Time zone" })} hint={t("employeeSettings.timeZoneNow", { time: zoneTime(timeZone), defaultValue: "Clock and today's attendance · now {{time}}" })}>
                        <select className="eset-select" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} aria-label={t("employeeSettings.timeZone", { defaultValue: "Time zone" })}>
                            <option value="Asia/Qatar">{t("employeeSettings.tzQatar")}</option>
                            <option value="Asia/Dubai">{t("employeeSettings.tzDubai")}</option>
                        </select>
                    </Row>
                    <Row icon={LayoutGrid} title={t("employeeSettings.compactCards", { defaultValue: "Compact cards" })} hint={t("employeeSettings.compactCardsHint", { defaultValue: "Use a tighter dashboard layout" })}>
                        <Toggle on={compactMode} onChange={setCompactMode} label={t("employeeSettings.compactCards", { defaultValue: "Compact cards" })} />
                    </Row>
                </article>

                {/* Notifications */}
                <article className="eset-card">
                    <header className="eset-card-head">
                        <span className="eset-card-icon"><Bell size={18} /></span>
                        <div>
                            <h2>{t("employeeSettings.notifications", { defaultValue: "Notifications" })}</h2>
                            <p>{t("employeeSettings.notificationsHint", { defaultValue: "Control dashboard alerts" })}</p>
                        </div>
                    </header>
                    <Row icon={Bell} title={t("employeeSettings.leaveUpdates", { defaultValue: "Leave updates" })} hint={t("employeeSettings.leaveUpdatesBell", { defaultValue: "Show approved / rejected leave in your notification bell" })}>
                        <Toggle on={notificationsEnabled} onChange={setNotificationsEnabled} label={t("employeeSettings.leaveUpdates", { defaultValue: "Leave updates" })} />
                    </Row>
                </article>

                {/* Read-only work details */}
                <article className="eset-card">
                    <header className="eset-card-head">
                        <span className="eset-card-icon"><BriefcaseBusiness size={18} /></span>
                        <div>
                            <h2>{t("employeeSettings.workAccount", { defaultValue: "Work account" })}</h2>
                            <p>{t("employeeSettings.workDetailsHint", { defaultValue: "Managed by HR. Ask HR to change these." })}</p>
                        </div>
                    </header>
                    <dl className="eset-facts">
                        <div><dt>{t("employeeSettings.employeeId", { defaultValue: "Employee ID" })}</dt><dd dir="ltr">{employee.employee_id}</dd></div>
                        <div><dt>{t("profileEdit.fields.department", { defaultValue: "Department" })}</dt><dd>{employee.department || dash}</dd></div>
                        <div><dt>{t("employeesList.table.designation", { defaultValue: "Designation" })}</dt><dd>{employee.designation || dash}</dd></div>
                        <div><dt>{t("employeeHero.shift", { defaultValue: "Shift" })}</dt><dd dir="ltr">{todayShift ? `${todayShift.start_time} – ${todayShift.end_time}` : dash}</dd></div>
                    </dl>
                    <button type="button" className="eset-link" onClick={onEditProfile}>{t("employeeSettings.editProfile", { defaultValue: "Edit Profile" })}</button>
                </article>
            </div>

            <footer className="eset-session">
                <span><UserRound size={16} aria-hidden="true" />{t("employeeSettings.signedInAs", { id: employee.employee_id })}</span>
                <button type="button" onClick={onLogout}><LogOut size={15} aria-hidden="true" />{t("employeeSettings.logOut", { defaultValue: "Log out" })}</button>
            </footer>
        </section>
    );
}

export default EmployeeSettings;
