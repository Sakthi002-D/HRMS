import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    AlertCircle, Bell, Briefcase, CheckCircle2, DoorOpen, Eye, EyeOff, GitBranch, Globe2, KeyRound,
    Loader2, Mail, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Timer,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { api, getSessionEmployeeId } from "../../components/recruitment/recruitmentApi";
import { storeAuthToken } from "../../utils/auth";
import { DATE_FORMATS, DEFAULT_SETTINGS, SESSION_TIMEOUTS, getAppSettings, loadAppSettings, saveAppSettings } from "../../utils/appSettings";
import { LANGUAGES, changeAppLanguage } from "../../i18n";
import ApprovalWorkflowSettings from "./settings/ApprovalWorkflowSettings";
import RecruitmentMastersSettings from "./settings/RecruitmentMastersSettings";
import { ResignationNoticeSettings } from "./settings/ResignationSettings";
import "./Settings.css";

const SECTIONS = [
    { id: "workspace", labelKey: "settings.page.sectionWorkspace", groups: ["general", "regional", "notifications", "security"] },
    { id: "operations", labelKey: "settings.page.sectionOperations", groups: ["approval", "recruitment", "resignation"] },
];

const GROUP_ICONS = {
    general: Globe2,
    regional: SlidersHorizontal,
    notifications: Bell,
    security: ShieldCheck,
    approval: GitBranch,
    recruitment: Briefcase,
    resignation: DoorOpen,
};

// Groups edited as one draft and saved with the Save bar; the others save themselves
const DRAFT_GROUPS = ["general", "regional", "notifications", "security"];

const TIMEZONES = ["Asia/Qatar", "Asia/Dubai", "Asia/Riyadh", "Asia/Kuwait", "Asia/Bahrain", "Asia/Muscat", "Asia/Kolkata", "Europe/London", "UTC"];

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

const DRAFT_KEYS = Object.keys(DEFAULT_SETTINGS);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const pickDraft = (settings) => Object.fromEntries(DRAFT_KEYS.map((key) => [key, settings[key] ?? DEFAULT_SETTINGS[key]]));
const sameDraft = (a, b) => DRAFT_KEYS.every((key) => a[key] === b[key]);

const validate = (draft, t) => {
    const errors = {};
    const name = String(draft.companyName || "").trim();
    if (!name) errors.companyName = t("settings.page.errors.companyRequired");
    else if (name.length > 80) errors.companyName = t("settings.page.errors.companyTooLong");
    const email = String(draft.supportEmail || "").trim();
    if (email && !EMAIL_PATTERN.test(email)) errors.supportEmail = t("settings.page.errors.emailInvalid");
    if (!String(draft.currencySymbol || "").trim()) errors.currencySymbol = t("settings.page.errors.symbolRequired");
    return errors;
};

const timeoutLabel = (minutes, t) => (minutes >= 60
    ? t("settings.page.hours", { count: minutes / 60 })
    : t("settings.system.minutes", { count: minutes }));

function Settings() {
    const { t } = useTranslation();
    const [activeGroup, setActiveGroup] = useState("general");
    const [saved, setSaved] = useState(null);
    const [draft, setDraft] = useState(null);
    const [loadError, setLoadError] = useState("");
    const [banner, setBanner] = useState(null); // { variant: "success" | "error", message }
    const [saving, setSaving] = useState(false);
    const [showErrors, setShowErrors] = useState(false);

    const applyLoaded = useCallback((settings) => {
        const value = pickDraft(settings);
        setSaved(value);
        setDraft(value);
    }, []);

    const retry = () => {
        setLoadError("");
        loadAppSettings().then(applyLoaded).catch((error) => setLoadError(error.message));
    };

    useEffect(() => {
        let cancelled = false;
        loadAppSettings()
            .then((settings) => { if (!cancelled) applyLoaded(settings); })
            .catch((error) => { if (!cancelled) setLoadError(error.message); });
        return () => { cancelled = true; };
    }, [applyLoaded]);

    useEffect(() => {
        if (banner?.variant !== "success") return undefined;
        const timer = window.setTimeout(() => setBanner(null), 4500);
        return () => window.clearTimeout(timer);
    }, [banner]);

    const dirty = Boolean(draft && saved && !sameDraft(draft, saved));
    const errors = useMemo(() => (draft ? validate(draft, t) : {}), [draft, t]);

    const update = (patch) => {
        setDraft((current) => ({ ...current, ...patch }));
        setBanner(null);
    };

    const discard = () => {
        setDraft(saved);
        setShowErrors(false);
        setBanner(null);
    };

    const save = async () => {
        setShowErrors(true);
        if (Object.keys(errors).length) {
            setBanner({ variant: "error", message: Object.values(errors)[0] });
            return;
        }
        try {
            setSaving(true);
            const result = pickDraft(await saveAppSettings({
                ...draft,
                companyName: draft.companyName.trim(),
                supportEmail: draft.supportEmail.trim(),
                currencySymbol: draft.currencySymbol.trim(),
            }));
            setSaved(result);
            setDraft(result);
            setShowErrors(false);
            setBanner({ variant: "success", message: t("settings.page.saved") });
        } catch (error) {
            setBanner({ variant: "error", message: error.message });
        } finally {
            setSaving(false);
        }
    };

    const isDraftGroup = DRAFT_GROUPS.includes(activeGroup);
    const ActiveIcon = GROUP_ICONS[activeGroup];
    const shown = saved || getAppSettings();

    let body;
    if (loadError) {
        body = (
            <div className="st-state" role="alert">
                <AlertCircle size={28} />
                <p>{t("settings.page.loadError", { message: loadError })}</p>
                <button type="button" className="st-btn st-btn-primary" onClick={retry}><RotateCcw size={15} /> {t("settings.page.retry")}</button>
            </div>
        );
    } else if (!draft && isDraftGroup) {
        body = <div className="st-state"><Loader2 size={26} className="st-spin" /><p>{t("settings.page.loading")}</p></div>;
    } else if (activeGroup === "general") {
        body = <GeneralPanel draft={draft} errors={showErrors ? errors : {}} update={update} />;
    } else if (activeGroup === "regional") {
        body = <RegionalPanel draft={draft} errors={showErrors ? errors : {}} update={update} />;
    } else if (activeGroup === "notifications") {
        body = <NotificationsPanel draft={draft} update={update} />;
    } else if (activeGroup === "security") {
        body = <SecurityPanel draft={draft} update={update} />;
    } else if (activeGroup === "approval") {
        body = <ApprovalWorkflowSettings />;
    } else if (activeGroup === "recruitment") {
        body = <RecruitmentMastersSettings />;
    } else {
        body = <ResignationNoticeSettings />;
    }

    return (
        <DashboardLayout>
            <div className="settings-page st-page">
                <header className="st-hero">
                    <div className="st-hero-main">
                        <span className="st-hero-logo" aria-hidden="true">{(shown.companyName || "H").trim().charAt(0).toUpperCase()}</span>
                        <div>
                            <h1>{t("settings.title", { defaultValue: "Settings" })}</h1>
                            <p>{t("settings.subtitle", { defaultValue: "Manage your HRMS preferences and application configuration." })}</p>
                        </div>
                    </div>
                    <ul className="st-hero-chips" aria-label={shown.companyName}>
                        <li><Globe2 size={14} /><bdi dir="ltr">{shown.timezone}</bdi></li>
                        <li><SlidersHorizontal size={14} /><bdi dir="ltr">{shown.dateFormat}</bdi></li>
                        <li><span className="st-chip-symbol"><bdi dir="ltr">{shown.currencySymbol}</bdi></span><bdi dir="ltr">{shown.currency}</bdi></li>
                        <li><Timer size={14} />{timeoutLabel(Number(shown.sessionTimeout), t)}</li>
                    </ul>
                </header>

                <div className="st-layout">
                    <nav className="st-nav" aria-label={t("settings.title", { defaultValue: "Settings" })}>
                        {SECTIONS.map((section) => (
                            <div className="st-nav-section" key={section.id}>
                                <span className="st-nav-label">{t(section.labelKey)}</span>
                                {section.groups.map((id) => {
                                    const Icon = GROUP_ICONS[id];
                                    const active = activeGroup === id;
                                    return (
                                        <button type="button" key={id} className={`st-nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => setActiveGroup(id)}>
                                            <span className="st-nav-icon"><Icon size={17} /></span>
                                            <span className="st-nav-text">
                                                <strong>{t(`settings.page.nav.${id}.title`)}</strong>
                                                <small>{t(`settings.page.nav.${id}.desc`)}</small>
                                            </span>
                                            {DRAFT_GROUPS.includes(id) && dirty && <span className="st-nav-dot" title={t("settings.page.unsaved")} />}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </nav>

                    <main className="st-content">
                        <section className="st-card">
                            <div className="st-card-head">
                                <span className="st-card-icon"><ActiveIcon size={20} /></span>
                                <div>
                                    <h2>{t(`settings.page.nav.${activeGroup}.title`)}</h2>
                                    <p>{t(`settings.page.groupDesc.${activeGroup}`)}</p>
                                </div>
                            </div>

                            {banner && isDraftGroup && (
                                <div className={`st-banner ${banner.variant}`} role={banner.variant === "error" ? "alert" : "status"}>
                                    {banner.variant === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                    <span>{banner.message}</span>
                                </div>
                            )}

                            <div className="st-body">{body}</div>

                            {isDraftGroup && draft && (
                                <div className={`st-savebar${dirty ? " dirty" : ""}`}>
                                    <span className="st-savebar-status">
                                        {dirty
                                            ? <><span className="st-pulse" />{t("settings.page.unsaved")}</>
                                            : <><CheckCircle2 size={15} />{t("settings.page.allSaved")}</>}
                                    </span>
                                    <div className="st-savebar-actions">
                                        <button type="button" className="st-btn st-btn-ghost" onClick={discard} disabled={!dirty || saving}><RotateCcw size={15} /> {t("settings.page.discard")}</button>
                                        <button type="button" className="st-btn st-btn-primary" onClick={save} disabled={!dirty || saving}>
                                            {saving ? <Loader2 size={15} className="st-spin" /> : <Save size={15} />} {saving ? t("settings.page.saving") : t("settings.page.saveChanges")}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </section>
                    </main>
                </div>
            </div>
        </DashboardLayout>
    );
}

function Field({ label, hint, error, children }) {
    return (
        <label className={`st-field${error ? " has-error" : ""}`}>
            <span className="st-field-label">{label}</span>
            {children}
            {error ? <small className="st-field-error">{error}</small> : hint && <small>{hint}</small>}
        </label>
    );
}

function GeneralPanel({ draft, errors, update }) {
    const { t, i18n } = useTranslation();
    const language = i18n.language === "ar" ? "ar" : "en";
    return (
        <div className="st-grid">
            <Field label={t("settings.general.companyName")} hint={t("settings.page.companyNameHint")} error={errors.companyName}>
                <input value={draft.companyName} maxLength={120} onChange={(event) => update({ companyName: event.target.value })} />
            </Field>
            <Field label={t("settings.page.supportEmail")} hint={t("settings.page.supportEmailHint")} error={errors.supportEmail}>
                <input type="email" dir="ltr" placeholder="support@company.com" value={draft.supportEmail} onChange={(event) => update({ supportEmail: event.target.value })} />
            </Field>
            <Field label={t("settings.language")} hint={t("settings.page.languageHintShort")}>
                <select value={language} onChange={(event) => changeAppLanguage(event.target.value)}>
                    {LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
            </Field>
        </div>
    );
}

const pad = (value) => String(value).padStart(2, "0");

function RegionalPanel({ draft, errors, update }) {
    const { t } = useTranslation();
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 15000);
        return () => window.clearInterval(timer);
    }, []);

    const timezones = TIMEZONES.includes(draft.timezone) ? TIMEZONES : [draft.timezone, ...TIMEZONES];
    const currencies = CURRENCIES.some((currency) => currency.code === draft.currency)
        ? CURRENCIES
        : [{ code: draft.currency, name: draft.currency, symbol: draft.currencySymbol }, ...CURRENCIES];

    const preview = useMemo(() => {
        let parts;
        try {
            parts = Object.fromEntries(
                new Intl.DateTimeFormat("en-GB", { timeZone: draft.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
                    .formatToParts(now).map((part) => [part.type, part.value])
            );
        } catch {
            parts = { year: now.getFullYear(), month: pad(now.getMonth() + 1), day: pad(now.getDate()), hour: pad(now.getHours()), minute: pad(now.getMinutes()) };
        }
        const date = draft.dateFormat.replace(/DD|MM|YYYY/g, (token) => ({ DD: parts.day, MM: parts.month, YYYY: parts.year }[token]));
        return { date, time: `${parts.hour}:${parts.minute}`, money: `${draft.currencySymbol} 12,500.00` };
    }, [now, draft.timezone, draft.dateFormat, draft.currencySymbol]);

    const changeCurrency = (code) => {
        const match = CURRENCIES.find((currency) => currency.code === code);
        update(match ? { currency: code, currencySymbol: match.symbol } : { currency: code });
    };

    return (
        <>
            <div className="st-grid">
                <Field label={t("settings.general.timezone")} hint={t("settings.page.timezoneHint")}>
                    <select dir="ltr" value={draft.timezone} onChange={(event) => update({ timezone: event.target.value })}>
                        {timezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                    </select>
                </Field>
                <Field label={t("settings.website.dateFormat")} hint={t("settings.page.dateFormatHint")}>
                    <select dir="ltr" value={draft.dateFormat} onChange={(event) => update({ dateFormat: event.target.value })}>
                        {DATE_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}
                    </select>
                </Field>
                <Field label={t("settings.financial.currency")} hint={t("settings.page.currencyHint")}>
                    <select value={draft.currency} onChange={(event) => changeCurrency(event.target.value)}>
                        {currencies.map((currency) => (
                            <option key={currency.code} value={currency.code}>{currency.code} – {t(`settings.financial.currencies.${currency.code}`, { defaultValue: currency.name })}</option>
                        ))}
                    </select>
                </Field>
                <Field label={t("settings.financial.currencySymbol")} hint={t("settings.financial.currencySymbolHint")} error={errors.currencySymbol}>
                    <input dir="ltr" maxLength={8} value={draft.currencySymbol} onChange={(event) => update({ currencySymbol: event.target.value })} />
                </Field>
            </div>

            <div className="st-preview" aria-live="polite">
                <span className="st-preview-title">{t("settings.page.preview")}</span>
                <dl>
                    <div><dt>{t("settings.page.previewTime")}</dt><dd><bdi dir="ltr">{preview.time}</bdi></dd></div>
                    <div><dt>{t("settings.page.previewDate")}</dt><dd><bdi dir="ltr">{preview.date}</bdi></dd></div>
                    <div><dt>{t("settings.page.previewMoney")}</dt><dd><bdi dir="ltr">{preview.money}</bdi></dd></div>
                </dl>
            </div>
        </>
    );
}

function Switch({ checked, onChange, label }) {
    return (
        <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`st-switch${checked ? " on" : ""}`} onClick={() => onChange(!checked)}>
            <span />
        </button>
    );
}

function ToggleRow({ icon: Icon, title, description, checked, onChange }) {
    return (
        <div className="st-toggle-row">
            <span className="st-toggle-icon"><Icon size={18} /></span>
            <div className="st-toggle-copy"><strong>{title}</strong><p>{description}</p></div>
            <Switch checked={checked} onChange={onChange} label={title} />
        </div>
    );
}

function NotificationsPanel({ draft, update }) {
    const { t } = useTranslation();
    return (
        <div className="st-toggle-list">
            <ToggleRow icon={Mail} title={t("settings.page.emailNotifications")} description={t("settings.page.emailNotificationsHint")} checked={draft.emailNotifications} onChange={(value) => update({ emailNotifications: value })} />
            <ToggleRow icon={Bell} title={t("settings.page.leaveNotifications")} description={t("settings.page.leaveNotificationsHint")} checked={draft.leaveNotifications} onChange={(value) => update({ leaveNotifications: value })} />
        </div>
    );
}

function SecurityPanel({ draft, update }) {
    const { t } = useTranslation();
    return (
        <>
            <div className="st-grid">
                <Field label={t("settings.system.sessionTimeout")} hint={t("settings.page.sessionTimeoutHint")}>
                    <select value={draft.sessionTimeout} onChange={(event) => update({ sessionTimeout: Number(event.target.value) })}>
                        {(SESSION_TIMEOUTS.includes(Number(draft.sessionTimeout)) ? SESSION_TIMEOUTS : [Number(draft.sessionTimeout), ...SESSION_TIMEOUTS]).map((minutes) => (
                            <option key={minutes} value={minutes}>{timeoutLabel(minutes, t)}</option>
                        ))}
                    </select>
                </Field>
            </div>
            <PasswordForm />
        </>
    );
}

const EMPTY_PASSWORDS = { current_password: "", new_password: "", repeat_password: "" };

// Changes the signed-in HR account's password; the server revokes the session afterwards
function PasswordForm() {
    const { t } = useTranslation();
    const [form, setForm] = useState(EMPTY_PASSWORDS);
    const [visible, setVisible] = useState(false);
    const [status, setStatus] = useState(null);
    const [saving, setSaving] = useState(false);

    const change = (field) => (event) => {
        setForm((current) => ({ ...current, [field]: event.target.value }));
        setStatus(null);
    };

    const mismatch = form.repeat_password !== "" && form.new_password !== form.repeat_password;
    const matches = form.repeat_password !== "" && form.new_password === form.repeat_password;
    const type = visible ? "text" : "password";

    const submit = async (event) => {
        event.preventDefault();
        if (form.new_password !== form.repeat_password) {
            setStatus({ variant: "error", message: t("settings.security.mismatch") });
            return;
        }
        try {
            setSaving(true);
            const data = await api(`/api/employees/${encodeURIComponent(getSessionEmployeeId())}/change-password`, { method: "POST", body: form });
            setStatus({ variant: "success", message: data.message || t("settings.security.changed") });
            setForm(EMPTY_PASSWORDS);
            window.setTimeout(() => {
                storeAuthToken(null);
                sessionStorage.removeItem("loggedInHR");
                window.location.href = "/login";
            }, 1500);
        } catch (error) {
            setStatus({ variant: "error", message: error.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="st-subcard" onSubmit={submit}>
            <div className="st-subcard-head">
                <span className="st-toggle-icon"><KeyRound size={18} /></span>
                <div><strong>{t("settings.page.passwordTitle")}</strong><p>{t("settings.page.passwordHint")}</p></div>
                <button type="button" className="st-btn st-btn-ghost st-btn-sm" onClick={() => setVisible((value) => !value)} aria-pressed={visible}>
                    {visible ? <EyeOff size={15} /> : <Eye size={15} />} {visible ? t("settings.page.hide") : t("settings.page.show")}
                </button>
            </div>
            <div className="st-grid">
                <Field label={t("settings.security.currentPassword")}>
                    <input type={type} dir="ltr" autoComplete="current-password" required value={form.current_password} onChange={change("current_password")} />
                </Field>
                <span className="st-grid-spacer" aria-hidden="true" />
                <Field label={t("settings.security.newPassword")} hint={t("settings.security.newPasswordHint")}>
                    <input type={type} dir="ltr" autoComplete="new-password" required minLength={6} value={form.new_password} onChange={change("new_password")} />
                </Field>
                <Field label={t("settings.security.repeatPassword")} error={mismatch ? t("settings.page.noMatch") : ""}>
                    <input type={type} dir="ltr" autoComplete="new-password" required minLength={6} value={form.repeat_password} onChange={change("repeat_password")} />
                    {matches && <small className="st-field-ok"><CheckCircle2 size={13} /> {t("settings.page.match")}</small>}
                </Field>
            </div>
            <div className="st-subcard-foot">
                {status && (
                    <span className={`st-inline-status ${status.variant}`} role="status">
                        {status.variant === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {status.message}
                    </span>
                )}
                <button type="submit" className="st-btn st-btn-primary" disabled={saving || mismatch}>
                    {saving ? <Loader2 size={15} className="st-spin" /> : <KeyRound size={15} />} {saving ? t("settings.security.changing") : t("settings.security.changePassword")}
                </button>
            </div>
        </form>
    );
}

export default Settings;
