import { Bell, Clock3, Globe2, KeyRound, Moon, Settings as SettingsIcon, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, changeAppLanguage } from "../i18n";

function EmployeeSettings({ employee, notificationsEnabled, setNotificationsEnabled, compactMode, setCompactMode, timeZone, setTimeZone, onEditProfile, onChangePassword, onLogout }) {
    const { t, i18n } = useTranslation();
    const currentLanguage = i18n.language === "ar" ? "ar" : "en";

    return (
        <section className="employee-settings-view">
            <div className="settings-grid">

                {/* Account & Security */}
                <article className="settings-card">
                    <div className="settings-card-heading">
                        <span className="settings-icon blue"><KeyRound size={18} /></span>
                        <div><h3>{t("employeeSettings.accountSecurity")}</h3><p>{t("employeeSettings.accountSecurityHint")}</p></div>
                    </div>
                    <div className="settings-row">
                        <div><strong>{t("employeeSettings.password")}</strong><small>{t("employeeSettings.passwordHint")}</small></div>
                        <button type="button" onClick={onChangePassword}>{t("employeeSettings.changePassword")}</button>
                    </div>
                    <div className="settings-row">
                        <div><strong>{t("employeeSettings.accountStatus")}</strong><small>{t("employeeSettings.accountStatusHint")}</small></div>
                        <span className="settings-status">{t("employeeSettings.active")}</span>
                    </div>
                </article>

                {/* Profile preferences */}
                <article className="settings-card">
                    <div className="settings-card-heading">
                        <span className="settings-icon purple"><UserRound size={18} /></span>
                        <div><h3>{t("employeeSettings.profilePreferences")}</h3><p>{t("employeeSettings.profilePreferencesHint")}</p></div>
                    </div>
                    <div className="settings-row">
                        <div><strong>{t("employeeSettings.personalDetails")}</strong><small>{t("employeeSettings.personalDetailsHint")}</small></div>
                        <button type="button" onClick={onEditProfile}>{t("employeeSettings.editProfile")}</button>
                    </div>
                    <div className="settings-row">
                        <div><strong>{t("employeeSettings.employeeId")}</strong><small>{t("employeeSettings.employeeIdLoginHint")}</small></div>
                        <span className="settings-value">{employee.employee_id}</span>
                    </div>
                </article>

                {/* Notifications */}
                <article className="settings-card">
                    <div className="settings-card-heading">
                        <span className="settings-icon green"><Bell size={18} /></span>
                        <div><h3>{t("employeeSettings.notifications")}</h3><p>{t("employeeSettings.notificationsHint")}</p></div>
                    </div>
                    <div className="settings-row">
                        <div><strong>{t("employeeSettings.leaveUpdates")}</strong><small>{t("employeeSettings.leaveUpdatesHint")}</small></div>
                        <button type="button" className={`settings-toggle ${notificationsEnabled ? "on" : ""}`} onClick={() => setNotificationsEnabled((enabled) => !enabled)} aria-pressed={notificationsEnabled}><span /></button>
                    </div>
                </article>

                {/* Appearance */}
                <article className="settings-card">
                    <div className="settings-card-heading">
                        <span className="settings-icon orange"><Moon size={18} /></span>
                        <div><h3>{t("employeeSettings.appearance")}</h3><p>{t("employeeSettings.appearanceHint")}</p></div>
                    </div>
                    <div className="settings-row">
                        <div><strong>{t("employeeSettings.compactCards")}</strong><small>{t("employeeSettings.compactCardsHint")}</small></div>
                        <button type="button" className={`settings-toggle ${compactMode ? "on" : ""}`} onClick={() => setCompactMode((enabled) => !enabled)} aria-pressed={compactMode}><span /></button>
                    </div>
                </article>

                {/* Work preferences: language + time zone */}
                <article className="settings-card">
                    <div className="settings-card-heading">
                        <span className="settings-icon teal"><Globe2 size={18} /></span>
                        <div><h3>{t("employeeSettings.workPreferences")}</h3><p>{t("employeeSettings.workPreferencesHint")}</p></div>
                    </div>
                    <div className="settings-row">
                        <div><strong>{t("employeeSettings.language")}</strong><small>{t("employeeSettings.languageHint")}</small></div>
                        <select className="settings-select" value={currentLanguage} onChange={(event) => changeAppLanguage(event.target.value)}>
                            {LANGUAGES.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                        </select>
                    </div>
                    <div className="settings-row">
                        <div><strong>{t("employeeSettings.timeZone")}</strong><small>{t("employeeSettings.timeZoneHint")}</small></div>
                        <select className="settings-select" value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>
                            <option value="Asia/Qatar">{t("employeeSettings.tzQatar")}</option>
                            <option value="Asia/Kolkata">{t("employeeSettings.tzIndia")}</option>
                            <option value="Asia/Dubai">{t("employeeSettings.tzDubai")}</option>
                        </select>
                    </div>
                </article>

                {/* Work account */}
                <article className="settings-card">
                    <div className="settings-card-heading">
                        <span className="settings-icon slate"><Clock3 size={18} /></span>
                        <div><h3>{t("employeeSettings.workAccount")}</h3><p>{t("employeeSettings.workAccountHint")}</p></div>
                    </div>
                    <div className="settings-row">
                        <div><strong>{t("employeeSettings.portalAccess")}</strong><small>{t("employeeSettings.portalAccessHint")}</small></div>
                        <span className="settings-status">{t("employeeSettings.enabled")}</span>
                    </div>
                    <div className="settings-row">
                        <div><strong>{t("employeeSettings.employeeId")}</strong><small>{t("employeeSettings.employeeIdContactHint")}</small></div>
                        <span className="settings-value">{employee.employee_id}</span>
                    </div>
                </article>
            </div>

            <div className="settings-session">
                <span><SettingsIcon size={17} /> {t("employeeSettings.signedInAs", { id: employee.employee_id })}</span>
                <button type="button" onClick={onLogout}>{t("employeeSettings.logOut")}</button>
            </div>
        </section>
    );
}

export default EmployeeSettings;