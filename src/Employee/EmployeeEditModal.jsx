import DatePicker from "../components/layout/common/DatePicker";

const basicTextFields = [["employee_id", "QID", "text"], ["name", "Full Name", "text"], ["phone", "Phone", "tel"], ["email", "Email", "email"], ["address", "Address", "text"]];
const basicDateFields = [["date_of_birth", "Birthday"], ["joining_date", "Joining Date"]];
const personalTextFields = [["passport_no", "Passport No", "text"], ["nationality", "Nationality", "text"], ["religion", "Religion", "text"]];
const roleTextFields = [["designation", "Designation / Role", "text"], ["department", "Department", "text"]];
const roleDateFields = [["passport_exp_date", "Passport Exp Date"]];

const readPhoto = (file, updateDraft) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateDraft("profile_photo", reader.result);
    reader.readAsDataURL(file);
};

function EmployeeEditModal({ draft, updateDraft, onSubmit, loading, onClose }) {
    const renderTextFields = (fields) => fields.map(([name, label, type]) => <div className="form-group" key={name}><label>{label}</label><input name={name} type={type} value={draft[name] || ""} onChange={(event) => updateDraft(name, event.target.value)} /></div>);
    const renderDateFields = (fields) => fields.map(([name, label]) => <div className="form-group" key={name}><label>{label}</label><DatePicker value={draft[name] || ""} onChange={(value) => updateDraft(name, value)} /></div>);
    return <div className="employee-modal"><form className="employee-modal-card profile-edit-modal" onSubmit={onSubmit}><button type="button" className="modal-close" onClick={onClose}>×</button><h2>Edit Employee Profile</h2><p>Update your employee information</p><div className="profile-edit-grid">
        <h3 className="profile-edit-section-title">Basic information</h3>
        {renderTextFields(basicTextFields)}{renderDateFields(basicDateFields)}
        <div className="form-group"><label>Gender</label><select value={draft.gender || ""} onChange={(event) => updateDraft("gender", event.target.value)}><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></select></div>
        <div className="form-group"><label>Employment Type</label><select value={draft.employment_type || ""} onChange={(event) => updateDraft("employment_type", event.target.value)}><option value="">Select employment type</option><option>Full Time</option><option>Part Time</option><option>Contract</option><option>Intern</option></select></div>
        <h3 className="profile-edit-section-title">Personal Information</h3>
        {renderTextFields(personalTextFields)}
        <div className="form-group"><label>Marital Status</label><select value={draft.marital_status || ""} onChange={(event) => updateDraft("marital_status", event.target.value)}><option value="">Select marital status</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option></select></div>
        <div className="form-group"><label>No. of Children</label><input type="number" min="0" value={draft.children_count ?? ""} onChange={(event) => updateDraft("children_count", event.target.value)} /></div>
        <h3 className="profile-edit-section-title">Emergency Contact Number</h3>
        <div className="form-group"><label>Primary</label><input name="emergency_contact" type="tel" value={draft.emergency_contact || ""} onChange={(event) => updateDraft("emergency_contact", event.target.value)} /></div>
        <h3 className="profile-edit-section-title">Work information</h3>
        {renderTextFields(roleTextFields)}{renderDateFields(roleDateFields)}
        <div className="form-group"><label>Status</label><select value={draft.status || "Active"} onChange={(event) => updateDraft("status", event.target.value)}><option>Active</option><option>Inactive</option></select></div>
        <div className="form-group profile-photo-field"><label>Profile Photo</label><input type="file" accept="image/*" onChange={(event) => readPhoto(event.target.files[0], updateDraft)} />{draft.profile_photo && <img className="profile-edit-photo-preview" src={draft.profile_photo} alt="Profile preview" />}</div>
    </div><div className="profile-edit-actions"><button type="button" className="profile-cancel-btn" onClick={onClose}>Cancel</button><button type="submit" className="profile-save-btn" disabled={loading}>{loading ? "Saving..." : "Save Changes"}</button></div></form></div>;
}

export default EmployeeEditModal;
