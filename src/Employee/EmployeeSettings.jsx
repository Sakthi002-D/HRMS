import { Bell, KeyRound, Moon, Settings as SettingsIcon, UserRound } from "lucide-react";

function EmployeeSettings({ employee, notificationsEnabled, setNotificationsEnabled, compactMode, setCompactMode, onEditProfile, onChangePassword, onLogout }) {
    return (
        <section className="employee-settings-view">
            <div className="settings-grid">
                <article className="settings-card"><div className="settings-card-heading"><span className="settings-icon blue"><KeyRound size={18} /></span><div><h3>Account &amp; Security</h3><p>Protect your account access</p></div></div><div className="settings-row"><div><strong>Password</strong><small>Change your account password anytime</small></div><button type="button" onClick={onChangePassword}>Change Password</button></div><div className="settings-row"><div><strong>Account status</strong><small>Your employee account is active</small></div><span className="settings-status">Active</span></div></article>
                <article className="settings-card"><div className="settings-card-heading"><span className="settings-icon purple"><UserRound size={18} /></span><div><h3>Profile preferences</h3><p>Manage your personal information</p></div></div><div className="settings-row"><div><strong>Personal details</strong><small>Update your contact and profile details</small></div><button type="button" onClick={onEditProfile}>Edit Profile</button></div><div className="settings-row"><div><strong>Employee ID</strong><small>Used for signing in to HRMS</small></div><span className="settings-value">{employee.employee_id}</span></div></article>
                <article className="settings-card"><div className="settings-card-heading"><span className="settings-icon green"><Bell size={18} /></span><div><h3>Notifications</h3><p>Control dashboard alerts</p></div></div><div className="settings-row"><div><strong>Leave updates</strong><small>Show updates about your leave requests</small></div><button type="button" className={`settings-toggle ${notificationsEnabled ? "on" : ""}`} onClick={() => setNotificationsEnabled((enabled) => !enabled)} aria-pressed={notificationsEnabled}><span /></button></div></article>
                <article className="settings-card"><div className="settings-card-heading"><span className="settings-icon orange"><Moon size={18} /></span><div><h3>Appearance</h3><p>Choose your dashboard layout</p></div></div><div className="settings-row"><div><strong>Compact cards</strong><small>Use a tighter dashboard layout</small></div><button type="button" className={`settings-toggle ${compactMode ? "on" : ""}`} onClick={() => setCompactMode((enabled) => !enabled)} aria-pressed={compactMode}><span /></button></div></article>
            </div>
            <div className="settings-session"><span><SettingsIcon size={17} /> Signed in as {employee.employee_id}</span><button type="button" onClick={onLogout}>Log out</button></div>
        </section>
    );
}

export default EmployeeSettings;
