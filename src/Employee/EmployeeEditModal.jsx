import { useTranslation } from "react-i18next";
import DatePicker from "../components/layout/common/DatePicker";

const basicTextFields = [["employee_id", "QID", "text"], ["name", "Full Name", "text"], ["phone", "Phone", "tel"], ["email", "Email", "email"], ["address", "Address", "text"]];
const basicDateFields = [["date_of_birth", "Birthday"], ["joining_date", "Joining Date"]];
const personalTextFields = [["passport_no", "Passport No", "text"], ["nationality", "Nationality", "text"], ["religion", "Religion", "text"]];
const roleTextFields = [["designation", "Designation / Role", "text"], ["department", "Department", "text"]];
const roleDateFields = [["passport_exp_date", "Passport Exp Date"]];

// Saved values (English). Only the text shown in the dropdown is translated.
const GENDERS = ["Male", "Female", "Other"];
const EMPLOYMENT_TYPES = ["Full Time", "Part Time", "Contract", "Intern"];
const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed"];
const STATUSES = ["Active", "Inactive"];

const readPhoto = (file, updateDraft) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateDraft("profile_photo", reader.result);
    reader.readAsDataURL(file);
};

function EmployeeEditModal({ draft, updateDraft, onSubmit, loading, onClose }) {
    const { t } = useTranslation();
    // Label by field name, English label as fallback
    const fieldLabel = (name, label) => t(`profileEdit.fields.${name}`, { defaultValue: label });
    // Same words as the Profile page (employeeProfile.values)
    const optionLabel = (group, value) => t(`employeeProfile.values.${group}.${String(value).trim().toLowerCase().replace(/[\s-]+/g, "_")}`, { defaultValue: value });

    const renderTextFields = (fields) => fields.map(([name, label, type]) => <div className="form-group" key={name}><label>{fieldLabel(name, label)}</label><input name={name} type={type} value={draft[name] || ""} onChange={(event) => updateDraft(name, event.target.value)} /></div>);
    const renderDateFields = (fields) => fields.map(([name, label]) => <div className="form-group" key={name}><label>{fieldLabel(name, label)}</label><DatePicker value={draft[name] || ""} onChange={(value) => updateDraft(name, value)} /></div>);

    return <div className="employee-modal"><form className="employee-modal-card profile-edit-modal" onSubmit={onSubmit}>
        <button type="button" className="modal-close" onClick={onClose}>×</button>
        <h2>{t("profileEdit.title", { defaultValue: "Edit Employee Profile" })}</h2>
        <p>{t("profileEdit.subtitle", { defaultValue: "Update your employee information" })}</p>
        <div className="profile-edit-grid">
            <h3 className="profile-edit-section-title">{t("profileEdit.sections.basic", { defaultValue: "Basic information" })}</h3>
            {renderTextFields(basicTextFields)}{renderDateFields(basicDateFields)}
            <div className="form-group"><label>{fieldLabel("gender", "Gender")}</label>
                <select value={draft.gender || ""} onChange={(event) => updateDraft("gender", event.target.value)}>
                    <option value="">{t("profileEdit.selectGender", { defaultValue: "Select gender" })}</option>
                    {GENDERS.map((value) => <option key={value} value={value}>{optionLabel("gender", value)}</option>)}
                </select>
            </div>
            <div className="form-group"><label>{fieldLabel("employment_type", "Employment Type")}</label>
                <select value={draft.employment_type || ""} onChange={(event) => updateDraft("employment_type", event.target.value)}>
                    <option value="">{t("profileEdit.selectEmploymentType", { defaultValue: "Select employment type" })}</option>
                    {EMPLOYMENT_TYPES.map((value) => <option key={value} value={value}>{optionLabel("employmentType", value)}</option>)}
                </select>
            </div>
            <h3 className="profile-edit-section-title">{t("profileEdit.sections.personal", { defaultValue: "Personal Information" })}</h3>
            {renderTextFields(personalTextFields)}
            <div className="form-group"><label>{fieldLabel("marital_status", "Marital Status")}</label>
                <select value={draft.marital_status || ""} onChange={(event) => updateDraft("marital_status", event.target.value)}>
                    <option value="">{t("profileEdit.selectMaritalStatus", { defaultValue: "Select marital status" })}</option>
                    {MARITAL_STATUSES.map((value) => <option key={value} value={value}>{optionLabel("maritalStatus", value)}</option>)}
                </select>
            </div>
            <div className="form-group"><label>{fieldLabel("children_count", "No. of Children")}</label><input type="number" min="0" value={draft.children_count ?? ""} onChange={(event) => updateDraft("children_count", event.target.value)} /></div>
            <h3 className="profile-edit-section-title">{t("profileEdit.sections.emergency", { defaultValue: "Emergency Contact Number" })}</h3>
            <div className="form-group"><label>{fieldLabel("emergency_contact", "Primary")}</label><input name="emergency_contact" type="tel" value={draft.emergency_contact || ""} onChange={(event) => updateDraft("emergency_contact", event.target.value)} /></div>
            <h3 className="profile-edit-section-title">{t("profileEdit.sections.work", { defaultValue: "Work information" })}</h3>
            {renderTextFields(roleTextFields)}{renderDateFields(roleDateFields)}
            <div className="form-group"><label>{fieldLabel("status", "Status")}</label>
                <select value={draft.status || "Active"} onChange={(event) => updateDraft("status", event.target.value)}>
                    {STATUSES.map((value) => <option key={value} value={value}>{optionLabel("status", value)}</option>)}
                </select>
            </div>
            <div className="form-group profile-photo-field"><label>{fieldLabel("profile_photo", "Profile Photo")}</label><input type="file" accept="image/*" onChange={(event) => readPhoto(event.target.files[0], updateDraft)} />{draft.profile_photo && <img className="profile-edit-photo-preview" src={draft.profile_photo} alt={t("profileEdit.photoPreview", { defaultValue: "Profile preview" })} />}</div>
        </div>
        <div className="profile-edit-actions">
            <button type="button" className="profile-cancel-btn" onClick={onClose}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
            <button type="submit" className="profile-save-btn" disabled={loading}>{loading ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("profileEdit.save", { defaultValue: "Save Changes" })}</button>
        </div>
    </form></div>;
}

export default EmployeeEditModal;