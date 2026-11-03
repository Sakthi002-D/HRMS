// Shared by the HR employee page and the employee's own profile

// "Full Time" → full_time (translation key); the saved value itself stays English
const valueKey = (value) => String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");

export const employeeValueLabel = (t, group, value) => (value === null || value === undefined || value === ""
    ? value
    : t([`employeeProfile.values.${group}.${valueKey(value)}`, `employeesList.values.${group}.${valueKey(value)}`], { defaultValue: String(value) }));

export const serviceLength = (t, date) => {
    const joined = new Date(date);
    const today = new Date();
    if (!date || isNaN(joined.getTime()) || joined > today) return "-";

    const dayAdjustment = today.getDate() < joined.getDate() ? 1 : 0;
    const months = (today.getFullYear() - joined.getFullYear()) * 12 + today.getMonth() - joined.getMonth() - dayAdjustment;

    return t("employeeProfile.basic.serviceLength", {
        years: Math.floor(months / 12),
        months: months % 12,
        defaultValue: "{{years}} years {{months}} months",
    });
};

export const employeeSectionFields = (t) => ({
    about: [["about", t("profileEdit.sectionFields.about", { defaultValue: "About Employee" })]],
    bank: [["account_holder_name", t("profileEdit.sectionFields.account_holder_name", { defaultValue: "Account Holder Name" })], ["account_number", t("profileEdit.sectionFields.account_number", { defaultValue: "Account Number" })], ["bank_name", t("profileEdit.sectionFields.bank_name", { defaultValue: "Bank Name" })], ["branch_name", t("profileEdit.sectionFields.branch_name", { defaultValue: "Branch Name" })], ["ifsc_code", t("profileEdit.sectionFields.ifsc_code", { defaultValue: "IFSC Code" })], ["account_type", t("profileEdit.sectionFields.account_type", { defaultValue: "Account Type" })]],
    family: [["father_name", t("profileEdit.sectionFields.father_name", { defaultValue: "Father Name" })], ["mother_name", t("profileEdit.sectionFields.mother_name", { defaultValue: "Mother Name" })], ["spouse_name", t("profileEdit.sectionFields.spouse_name", { defaultValue: "Spouse Name" })], ["spouse_employment", t("profileEdit.sectionFields.spouse_employment", { defaultValue: "Spouse Employment" })], ["marital_status", t("profileEdit.sectionFields.marital_status", { defaultValue: "Marital Status" })], ["children_count", t("profileEdit.sectionFields.children_count", { defaultValue: "Children Count" })]],
    employment: [["legal_entity", t("profileEdit.sectionFields.legal_entity", { defaultValue: "Legal Entity" })], ["worker_type", t("profileEdit.sectionFields.worker_type", { defaultValue: "Worker Type" })], ["employee_id", t("profileEdit.sectionFields.employee_id", { defaultValue: "Personnel Number" })], ["employment_category", t("profileEdit.sectionFields.employment_category", { defaultValue: "Employment Category" })], ["joining_date", t("profileEdit.sectionFields.joining_date", { defaultValue: "Employment Start Date" })], ["employment_end_date", t("profileEdit.sectionFields.employment_end_date", { defaultValue: "Employment End Date" })], ["employment_type", t("profileEdit.sectionFields.employment_type", { defaultValue: "Employment Type" })], ["project_role_id", t("profileEdit.sectionFields.project_role_id", { defaultValue: "Project Role ID" })], ["termination_reason", t("profileEdit.sectionFields.termination_reason", { defaultValue: "Termination Reason" })], ["last_date_worked", t("profileEdit.sectionFields.last_date_worked", { defaultValue: "Last Date Worked" })]],
    position: [["position", t("profileEdit.sectionFields.position", { defaultValue: "Position" })], ["position_title", t("profileEdit.sectionFields.position_title", { defaultValue: "Position Title" })], ["assignment_start", t("profileEdit.sectionFields.assignment_start", { defaultValue: "Assignment Start" })], ["assignment_end", t("profileEdit.sectionFields.assignment_end", { defaultValue: "Assignment End" })], ["make_primary", t("employeeProfile.position.makePrimary", { defaultValue: "Make Primary" })]],
    education: [["qualification", t("profileEdit.sectionFields.qualification", { defaultValue: "Degree / Qualification" })], ["institution", t("profileEdit.sectionFields.institution", { defaultValue: "Institution / University" })], ["field_of_study", t("profileEdit.sectionFields.field_of_study", { defaultValue: "Field of Study" })], ["specialization", t("profileEdit.sectionFields.specialization", { defaultValue: "Specialization" })], ["start_year", t("profileEdit.sectionFields.start_year", { defaultValue: "Start Year" })], ["end_year", t("profileEdit.sectionFields.end_year", { defaultValue: "End Year" })], ["grade", t("profileEdit.sectionFields.grade", { defaultValue: "Grade / CGPA" })], ["education_type", t("profileEdit.sectionFields.education_type", { defaultValue: "Education Type" })], ["location", t("profileEdit.sectionFields.location", { defaultValue: "Location" })]],
    experience: [["company_name", t("profileEdit.sectionFields.company_name", { defaultValue: "Company Name" })], ["designation", t("profileEdit.sectionFields.job_title", { defaultValue: "Job Title / Role" })], ["department", t("profileEdit.fields.department", { defaultValue: "Department" })], ["employment_type", t("profileEdit.fields.employment_type", { defaultValue: "Employment Type" })], ["start_date", t("profileEdit.sectionFields.start_date", { defaultValue: "Start Date" })], ["end_date", t("profileEdit.sectionFields.end_date", { defaultValue: "End Date" })], ["company_location", t("profileEdit.sectionFields.company_location", { defaultValue: "Company Location" })], ["skills", t("profileEdit.sectionFields.skills", { defaultValue: "Skills" })], ["job_description", t("profileEdit.sectionFields.job_description", { defaultValue: "Job Description" })], ["responsibilities", t("profileEdit.sectionFields.responsibilities", { defaultValue: "Responsibilities" })], ["reason_for_leaving", t("profileEdit.sectionFields.reason_for_leaving", { defaultValue: "Reason for Leaving" })]],
    project: [["project_name", t("employeeDetails.fields.projectName", { defaultValue: "Project Name" })], ["description", t("employeeDetails.fields.description", { defaultValue: "Description" })], ["project_lead", t("employeeDetails.fields.projectLead", { defaultValue: "Project Lead" })], ["start_date", t("profileEdit.sectionFields.start_date", { defaultValue: "Start Date" })], ["deadline", t("employeeDetails.fields.deadline", { defaultValue: "Deadline" })], ["status", t("profileEdit.fields.status", { defaultValue: "Status" })]],
});
