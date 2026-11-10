import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Check, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, X } from "lucide-react";

const MIN_LENGTH = 6;

// 0-4: length, mixed case, digit, symbol
const strengthOf = (password) => {
    if (!password) return 0;
    let score = password.length >= MIN_LENGTH ? 1 : 0;
    if (password.length >= 10) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
    return Math.min(score, 4);
};

function PasswordField({ id, label, value, onChange, show, onToggle, autoComplete, invalid }) {
    const { t } = useTranslation();
    return (
        <div className="epw-field">
            <label htmlFor={id}>{label}</label>
            <div className={`epw-input${invalid ? " invalid" : ""}`}>
                <LockKeyhole size={16} aria-hidden="true" />
                {/* Typed text stays left-to-right, also on the Arabic page */}
                <input id={id} type={show ? "text" : "password"} dir="ltr" value={value} onChange={onChange} autoComplete={autoComplete} required />
                <button type="button" onClick={onToggle} aria-label={show ? t("changePassword.hide", { defaultValue: "Hide password" }) : t("changePassword.show", { defaultValue: "Show password" })}>
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
            </div>
        </div>
    );
}

function ChangePasswordModal({ passwordForm, setPasswordForm, onSubmit, loading, onClose, inline = false, unreadNotifications = 0, onOpenNotifications }) {
    const { t } = useTranslation();
    const [shown, setShown] = useState({});
    const toggle = (field) => setShown((current) => ({ ...current, [field]: !current[field] }));
    const setField = (field) => (event) => setPasswordForm((current) => ({ ...current, [field]: event.target.value }));
    const { current_password: current, new_password: next, repeat_password: repeat } = passwordForm;

    const strength = strengthOf(next);
    const strengthLabels = [
        "",
        t("changePassword.weak", { defaultValue: "Weak" }),
        t("changePassword.fair", { defaultValue: "Fair" }),
        t("changePassword.good", { defaultValue: "Good" }),
        t("changePassword.strong", { defaultValue: "Strong" }),
    ];
    const rules = [
        { ok: next.length >= MIN_LENGTH, label: t("changePassword.ruleLength", { count: MIN_LENGTH, defaultValue: "At least {{count}} characters" }) },
        { ok: Boolean(next) && next !== current, label: t("changePassword.ruleDifferent", { defaultValue: "Different from your current password" }) },
        { ok: Boolean(repeat) && next === repeat, label: t("changePassword.ruleMatch", { defaultValue: "New passwords match" }) },
    ];
    const canSubmit = Boolean(current) && rules.every((rule) => rule.ok) && !loading;

    const form = (
        <form className="epw-form" onSubmit={onSubmit}>
            <PasswordField id="epw-current" label={t("changePassword.currentPassword", { defaultValue: "Current Password" })} value={current} onChange={setField("current_password")} show={shown.current} onToggle={() => toggle("current")} autoComplete="current-password" />
            <PasswordField id="epw-new" label={t("changePassword.newPassword", { defaultValue: "New Password" })} value={next} onChange={setField("new_password")} show={shown.next} onToggle={() => toggle("next")} autoComplete="new-password" />
            {next && (
                <div className={`epw-strength s${strength}`} aria-live="polite">
                    <i aria-hidden="true">{[1, 2, 3, 4].map((step) => <b key={step} className={step <= strength ? "on" : ""} />)}</i>
                    <span>{strengthLabels[strength] || strengthLabels[1]}</span>
                </div>
            )}
            <PasswordField id="epw-repeat" label={t("changePassword.repeatPassword", { defaultValue: "Repeat Password" })} value={repeat} onChange={setField("repeat_password")} show={shown.repeat} onToggle={() => toggle("repeat")} autoComplete="new-password" invalid={Boolean(repeat) && repeat !== next} />

            <ul className="epw-rules">
                {rules.map((rule) => (
                    <li key={rule.label} className={rule.ok ? "ok" : ""}>
                        {rule.ok ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                        {rule.label}
                    </li>
                ))}
            </ul>

            <div className="epw-actions">
                <button type="button" className="epw-cancel" onClick={onClose}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
                <button type="submit" className="epw-submit" disabled={!canSubmit}>
                    <KeyRound size={16} aria-hidden="true" />
                    {loading ? t("leaveManagement.review.updating", { defaultValue: "Updating..." }) : t("changePassword.submit", { defaultValue: "Update Password" })}
                </button>
            </div>
        </form>
    );

    if (!inline) {
        return (
            <div className="employee-modal">
                <div className="employee-modal-card password-change-modal epw-modal">
                    <button type="button" className="modal-close" onClick={onClose}>×</button>
                    <h2>{t("employeeHeader.change-password.title", { defaultValue: "Change Password" })}</h2>
                    {form}
                </div>
            </div>
        );
    }

    return (
        <section className="employee-password-view epw">
            <header className="edash-hero">
                <div className="edash-hero-copy">
                    <span className="edash-hero-kicker">{t("employeeHero.kicker", { defaultValue: "Employee Portal" })}</span>
                    <h1>{t("employeeHeader.change-password.title", { defaultValue: "Change Password" })}</h1>
                    <p>{t("employeeHeader.change-password.subtitle", { defaultValue: "Update your employee account password" })}</p>
                </div>
                <div className="edash-hero-side">
                    <button type="button" className="edash-hero-bell" onClick={onOpenNotifications} aria-label={t("employeeNotifications.openNotifications", { defaultValue: "Open notifications" })}>
                        <Bell size={22} />
                        {unreadNotifications > 0 && <span className="edash-hero-bell-count">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
                    </button>
                </div>
            </header>

            <div className="epw-layout">
                <article className="epw-card">
                    <header className="eset-card-head">
                        <span className="eset-card-icon"><KeyRound size={18} /></span>
                        <div>
                            <h2>{t("changePassword.newTitle", { defaultValue: "Set a new password" })}</h2>
                            <p>{t("changePassword.newHint", { defaultValue: "You will be signed out and can sign in with the new password." })}</p>
                        </div>
                    </header>
                    {form}
                </article>

                <aside className="epw-tips">
                    <span className="eset-card-icon"><ShieldCheck size={18} /></span>
                    <h3>{t("changePassword.tipsTitle", { defaultValue: "Keep your account safe" })}</h3>
                    <ul>
                        <li>{t("changePassword.tip1", { defaultValue: "Mix upper and lower case letters, numbers and a symbol." })}</li>
                        <li>{t("changePassword.tip2", { defaultValue: "Don't use your employee ID, name or date of birth." })}</li>
                        <li>{t("changePassword.tip3", { defaultValue: "Never share your password. HR will never ask for it." })}</li>
                        <li>{t("changePassword.tip4", { defaultValue: "Forgot it? Use \"Forgot Password\" on the sign-in page." })}</li>
                    </ul>
                </aside>
            </div>
        </section>
    );
}

export default ChangePasswordModal;
