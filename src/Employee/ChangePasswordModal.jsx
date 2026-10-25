import { useTranslation } from "react-i18next";
import { KeyRound } from "lucide-react";

function ChangePasswordModal({ passwordForm, setPasswordForm, onSubmit, loading, onClose, inline = false }) {
    const { t } = useTranslation();
    // Password fields: typed text always left-to-right (dir="ltr"), also on the Arabic page
    const content = <>
        <div className="password-change-heading"><KeyRound size={22} /><div><h2>{t("employeeHeader.change-password.title", { defaultValue: "Change Password" })}</h2><p>{t("employeeHeader.change-password.subtitle", { defaultValue: "Update your employee account password" })}</p></div></div>
        <form onSubmit={onSubmit}>
            <div className="form-group"><label>{t("changePassword.currentPassword", { defaultValue: "Current Password" })}</label><input type="password" dir="ltr" value={passwordForm.current_password} onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))} required /></div>
            <div className="form-group"><label>{t("changePassword.newPassword", { defaultValue: "New Password" })}</label><input type="password" dir="ltr" minLength="6" value={passwordForm.new_password} onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))} required /></div>
            <div className="form-group"><label>{t("changePassword.repeatPassword", { defaultValue: "Repeat Password" })}</label><input type="password" dir="ltr" minLength="6" value={passwordForm.repeat_password} onChange={(event) => setPasswordForm((current) => ({ ...current, repeat_password: event.target.value }))} required /></div>
            <div className="profile-edit-actions"><button type="button" className="profile-cancel-btn" onClick={onClose}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button><button type="submit" className="profile-save-btn" disabled={loading}>{loading ? t("leaveManagement.review.updating", { defaultValue: "Updating..." }) : t("changePassword.submit", { defaultValue: "Update Password" })}</button></div>
        </form>
    </>;

    if (inline) {
        return <section className="employee-password-view">{content}</section>;
    }

    return <div className="employee-modal"><div className="employee-modal-card password-change-modal"><button className="modal-close" onClick={onClose}>×</button>{content}</div></div>;
}

export default ChangePasswordModal;
