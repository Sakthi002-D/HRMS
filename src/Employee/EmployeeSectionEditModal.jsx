import DatePicker from "../components/layout/common/DatePicker";

const sectionFields = {
    about: [["about", "About Employee"]],
    bank: [["account_holder_name", "Account Holder Name"], ["account_number", "Account Number"], ["bank_name", "Bank Name"], ["branch_name", "Branch Name"], ["ifsc_code", "IFSC Code"], ["account_type", "Account Type"]],
    family: [["father_name", "Father Name"], ["mother_name", "Mother Name"], ["spouse_name", "Spouse Name"], ["spouse_employment", "Spouse Employment"], ["marital_status", "Marital Status"], ["children_count", "Children Count"]],
    education: [["qualification", "Degree / Qualification"], ["institution", "Institution / University"], ["field_of_study", "Field of Study"], ["specialization", "Specialization"], ["start_year", "Start Year"], ["end_year", "End Year"], ["grade", "Grade / CGPA"], ["education_type", "Education Type"], ["location", "Location"]],
    employment: [["legal_entity", "Legal Entity"], ["worker_type", "Worker Type"], ["employee_id", "Personnel Number"], ["employment_category", "Employment Category"], ["joining_date", "Employment Start Date"], ["employment_end_date", "Employment End Date"], ["employment_type", "Employment Type"], ["project_role_id", "Project Role ID"], ["termination_reason", "Termination Reason"], ["last_date_worked", "Last Date Worked"]],
    position: [["position", "Position"], ["position_title", "Position Title"], ["assignment_start", "Assignment Start"], ["assignment_end", "Assignment End"], ["legal_entity", "Legal Entity"], ["worker_type", "Worker Type"]],
    experience: [["company_name", "Company Name"], ["designation", "Job Title / Role"], ["department", "Department"], ["employment_type", "Employment Type"], ["start_date", "Start Date"], ["end_date", "End Date"], ["currently_working", "Currently Working"], ["company_location", "Company Location"], ["job_description", "Job Description"], ["responsibilities", "Responsibilities"], ["skills", "Skills / Technologies Used"], ["reason_for_leaving", "Reason for Leaving (Optional)"]],
};

const dateFields = new Set(["assignment_start", "assignment_end", "joining_date", "last_date_worked"]);
const titles = { about: "About Employee", bank: "Bank Information", family: "Family Information", education: "Education Details", employment: "Employment Details", position: "Position Information", experience: "Experience" };

const yearOptions = Array.from({ length: 81 }, (_, index) => String(new Date().getFullYear() - index));

function EmployeeSectionEditModal({ section, form, updateForm, onSubmit, loading, onClose }) {
    const renderField = ([name, label]) => {
        if (name === "currently_working") {
            return <div className="form-group profile-checkbox-field" key={name}><label><input type="checkbox" checked={Boolean(form[name])} onChange={(event) => { updateForm(name, event.target.checked); if (event.target.checked) updateForm("end_date", ""); }} /> {label}</label></div>;
        }
        if (["job_description", "responsibilities", "skills", "reason_for_leaving"].includes(name)) {
            return <div className="form-group profile-edit-wide" key={name}><label>{label}</label><textarea name={name} rows="3" value={form[name] ?? ""} onChange={(event) => updateForm(name, event.target.value)} /></div>;
        }
        if (name === "employment_type") {
            return <div className="form-group" key={name}><label>{label}</label><select value={form[name] || ""} onChange={(event) => updateForm(name, event.target.value)}><option value="">Select employment type</option><option>Full-time</option><option>Part-time</option><option>Internship</option></select></div>;
        }
        return <div className="form-group" key={name}><label>{label}</label>{name.includes("date") ? <DatePicker value={form[name] === "Never" ? "" : form[name] || ""} onChange={(value) => updateForm(name, value)} /> : <input name={name} type="text" value={form[name] ?? ""} onChange={(event) => updateForm(name, event.target.value)} />}</div>;
    };

    return <div className="employee-modal"><form className="employee-modal-card profile-edit-modal" onSubmit={onSubmit}><button type="button" className="modal-close" onClick={onClose}>×</button><h2>Edit {titles[section]}</h2><p>Update {titles[section].toLowerCase()}</p><div className="profile-edit-grid">
        {section === "experience" ? sectionFields[section].map(renderField) : sectionFields[section].map(([name, label]) => <div className={`form-group ${section === "about" ? "profile-edit-wide" : ""}`} key={name}><label>{label}</label>{section === "about" ? <textarea name={name} rows="5" value={form[name] ?? ""} onChange={(event) => updateForm(name, event.target.value)} /> : name === "make_primary" ? <select name={name} value={form[name] ? "true" : "false"} onChange={(event) => updateForm(name, event.target.value === "true")}><option value="false">No</option><option value="true">Yes</option></select> : name === "start_year" || name === "end_year" ? <select name={name} value={form[name] || ""} onChange={(event) => updateForm(name, event.target.value)}><option value="">Select year</option>{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select> : name.includes("date") ? <DatePicker value={form[name] === "Never" ? "" : form[name] || ""} onChange={(value) => updateForm(name, value)} /> : name === "education_type" ? <select value={form[name] || "Full Time"} onChange={(event) => updateForm(name, event.target.value)}><option>Full Time</option><option>Part Time</option><option>Distance</option></select> : <input name={name} type={name === "children_count" ? "number" : name === "email" ? "email" : "text"} value={form[name] ?? ""} onChange={(event) => updateForm(name, event.target.value)} />}</div>)}
    </div><div className="profile-edit-actions"><button type="button" className="profile-cancel-btn" onClick={onClose}>Cancel</button><button type="submit" className="profile-save-btn" disabled={loading}>{loading ? "Saving..." : "Save Changes"}</button></div></form></div>;
}

export { sectionFields };
export default EmployeeSectionEditModal;
