import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Briefcase, BriefcaseBusiness, Camera, CircleAlert, FileText, FolderKanban, GraduationCap, IdCard, Info, Landmark, Plus, Trash2, UserRound, UsersRound } from "lucide-react";
import DatePicker from "../../components/layout/common/DatePicker";
import API_URL from "../../config/api";
import { authHeaders } from "../../utils/auth";
import { useConfirm } from "../../components/common/dialog/dialogContext";
import { toDateInput } from "../../utils/dateInput";
import useGrades from "../../hooks/useGrades";
import { employeeSectionFields, employeeValueLabel } from "./employeeProfileData";
import "./EmployeeEditPage.css";

const SECTIONS = [
  { key: "basic", form: "core", icon: UserRound, label: ["profileEdit.sections.basic", "Basic information"] },
  { key: "personal", form: "core", icon: IdCard, label: ["profileEdit.sections.personal", "Personal Information"] },
  { key: "about", form: "about", icon: FileText, label: ["employeeProfile.panels.about", "About Employee"] },
  { key: "bank", form: "bank", icon: Landmark, label: ["employeeProfile.panels.bank", "Bank Information"] },
  { key: "family", form: "family", icon: UsersRound, label: ["employeeProfile.panels.family", "Family Information"] },
  { key: "employment", form: "core", icon: Briefcase, label: ["employeeProfile.panels.employment", "Employment Details"] },
  { key: "position", form: "core", icon: FolderKanban, label: ["employeeProfile.panels.position", "Position Details"] },
  { key: "education", form: "education", icon: GraduationCap, label: ["employeeProfile.panels.education", "Education Details"] },
  { key: "experience", form: "experience", icon: BriefcaseBusiness, label: ["employeeProfile.panels.experience", "Experience"] },
  { key: "project", form: "project", icon: FolderKanban, label: ["employeeDetails.sectionNames.project", "Projects"] },
];

const DATE_FIELDS = ["date_of_birth", "joining_date", "passport_exp_date", "employment_end_date", "last_date_worked", "assignment_start", "assignment_end", "start_date", "end_date", "deadline"];
const LTR_FIELDS = ["employee_id", "phone", "email", "emergency_contact", "passport_no", "account_number", "ifsc_code", "project_role_id"];
const LONG_FIELDS = ["about", "description", "job_description", "responsibilities", "reason_for_leaving"];
// Shown in Basic information, so Employment Details does not ask for them twice
const BASIC_FIELDS = ["employee_id", "joining_date", "employment_type"];

const SELECT_OPTIONS = {
  gender: ["gender", ["Male", "Female", "Other"]],
  employment_type: ["employmentType", ["Full Time", "Part Time", "Contract", "Intern", "Other"]],
  status: ["status", ["Active", "Inactive", "Resigned", "Retired", "Dismissed", "Terminated"]],
  marital_status: ["maritalStatus", ["Single", "Married", "Divorced", "Widowed"]],
  education_type: ["educationType", ["Full Time", "Part Time", "Distance"]],
  grade: ["grade", []], // choices come from Grade Master (useGrades)
};

// Sections holding several records; "current" hides the end field while it is ticked
const RECORD_SECTIONS = {
  education: { current: "currently_pursuing", end: "end_year", currentLabel: "Currently Pursuing", add: ["employeeProfile.education.add", "+ Add Education"], empty: "No education added yet", title: ["qualification", "institution"] },
  experience: { current: "currently_working", end: "end_date", currentLabel: "Currently Working", add: ["employeeDetails.edit.addExperience", "+ Add Experience"], empty: "No experience added yet", title: ["company_name", "designation"] },
};
// The backend keeps these for an employee editing their own profile; HR sections stay view-only
const HR_OWNED_FIELDS = ["name", "department", "designation", "joining_date", "employment_type", "grade", "status"];
const HR_ONLY_SECTIONS = ["employment", "position", "project"];
const YEARS = Array.from({ length: 81 }, (_, index) => String(new Date().getFullYear() - index));

const pickFields = (source, fields) => Object.fromEntries(fields.map(([name]) => [
  name,
  DATE_FIELDS.includes(name) ? toDateInput(source?.[name]) : source?.[name] ?? "",
]));

const pickRecords = (records, fields) => (Array.isArray(records) ? records : []).map((record) => ({
  ...record,
  ...pickFields(record, fields),
  _key: record.id,
}));

const buildForms = (employee, sectionFields) => ({
  core: {
    employee_id: employee.employee_id || "",
    name: employee.name || "",
    date_of_birth: toDateInput(employee.date_of_birth),
    gender: employee.gender || "",
    phone: employee.phone || "",
    email: employee.email || "",
    address: employee.address || "",
    designation: employee.designation || "",
    department: employee.department || "",
    joining_date: toDateInput(employee.joining_date),
    employment_type: employee.employment_type || "",
    grade: employee.grade || "",
    status: employee.status || "Active",
    emergency_contact: employee.emergency_contact || "",
    passport_no: employee.passport_no || "",
    passport_exp_date: toDateInput(employee.passport_exp_date),
    nationality: employee.nationality || employee.country || "",
    religion: employee.religion || "",
    marital_status: employee.marital_status || "",
    children_count: employee.children_count ?? "",
    legal_entity: employee.legal_entity || "SHLT",
    worker_type: employee.worker_type || "Employee",
    profile_photo: employee.profile_photo || "",
    employment_category: employee.employment_category || "",
    project_role_id: employee.project_role_id || "",
    employment_end_date: toDateInput(employee.employment_end_date),
    termination_reason: employee.termination_reason || "",
    last_date_worked: toDateInput(employee.last_date_worked),
    position: employee.position || employee.designation || "",
    position_title: employee.position_title || employee.designation || "",
    assignment_start: toDateInput(employee.assignment_start),
    assignment_end: toDateInput(employee.assignment_end),
    make_primary: Boolean(employee.make_primary),
  },
  about: { about: employee.about || "" },
  bank: pickFields(employee.bank, sectionFields.bank),
  family: pickFields(employee.family, sectionFields.family),
  project: pickFields(employee.project, sectionFields.project),
  education: pickRecords(employee.education, sectionFields.education),
  experience: pickRecords(employee.experience, sectionFields.experience),
});

// Blank fields are sent as null: a DATE or year column rejects ""
const recordBody = (record) => Object.fromEntries(Object.entries(record)
  .filter(([name]) => name !== "_key")
  .map(([name, value]) => [name, value === "" ? null : value]));

const readError = async (response, fallback) => {
  const data = await response.json().catch(() => ({}));
  return [data.message, data.details].filter(Boolean).join(": ") || fallback;
};

function EmployeeEditPage({ employee, initialSection, selfService = false, onClose, onSaved }) {
  const { t } = useTranslation();
  // Employees see their grade read-only and can't read the grade list
  const { codes: gradeCodes } = useGrades({ enabled: !selfService });
  const sectionFields = employeeSectionFields(t);
  const valueLabel = (group, value) => employeeValueLabel(t, group, value);
  const sections = SECTIONS.filter(({ key }) => !selfService || !HR_ONLY_SECTIONS.includes(key));
  const pageRef = useRef(null);
  const [section, setSection] = useState(initialSection || "basic");
  const [savedForms] = useState(() => buildForms(employee, sectionFields));
  const [forms, setForms] = useState(savedForms);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const confirm = useConfirm();
  // A retry after a failed save must not add or delete the same record twice
  const [addedRecords, setAddedRecords] = useState(0);
  const createdIds = useRef({});
  const deletedKeys = useRef(new Set());

  useEffect(() => {
    pageRef.current?.scrollIntoView({ block: "start" });
  }, []);

  const active = SECTIONS.find((item) => item.key === section);
  const isChanged = (form) => JSON.stringify(forms[form]) !== JSON.stringify(savedForms[form]);
  const hasChanges = Object.keys(forms).some(isChanged);
  const setField = (form, name, value) => setForms((current) => ({ ...current, [form]: { ...current[form], [name]: value } }));

  const initials = String(forms.core.name).split(" ").map((word) => word.charAt(0)).join("").substring(0, 2).toUpperCase();

  const coreFields = {
    basic: [
      ["employee_id", t("profileEdit.fields.employee_id", { defaultValue: "QID" }), { readOnly: true }],
      ["name", t("profileEdit.fields.name", { defaultValue: "Full Name" })],
      ["date_of_birth", t("employeeDetails.fields.dateOfBirth", { defaultValue: "Date of Birth" })],
      ["gender", t("profileEdit.fields.gender", { defaultValue: "Gender" })],
      ["phone", t("profileEdit.fields.phone", { defaultValue: "Phone" })],
      ["email", t("profileEdit.fields.email", { defaultValue: "Email" })],
      ["department", t("profileEdit.fields.department", { defaultValue: "Department" })],
      ["designation", t("employeeDetails.fields.designation", { defaultValue: "Designation" })],
      ["joining_date", t("profileEdit.fields.joining_date", { defaultValue: "Joining Date" })],
      ["employment_type", t("profileEdit.fields.employment_type", { defaultValue: "Employment Type" })],
      ["grade", t("employeeProfile.basic.grade", { defaultValue: "Grade" })],
      ["status", t("profileEdit.fields.status", { defaultValue: "Status" })],
      ["address", t("profileEdit.fields.address", { defaultValue: "Address" })],
    ],
    personal: [
      ["passport_no", t("profileEdit.fields.passport_no", { defaultValue: "Passport No" })],
      ["passport_exp_date", t("profileEdit.fields.passport_exp_date", { defaultValue: "Passport Exp Date" })],
      ["nationality", t("profileEdit.fields.nationality", { defaultValue: "Nationality" })],
      ["religion", t("profileEdit.fields.religion", { defaultValue: "Religion" })],
      ["marital_status", t("profileEdit.fields.marital_status", { defaultValue: "Marital Status" })],
      ["children_count", t("profileEdit.fields.children_count", { defaultValue: "No. of Children" })],
      ["emergency_contact", t("employeeProfile.emergency.title", { defaultValue: "Emergency Contact Number" })],
    ],
    employment: sectionFields.employment.filter(([name]) => !BASIC_FIELDS.includes(name)),
    position: sectionFields.position,
  };
  const fields = (coreFields[section] || sectionFields[section]).map(([name, label, options]) => [
    name,
    label,
    selfService && HR_OWNED_FIELDS.includes(name) ? { readOnly: true } : options,
  ]);
  const setRecordField = (form, key, name, value) => setForms((current) => ({
    ...current,
    [form]: current[form].map((record) => (record._key === key ? { ...record, [name]: value } : record)),
  }));
  const addRecord = (form) => {
    const key = `new-${addedRecords}`;
    setAddedRecords(addedRecords + 1);
    setForms((current) => ({ ...current, [form]: [...current[form], { _key: key, ...pickFields({}, sectionFields[form]), [RECORD_SECTIONS[form].current]: false }] }));
  };
  const removeRecord = (form, key) => setForms((current) => ({ ...current, [form]: current[form].filter((record) => record._key !== key) }));

  const renderControl = (form, name, value, change, options = {}) => {
    const update = ({ target }) => change(target.value);

    if (options.readOnly) {
      const group = SELECT_OPTIONS[name]?.[0];
      const shown = DATE_FIELDS.includes(name) ? String(value || "").split("-").reverse().join("-") : group ? valueLabel(group, value) : value;
      return <input type="text" dir={LTR_FIELDS.includes(name) ? "ltr" : "auto"} readOnly value={shown ?? ""} />;
    }

    if (name === "make_primary") {
      return (
        <select value={value ? "true" : "false"} onChange={({ target }) => change(target.value === "true")}>
          <option value="false">{t("employeeProfile.values.no", { defaultValue: "No" })}</option>
          <option value="true">{t("employeeProfile.values.yes", { defaultValue: "Yes" })}</option>
        </select>
      );
    }
    if (DATE_FIELDS.includes(name)) {
      return <DatePicker value={value || ""} onChange={change} />;
    }
    if (name === "start_year" || name === "end_year") {
      return (
        <select value={value || ""} onChange={update}>
          <option value="">{t("profileEdit.selectYear", { defaultValue: "Select year" })}</option>
          {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      );
    }
    // `status` is also a free-text project field, and only the employee one has fixed choices
    if (SELECT_OPTIONS[name] && form !== "project") {
      const [group, listed] = SELECT_OPTIONS[name];
      const choices = name === "grade" ? gradeCodes : listed;
      // A saved value outside the list (e.g. "Full-time") must stay selectable
      const shownChoices = [...new Set([value, ...choices])].filter(Boolean);
      return (
        <select value={value || ""} onChange={update}>
          {!["status", "education_type"].includes(name) && <option value="">{t("employeeDetails.edit.select", { defaultValue: "Select" })}</option>}
          {shownChoices.map((choice) => <option key={choice} value={choice}>{valueLabel(group, choice)}</option>)}
        </select>
      );
    }
    if (LONG_FIELDS.includes(name)) {
      return <textarea dir="auto" rows={name === "about" ? 8 : 4} value={value || ""} onChange={update} />;
    }
    return (
      <input
        type={name === "children_count" ? "number" : "text"}
        min={name === "children_count" ? "0" : undefined}
        dir={LTR_FIELDS.includes(name) ? "ltr" : "auto"}
        readOnly={options.readOnly}
        value={value ?? ""}
        onChange={update}
      />
    );
  };

  const renderRecords = (form) => {
    const config = RECORD_SECTIONS[form];
    return (
      <div className="eep-records">
        {forms[form].length === 0 && (
          <p className="eep-empty">{t(`employeeDetails.edit.empty.${form}`, { defaultValue: config.empty })}</p>
        )}
        {forms[form].map((record) => (
          <article className="eep-record" key={record._key}>
            <header>
              <strong dir="auto">{config.title.map((name) => record[name]).filter(Boolean).join(" · ") || t("employeeDetails.edit.newRecord", { defaultValue: "New record" })}</strong>
              <button type="button" onClick={() => removeRecord(form, record._key)}>
                <Trash2 size={15} aria-hidden="true" />
                {t("employeeProfile.delete", { defaultValue: "Delete" })}
              </button>
            </header>
            <div className="eep-grid">
              {sectionFields[form]
                .filter(([name]) => !(name === config.end && record[config.current]))
                .map(([name, label]) => (
                  <label key={name} className={LONG_FIELDS.includes(name) ? "eep-wide" : ""}>
                    <span>{label}</span>
                    {renderControl(form, name, record[name], (next) => setRecordField(form, record._key, name, next))}
                  </label>
                ))}
              <label className="eep-check">
                <input type="checkbox" checked={Boolean(record[config.current])} onChange={({ target }) => setRecordField(form, record._key, config.current, target.checked)} />
                <span>{t(`profileEdit.sectionFields.${config.current}`, { defaultValue: config.currentLabel })}</span>
              </label>
            </div>
          </article>
        ))}
        <button type="button" className="eep-add" onClick={() => addRecord(form)}>
          <Plus size={16} aria-hidden="true" />
          {t(config.add[0], { defaultValue: config.add[1] }).replace(/^\+\s*/, "")}
        </button>
      </div>
    );
  };

  const uploadPhoto = ({ target }) => {
    const file = target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setField("core", "profile_photo", reader.result);
    reader.readAsDataURL(file);
  };

  const close = async () => {
    if (hasChanges && !await confirm({
      variant: "warning",
      title: t("employeeDetails.edit.discardTitle", { defaultValue: "Discard Changes" }),
      message: t("employeeDetails.edit.discard", { defaultValue: "Discard your unsaved changes?" }),
      confirmText: t("employeeDetails.edit.discardButton", { defaultValue: "Discard" }),
      cancelText: t("employeeDetails.edit.keepEditing", { defaultValue: "Keep editing" }),
    })) return;
    onClose();
  };

  const recordRequests = (base, form) => {
    const route = `${base}/${form}`;
    const saved = savedForms[form];
    const deletes = saved
      .filter((record) => !forms[form].some((item) => item._key === record._key) && !deletedKeys.current.has(`${form}-${record.id}`))
      .map((record) => ({ method: "DELETE", url: `${route}/${record.id}`, deletedKey: `${form}-${record.id}` }));
    const writes = forms[form]
      .filter((record) => JSON.stringify(record) !== JSON.stringify(saved.find((item) => item._key === record._key)))
      .filter((record) => record.id || sectionFields[form].some(([name]) => record[name] !== ""))
      .map((record) => {
        const id = record.id ?? createdIds.current[record._key];
        return { method: id ? "PUT" : "POST", url: id ? `${route}/${id}` : route, body: recordBody(record), createdKey: id ? null : record._key };
      });
    return [...deletes, ...writes];
  };

  // Each part has its own route, so only what actually changed is sent
  const save = async (event) => {
    event.preventDefault();
    if (!hasChanges) { onClose(); return; }

    const base = `${API_URL}/api/employees/${employee.employee_id}`;
    const requests = [
      ...(isChanged("core") ? [{ method: "PUT", url: base, body: { ...forms.core, employment_end_date: forms.core.employment_end_date || "Never" } }] : []),
      ...["about", "bank", "family", "project"].filter(isChanged).map((form) => ({ method: "PUT", url: `${base}/${form}`, body: recordBody(forms[form]) })),
      ...recordRequests(base, "education"),
      ...recordRequests(base, "experience"),
    ];

    setSaving(true);
    setSaveError("");
    try {
      for (const { method, url, body, createdKey, deletedKey } of requests) {
        const response = await fetch(url, {
          method,
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!response.ok) {
          throw new Error(await readError(response, t("employeeDetails.errors.saveFailed", { defaultValue: "Failed to save details" })));
        }
        if (createdKey) createdIds.current[createdKey] = (await response.json()).id;
        if (deletedKey) deletedKeys.current.add(deletedKey);
      }
      onSaved(forms.core.name);
    } catch (error) {
      setSaveError(error.message);
      pageRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="eep-page" ref={pageRef} onSubmit={save}>
      <header className="eep-hero">
        <button type="button" className="eep-back" onClick={close}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t("employeeDetails.edit.back", { defaultValue: "Back to profile" })}
        </button>
        <div className="eep-identity">
          <label className="eep-avatar">
            {forms.core.profile_photo ? <img src={forms.core.profile_photo} alt="" /> : <span>{initials}</span>}
            <i aria-hidden="true"><Camera size={15} /></i>
            <input type="file" accept="image/*" onChange={uploadPhoto} aria-label={t("profileEdit.fields.profile_photo", { defaultValue: "Profile Photo" })} />
          </label>
          <div>
            <span className="eep-kicker">{t("employeeDetails.editTitle", { defaultValue: "Edit Employee Details" })}</span>
            <h1 dir="auto">{forms.core.name || "-"}</h1>
            <p>
              <span dir="ltr">{employee.employee_id}</span>
              {forms.core.designation && <> · <span dir="auto">{forms.core.designation}</span></>}
              {forms.core.department && <> · <span dir="auto">{forms.core.department}</span></>}
            </p>
          </div>
        </div>
      </header>

      {saveError && (
        <div className="eep-alert eep-alert--error" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span>{t("employeeDetails.unableToSave", { defaultValue: "Unable to save changes" })}: {saveError}</span>
        </div>
      )}
      {selfService && (
        <div className="eep-alert">
          <Info size={18} aria-hidden="true" />
          <span>{t("employeeDetails.edit.selfNote", { defaultValue: "Fields in grey are managed by HR. Contact HR if they need to change." })}</span>
        </div>
      )}
      {!selfService && employee.d365_linked && (
        <div className="eep-alert">
          <Info size={18} aria-hidden="true" />
          <span>{t("employeeDetails.edit.d365Note", { defaultValue: "This employee is linked to D365. Name, department, designation, joining date and status come from D365, so changes to them here are replaced at the next sync." })}</span>
        </div>
      )}

      <div className="eep-layout">
        <nav className="eep-nav" aria-label={t("employeeDetails.editTitle", { defaultValue: "Edit Employee Details" })}>
          {sections.map(({ key, form, icon: Icon, label: [labelKey, defaultValue] }) => (
            <button type="button" key={key} className={key === section ? "active" : ""} aria-current={key === section ? "true" : undefined} onClick={() => setSection(key)}>
              <Icon size={17} aria-hidden="true" />
              <span>{t(labelKey, { defaultValue })}</span>
              {key === section || !isChanged(form) ? null : <em aria-label={t("employeeDetails.edit.changed", { defaultValue: "Changed" })} />}
            </button>
          ))}
        </nav>

        <section className="eep-card">
          <h2>{t(active.label[0], { defaultValue: active.label[1] })}</h2>
          {RECORD_SECTIONS[section] ? renderRecords(section) : (
            <div className="eep-grid">
              {fields.map(([name, label, options]) => (
                <label key={name} className={LONG_FIELDS.includes(name) || name === "address" ? "eep-wide" : ""}>
                  <span>{label}</span>
                  {renderControl(active.form, name, forms[active.form][name], (next) => setField(active.form, name, next), options)}
                </label>
              ))}
            </div>
          )}
          <footer className="eep-actions">
            <button type="button" className="eep-cancel" onClick={close}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
            <button type="submit" className="eep-save" disabled={saving}>
              {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("profileEdit.save", { defaultValue: "Save Changes" })}
            </button>
          </footer>
        </section>
      </div>
    </form>
  );
}

export default EmployeeEditPage;
