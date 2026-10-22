import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./Employees.css";
import DashboardLayout from "../../components/layout/DashboardLayout";
import SearchBar from "../../components/layout/common/SearchBar";
import Button from "../../components/layout/common/Button";
import Table from "../../components/layout/common/Table";
import Modal from "../../components/layout/common/Modal";
import DatePicker from "../../components/layout/common/DatePicker";
import {
  ChevronDown,
  SlidersHorizontal,
  Grid2X2,
  List,
  RefreshCw,
  SearchX,
  TriangleAlert,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Eye,
} from "lucide-react";
import { useAlert } from "../../components/common/dialog/dialogContext";

import API_URL from "../../config/api";
import { authHeaders } from "../../utils/auth";

const formatPhoneNumber = (phone) => {
  const value = String(phone || "").trim();
  const matchedCountry = [
    { code: "+974", groupSize: 4 },
    { code: "+91", groupSize: 5 },
    { code: "+1", groupSize: 3 },
    { code: "+44", groupSize: 4 },
  ].find((country) => value.startsWith(country.code));
  const countryCode = matchedCountry?.code || "+91";
  const groupSize = matchedCountry?.groupSize || 5;
  const digits = value.replace(/\D/g, "").slice(-15);

  if (!digits) {
    return value;
  }

  const number = digits.slice(-10);
  const groups = [];
  for (let index = 0; index < number.length; index += groupSize) {
    groups.push(number.slice(index, index + groupSize));
  }
  return `${countryCode} ${groups.join(" ")}`;
};

const formatPhoneInput = (value, countryCode) => {
  const digits = value.replace(/\D/g, "");
  const groupSize = countryCode === "+974" ? 4 : 5;
  const maxDigits = countryCode === "+974" ? 8 : 10;
  const limitedDigits = digits.slice(0, maxDigits);
  const groups = [];
  for (let index = 0; index < limitedDigits.length; index += groupSize) {
    groups.push(limitedDigits.slice(index, index + groupSize));
  }
  return groups.join(" ");
};

const fileToDataUrl = (file) => {
  if (!file || typeof file === "string") return Promise.resolve(file || null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

function Employees() {
  const { t } = useTranslation();
  const showAppAlert = useAlert();

  // Same alert as before, with the dialog title and OK button translated too
  const showAlert = (options) => {
    const alert = typeof options === "string" ? { message: options } : options;
    const variant = alert.variant || "danger";
    const defaultTitle = { danger: "Please check", warning: "Please check", info: "Notice", success: "Success" }[variant];
    return showAppAlert({
      title: t(`employeesList.alerts.titles.${variant}`, { defaultValue: defaultTitle }),
      buttonText: t("employeesList.alerts.ok", { defaultValue: "OK" }),
      ...alert,
    });
  };

  // Shows a translated label for an English value ("Full Time" → employeesList/employeeProfile values.*.full_time); the value itself stays English
  const valueLabel = (group, value) => {
    if (!value) return value;
    const key = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
    return t([`employeesList.values.${group}.${key}`, `employeeProfile.values.${group}.${key}`], { defaultValue: String(value) });
  };

  const navigate = useNavigate();
  // =========================
  // EMPLOYEES
  // =========================

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [archiveModal, setArchiveModal] = useState({
    open: false,
    employeeId: null,
    employeeName: "",
    exitStatus: "Resigned",
    lastDateWorked: new Date().toISOString().slice(0, 10),
    terminationReason: "Resigned",
  });

const fetchEmployees = async () => {
  setLoading(true);
  try {
    const response = await fetch(
      `${API_URL}/api/employees`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch employees: ${response.status}`);
    }

    const data = await response.json();

  const formattedEmployees = data.map((employee) => ({
  id: employee.employee_id,
  name: employee.name,
  designation: employee.designation,
  department: employee.department,
  email: employee.email,
  phone: formatPhoneNumber(employee.phone),
  status: employee.status,
  joiningDate: employee.joining_date,

  // Additional employee details
  dateOfBirth: employee.date_of_birth,
  gender: employee.gender,
  country: employee.country,
  address: employee.address,
  employmentType: employee.employment_type,
  emergencyContact: employee.emergency_contact,
  passportNo: employee.passport_no,
  passportExpDate: employee.passport_exp_date,
  nationality: employee.nationality || employee.country,
  religion: employee.religion,
  maritalStatus: employee.marital_status,
  childrenCount: employee.children_count,
  profilePhoto: employee.profile_photo,
}));

    setEmployees(formattedEmployees);
  } catch (error) {
    console.error("Error fetching employees:", error);
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  fetchEmployees();
}, []);
  

  // =========================
  // SEARCH
  // =========================

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [designationFilter, setDesignationFilter] = useState("All");
  const [dateRangeFilter, setDateRangeFilter] = useState("all");


  const [currentPage, setCurrentPage] = useState(1);

  const [employeesPerPage, setEmployeesPerPage] = useState(10);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState("list");

  // =========================
  // D365 DIRECTORY (default)
  // =========================

  // "d365" = the real D365 employee population (server-side paging + search).
  // "legacy" = the local PostgreSQL demo records, kept for existing HRMS workflows.
  const [directoryMode, setDirectoryMode] = useState("d365");
  const [d365Rows, setD365Rows] = useState([]);
  const [d365Total, setD365Total] = useState(0);
  const [d365Page, setD365Page] = useState(1);
  const [d365TotalPages, setD365TotalPages] = useState(1);
  const [d365PageSize, setD365PageSize] = useState(25);
  const [d365Search, setD365Search] = useState("");
  const [d365Loading, setD365Loading] = useState(true);
  // { stage, message } — stage mirrors the backend (config / authentication / employees / server / network)
  const [d365Error, setD365Error] = useState(null);
  const [d365Attempt, setD365Attempt] = useState(0);
  const isLegacyDirectory = directoryMode === "legacy";

  // Server-side search: debounce the shared search box into the D365 query.
  useEffect(() => {
    if (isLegacyDirectory) return undefined;
    const timer = window.setTimeout(() => {
      setD365Search(search.trim());
      setD365Page(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, isLegacyDirectory]);

  useEffect(() => {
    if (isLegacyDirectory) return undefined;
    const controller = new AbortController();
    let isCurrent = true;

    const params = new URLSearchParams({
      view: "directory",
      page: String(d365Page),
      pageSize: String(d365PageSize),
    });
    if (d365Search) params.set("search", d365Search);

    const loadD365Employees = async () => {
      setD365Loading(true);
      setD365Error(null);
      try {
        const response = await fetch(
          `${API_URL}/api/d365/employees?${params.toString()}`,
          { signal: controller.signal }
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const failure = new Error(
            payload?.detail || payload?.message || `HTTP ${response.status}`
          );
          failure.stage = typeof payload?.stage === "string" ? payload.stage : "server";
          throw failure;
        }
        if (!Array.isArray(payload?.employees)) {
          throw new Error("D365 employee directory returned an unexpected response");
        }
        if (isCurrent) {
          setD365Rows(payload.employees);
          setD365Total(payload.total);
          setD365Page(payload.page);
          setD365TotalPages(payload.totalPages);
        }
      } catch (error) {
        if (error?.name === "AbortError" || controller.signal.aborted) return;
        console.error("Error loading D365 employees:", error);
        if (isCurrent) {
          setD365Rows([]);
          setD365Total(0);
          setD365Error({
            stage: error?.stage || "network",
            message: error?.message || "Request failed",
          });
        }
      } finally {
        if (isCurrent) setD365Loading(false);
      }
    };

    loadD365Employees();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [isLegacyDirectory, d365Page, d365PageSize, d365Search, d365Attempt]);

  const switchDirectoryMode = (mode) => {
    if (mode === directoryMode) return;
    setDirectoryMode(mode);
    setSearch("");
    setCurrentPage(1);
    setD365Page(1);
  };

  const retryD365Employees = () => {
    setD365Error(null);
    setD365Attempt((attempt) => attempt + 1);
  };

  // =========================
  // MODAL
  // =========================

  const [isModalOpen, setIsModalOpen] = useState(false);


  // null = Add mode
  // employee ID = Edit mode
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);

  // =========================
  // FORM DATA
  // =========================
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    employeeId: "",
    title: "",
    firstName: "",
    middleName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",

    country: "India",

    phone: "",
    phoneCountryCode: "+91",
    email: "",
    address: "",

    designation: "",
    department: "",
    joiningDate: "",
    employmentType: "",
    legalEntity: "SHLT",
    workerType: "Employee",
    employmentCategory: "",
    projectRoleId: "",
    employmentEndDate: "Never",
    terminationReason: "Not applicable",
    lastDateWorked: "Not applicable",
    position: "",
    positionTitle: "",
    assignmentEnd: "",
    assignmentStart: "",
    makePrimary: false,

    accountNumber: "",
    reAccountNumber: "",
    bankName: "",
    branchName: "",
    ifscCode: "",
    accountType: "",
    branchAddress: "",

    status: "Active",

    emergencyContact: "",
    emergencyContactCountry: "Qatar",
    emergencyContactCountryCode: "+974",
    passportNo: "",
    passportExpDate: "",
    nationality: "Indian",
    religion: "",
    maritalStatus: "",
    childrenCount: "",
    profilePhoto: null,
  });
  const [invalidFields, setInvalidFields] = useState({});

  const updateFormField = (field, value) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
    if (value.trim()) {
      setInvalidFields((previous) => ({ ...previous, [field]: false }));
    }
  };

  // =========================
  // COUNTRIES
  // =========================

  const countries = [
    { name: "Qatar", code: "+974" },
    { name: "India", code: "+91" },
    { name: "USA", code: "+1" },
    { name: "UK", code: "+44" },
    { name: "Australia", code: "+61" },
    { name: "UAE", code: "+971" },
  ];

  // "Qatar (+974)": the country name is translated; the code is wrapped in invisible left-to-right marks
  // (LRI … PDI) so Arabic shows "+974", not "974+"
  const countryOptionLabel = (country) =>
    t("employeesList.form.countryOption", {
      country: valueLabel("country", country.name),
      code: `⁦${country.code}⁩`,
      defaultValue: "{{country}} ({{code}})",
    });

  // =========================
  // RESET FORM
  // =========================
const resetForm = () => {
  setInvalidFields({});
  setFormData({
    employeeId: "",
    title: "",
    firstName: "",
    middleName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",

    phone: "",
    phoneCountryCode: "+91",

    email: "",
    address: "",

    designation: "",
    department: "",
    joiningDate: "",
    employmentType: "",
    legalEntity: "SHLT",
    workerType: "Employee",
    employmentCategory: "",
    projectRoleId: "",
    employmentEndDate: "Never",
    terminationReason: "Not applicable",
    lastDateWorked: "Not applicable",
    position: "",
    positionTitle: "",
    assignmentEnd: "",
    assignmentStart: "",
    makePrimary: false,

    accountNumber: "",
    reAccountNumber: "",
    bankName: "",
    branchName: "",
    ifscCode: "",
    accountType: "",
    branchAddress: "",

    status: "Active",

    emergencyContact: "",
    emergencyContactCountry: "Qatar",
    emergencyContactCountryCode: "+974",
    passportNo: "",
    passportExpDate: "",
    nationality: "Indian",
    religion: "",
    maritalStatus: "",
    childrenCount: "",
    profilePhoto: null,

    country: "India",
  });
};

  // =========================
  // OPEN ADD MODAL
  // =========================

  const openAddEmployee = () => {
    setEditingEmployeeId(null);

    resetForm();

    setIsModalOpen(true);
  };

  // =========================
  // DELETE EMPLOYEE
  // =========================

 const deleteEmployee = (employee) => {
  setArchiveModal({
    open: true,
    employeeId: employee.id,
    employeeName: employee.name,
    exitStatus: "Resigned",
    lastDateWorked: new Date().toISOString().slice(0, 10),
    terminationReason: "Resigned",
  });
};

  const confirmArchiveEmployee = async () => {
    const { employeeId, exitStatus, lastDateWorked, terminationReason } = archiveModal;
    const allowedStatuses = ["Inactive", "Resigned", "Retired", "Dismissed", "Terminated"];

    if (!allowedStatuses.includes(exitStatus)) {
      showAlert(t("employeesList.errors.exitStatusInvalid", { defaultValue: "Please enter one of: Inactive, Resigned, Retired, Dismissed, Terminated" }));
      return;
    }

    if (!lastDateWorked) {
      showAlert(t("employeesList.errors.lastDateWorkedRequired", { defaultValue: "Please select last date worked." }));
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/employees/${employeeId}/status`,
        {
          method: "PATCH",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            status: exitStatus,
            last_date_worked: lastDateWorked,
            termination_reason: terminationReason || exitStatus,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        showAlert(data.message || t("employeesList.errors.archiveFailed", { defaultValue: "Failed to delete employee" }));
        return;
      }

      setArchiveModal({
        open: false,
        employeeId: null,
        employeeName: "",
        exitStatus: "Resigned",
        lastDateWorked: new Date().toISOString().slice(0, 10),
        terminationReason: "Resigned",
      });

      await fetchEmployees();
      showAlert({ variant: "success", message: t("employeesList.success.archived", { defaultValue: "Employee archived successfully. Their record is still searchable." }) });
    } catch (error) {
      console.error("Error deleting employee:", error);
      showAlert(t("leaveDetails.noBackend", { defaultValue: "Unable to connect to backend" }));
    }
  };

  const exportEmployeesToCSV = () => {
  if (employees.length === 0) {
    showAlert({ variant: "info", title: t("employeesList.export.nothingTitle", { defaultValue: "Nothing to export" }), message: t("employeesList.export.nothingMessage", { defaultValue: "No employees to export" }) });
    return;
  }

  const headers = [
    "Employee ID",
    "Name",
    "Designation",
    "Department",
    "Email",
    "Phone",
    "Status",
  ];

  const rows = employees.map((employee) => [
    employee.id,
    employee.name,
    employee.designation,
    employee.department,
    employee.email,
    employee.phone,
    employee.status,
  ]);

  const csvContent = [
    headers,
    ...rows,
  ]
    .map((row) =>
      row
        .map((value) => `"${value ?? ""}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob(
    [csvContent],
    { type: "text/csv;charset=utf-8;" }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = "employees.csv";

  link.click();

  URL.revokeObjectURL(url);
};

  // =========================
  // CHECK EMPLOYEE ID
  // =========================

  const isEmployeeIdExists = (employeeId, currentId = null) => {
    return employees.some(
      (employee) =>
        employee.id.toLowerCase() ===
          employeeId.trim().toLowerCase() &&
        employee.id !== currentId
    );
  };

    const isValidEmail = (email) => {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };


   const isValidPhone = (phone, countryCode) => {
  const digits = phone.replace(/\D/g, "");

  // India
  if (countryCode === "+974") {
    return digits.length === 8 && /^[3-7]\d{7}$/.test(digits);
  }

  if (countryCode === "+91") {
    return digits.length === 10 && /^[6-9]\d{9}$/.test(digits);
  }

  // USA
  if (countryCode === "+1") {
    return digits.length === 10;
  }

  // UK
  if (countryCode === "+44") {
    return digits.length >= 10 && digits.length <= 11;
  }

  // Other countries
  return digits.length >= 7 && digits.length <= 15;
};
  // Backend still stores a single "name" field
  const buildFullName = ({ firstName, middleName, lastName }) =>
    [firstName, middleName, lastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");

  const splitFullName = (name = "") => {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    if (parts.length <= 1) {
      return { firstName: parts[0] || "", middleName: "", lastName: "" };
    }

    return {
      firstName: parts[0],
      middleName: parts.slice(1, -1).join(" "),
      lastName: parts[parts.length - 1],
    };
  };

  // =========================
  // ADD EMPLOYEE
  // =========================

  

  const addEmployee = async () => {
    const employeeId = formData.employeeId.trim();
    const requiredFields = [
      "employeeId", "title", "firstName", "lastName", "designation", "department", "joiningDate", "employmentType",
      "employmentCategory", "projectRoleId", "terminationReason", "lastDateWorked",
      "position", "positionTitle", "assignmentEnd", "assignmentStart", "email", "phone"
    ];
    const missingFields = requiredFields.reduce(
      (fields, field) => ({ ...fields, [field]: !formData[field].trim() }),
      {}
    );

    if (Object.values(missingFields).some(Boolean)) {
      setInvalidFields(missingFields);
    }

    if (!employeeId) {
      showAlert(t("employeesList.errors.employeeIdRequired", { defaultValue: "Please enter Employee ID" }));
      return;
    }

    if (isEmployeeIdExists(employeeId)) {
      showAlert(t("employeesList.errors.employeeIdExists", { defaultValue: "Employee ID already exists!" }));
      return;
    }

    if (!formData.title) {
      showAlert(t("employeesList.errors.titleRequired", { defaultValue: "Title is required." }));
      return;
    }

    if (!formData.firstName.trim()) {
      showAlert(t("employeesList.errors.firstNameRequired", { defaultValue: "First Name is required." }));
      return;
    }

    if (!formData.lastName.trim()) {
      showAlert(t("employeesList.errors.lastNameRequired", { defaultValue: "Last Name is required." }));
      return;
    }

    if (!formData.designation.trim()) {
      showAlert(t("employeesList.errors.designationRequired", { defaultValue: "Please enter Designation" }));
      return;
    }

    if (!formData.department.trim()) {
      showAlert(t("employeesList.errors.departmentRequired", { defaultValue: "Please enter Department" }));
      return;
    }

    if (!formData.joiningDate) {
      showAlert(t("employeesList.errors.startDateRequired", { defaultValue: "Please select Employment Start Date" }));
      return;
    }

    if (!formData.employmentType) {
      showAlert(t("employeesList.errors.employmentTypeRequired", { defaultValue: "Please select Employment Type" }));
      return;
    }

    const markedFields = [
      ["employmentCategory", t("employeesList.errors.employmentCategoryRequired", { defaultValue: "Please select Employment Category" })],
      ["projectRoleId", t("employeesList.errors.projectRoleRequired", { defaultValue: "Please select Project Role ID" })],
      ["terminationReason", t("employeesList.errors.terminationReasonRequired", { defaultValue: "Please enter Termination Reason" })],
      ["lastDateWorked", t("employeesList.errors.lastDateWorkedFieldRequired", { defaultValue: "Please enter Last Date Worked" })],
      ["position", t("employeesList.errors.positionRequired", { defaultValue: "Please select Position" })],
      ["positionTitle", t("employeesList.errors.positionTitleRequired", { defaultValue: "Please enter Position Title" })],
      ["assignmentEnd", t("employeesList.errors.assignmentEndRequired", { defaultValue: "Please select Assignment End" })],
      ["assignmentStart", t("employeesList.errors.assignmentStartRequired", { defaultValue: "Please select Assignment Start" })],
    ];

    for (const [field, message] of markedFields) {
      if (!String(formData[field] || "").trim()) {
        showAlert(message);
        return;
      }
    }

    if (!formData.email.trim()) {
      showAlert(t("employeesList.errors.emailRequired", { defaultValue: "Please enter Email" }));
      return;
    }

    if (!isValidEmail(formData.email)) {
      showAlert(t("employeesList.errors.emailInvalid", { defaultValue: "Please enter a valid email address" }));
      return;
    }

    if (!formData.phone.trim()) {
      showAlert(t("employeesList.errors.phoneRequired", { defaultValue: "Please enter phone number" }));
      return;
    }

    const phoneDigits = formData.phone.replace(/\D/g, "");

    if (formData.phoneCountryCode === "+91") {
      if (
        phoneDigits.length !== 10 ||
        !/^[6-9]\d{9}$/.test(phoneDigits)
      ) {
        showAlert(t("employeesList.errors.indianPhoneInvalid", { defaultValue: "Please enter a valid 10-digit Indian phone number" }));
        return;
      }
    } else if (
      !isValidPhone(
        formData.phone,
        formData.phoneCountryCode
      )
    ) {
      showAlert(t("employeesList.errors.phoneInvalid", { defaultValue: "Please enter a valid phone number" }));
      return;
    }
const profilePhoto = await fileToDataUrl(formData.profilePhoto);
const employeeData = {
  employee_id: employeeId,
  name: buildFullName(formData),
  date_of_birth: formData.dateOfBirth || null,
  gender: formData.gender || null,
  phone: `${formData.phoneCountryCode} ${formData.phone.trim()}`,
  email: formData.email.trim(),
  address: formData.address || null,
  designation: formData.designation.trim(),
  department: formData.department.trim(),
  joining_date: formData.joiningDate || null,
  employment_type: formData.employmentType || null,
  legal_entity: formData.legalEntity,
  worker_type: formData.workerType,
  employment_category: formData.employmentCategory,
  project_role_id: formData.projectRoleId,
  employment_end_date: formData.employmentEndDate,
  termination_reason: formData.terminationReason,
  last_date_worked: formData.lastDateWorked,
  position: formData.position,
  position_title: formData.positionTitle,
  assignment_end: formData.assignmentEnd,
  assignment_start: formData.assignmentStart,
  make_primary: formData.makePrimary,
  status: formData.status || "Active",
  emergency_contact: formData.emergencyContact
    ? `${formData.emergencyContactCountryCode} ${formData.emergencyContact}`
    : null,
  passport_no: formData.passportNo || null,
  passport_exp_date: formData.passportExpDate || null,
  nationality: formData.nationality || null,
  religion: formData.religion || null,
  marital_status: formData.maritalStatus || null,
  children_count: formData.childrenCount === "" ? null : Number(formData.childrenCount),
  profile_photo: profilePhoto,
};

    try {
      const response = await fetch(
        `${API_URL}/api/employees`,
        {
          method: "POST",
          headers: authHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(employeeData),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Backend error:", data);
        showAlert(data.message || t("employeesList.errors.addFailed", { defaultValue: "Failed to add employee" }));
        return;
      }

      console.log("Employee added successfully:", data);

      // Get the latest data from the database
      await fetchEmployees();

      showAlert({ variant: "success", message: t("employeesList.success.added", { defaultValue: "Employee added successfully!" }) });

      setIsModalOpen(false);
      setEditingEmployeeId(null);
      resetForm();
    } catch (error) {
      console.error("Error adding employee:", error);
      showAlert(t("leaveDetails.noBackend", { defaultValue: "Unable to connect to backend" }));
    }
  };

  // =========================
  // EDIT EMPLOYEE
  // =========================

   const viewEmployee = (employee) => {
    const employeeSlug = employee.name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

    navigate(
        `/employees/employeedetails/${employeeSlug}`
    );
};


  const editEmployee = (employee) => {
    setInvalidFields({});
    setEditingEmployeeId(employee.id);

    let phoneNumber = employee.phone || "";

    let countryCode = "+91";
    let country = "India";
    let emergencyContact = employee.emergencyContact || "";
    let emergencyContactCountryCode = "+974";
    let emergencyContactCountry = "Qatar";

    // Try to separate country code from phone
    const matchedCountry = countries.find(
      (item) =>
        phoneNumber.startsWith(item.code)
    );

    if (matchedCountry) {
      countryCode = matchedCountry.code;
      country = matchedCountry.name;

      phoneNumber = phoneNumber
        .replace(matchedCountry.code, "")
        .trim();
    }

    const matchedEmergencyCountry = countries.find((item) =>
      emergencyContact.startsWith(item.code)
    );
    if (matchedEmergencyCountry) {
      emergencyContactCountryCode = matchedEmergencyCountry.code;
      emergencyContactCountry = matchedEmergencyCountry.name;
      emergencyContact = emergencyContact
        .replace(matchedEmergencyCountry.code, "")
        .trim();
    }

    setFormData({
      employeeId: employee.id,

      title: "",
      ...splitFullName(employee.name),

      dateOfBirth:
        employee.dateOfBirth || "",

      gender:
        employee.gender || "",

      country:
        employee.country || country,

      phoneCountryCode:
        employee.countryCode || countryCode,

      phone: formatPhoneInput(phoneNumber, employee.countryCode || countryCode),

      email:
        employee.email || "",

      address:
        employee.address || "",

      designation:
        employee.designation || "",

      department:
        employee.department || "",

      joiningDate:
        employee.joiningDate || "",

      employmentType:
        employee.employmentType || "",

      legalEntity: employee.legalEntity || "SHLT",
      workerType: employee.workerType || "Employee",
      employmentCategory: employee.employmentCategory || "",
      projectRoleId: employee.projectRoleId || "",
      employmentEndDate: employee.employmentEndDate || "Never",
      terminationReason: employee.terminationReason || "Not applicable",
      lastDateWorked: employee.lastDateWorked || "Not applicable",
      position: employee.position || employee.designation || "",
      positionTitle: employee.positionTitle || employee.designation || "",
      assignmentEnd: employee.assignmentEnd || "",
      assignmentStart: employee.assignmentStart || employee.joiningDate || "",
      makePrimary: Boolean(employee.makePrimary),

      accountNumber: "",
      reAccountNumber: "",
      bankName: "",
      branchName: "",
      ifscCode: "",
      accountType: "",
      branchAddress: "",

      status:
        employee.status || "Active",

      emergencyContact,
      emergencyContactCountry,
      emergencyContactCountryCode,
      passportNo: employee.passportNo || "",
      passportExpDate: employee.passportExpDate || "",
      nationality: employee.nationality || "Indian",
      religion: employee.religion || "",
      maritalStatus: employee.maritalStatus || "",
      childrenCount: employee.childrenCount ?? "",

      profilePhoto:
        employee.profilePhoto || null,
    });

    setIsModalOpen(true);
  };

  // =========================
// UPDATE EMPLOYEE
// =========================

const updateEmployee = async () => {
  const employeeId = formData.employeeId.trim();
  const requiredFields = ["employeeId", "firstName", "lastName", "designation", "department", "email", "phone"];
  const missingFields = requiredFields.reduce(
    (fields, field) => ({ ...fields, [field]: !formData[field].trim() }),
    {}
  );

  if (Object.values(missingFields).some(Boolean)) {
    setInvalidFields(missingFields);
  }

  if (!employeeId) {
    showAlert(t("employeesList.errors.employeeIdRequired", { defaultValue: "Please enter Employee ID" }));
    return;
  }

  if (
    isEmployeeIdExists(
      employeeId,
      editingEmployeeId
    )
  ) {
    showAlert(t("employeesList.errors.employeeIdExists", { defaultValue: "Employee ID already exists!" }));
    return;
  }

  if (!formData.firstName.trim()) {
    showAlert(t("employeesList.errors.firstNameRequired", { defaultValue: "First Name is required." }));
    return;
  }

  if (!formData.lastName.trim()) {
    showAlert(t("employeesList.errors.lastNameRequired", { defaultValue: "Last Name is required." }));
    return;
  }

  if (!formData.designation.trim()) {
    showAlert(t("employeesList.errors.designationRequired", { defaultValue: "Please enter Designation" }));
    return;
  }

  if (!formData.department.trim()) {
    showAlert(t("employeesList.errors.departmentRequired", { defaultValue: "Please enter Department" }));
    return;
  }

  if (!formData.email.trim()) {
    showAlert(t("employeesList.errors.emailRequired", { defaultValue: "Please enter Email" }));
    return;
  }

  if (!formData.phone.trim()) {
    showAlert(t("employeesList.errors.phoneNumberRequired", { defaultValue: "Please enter Phone Number" }));
    return;
  }

  const profilePhoto = await fileToDataUrl(formData.profilePhoto);

  // Data to send to backend
  const employeeData = {
  employee_id: employeeId,
  name: buildFullName(formData),
  date_of_birth: formData.dateOfBirth || null,
  gender: formData.gender || null,
  phone: `${formData.phoneCountryCode} ${formData.phone}`,
  email: formData.email,
  address: formData.address || null,
  designation: formData.designation,
  department: formData.department,
  joining_date: formData.joiningDate || null,
  employment_type: formData.employmentType || null,
  legal_entity: formData.legalEntity || "SHLT",
  worker_type: formData.workerType || "Employee",
  employment_category: formData.employmentCategory || null,
  project_role_id: formData.projectRoleId || null,
  employment_end_date: formData.employmentEndDate || "Never",
  termination_reason: formData.terminationReason || null,
  last_date_worked: formData.lastDateWorked || null,
  position: formData.position || formData.designation,
  position_title: formData.positionTitle || formData.designation,
  assignment_start: formData.assignmentStart || formData.joiningDate || null,
  assignment_end: formData.assignmentEnd || null,
  make_primary: Boolean(formData.makePrimary),
  status: formData.status || "Active",
  emergency_contact: formData.emergencyContact
    ? `${formData.emergencyContactCountryCode} ${formData.emergencyContact}`
    : null,
  passport_no: formData.passportNo || null,
  passport_exp_date: formData.passportExpDate || null,
  nationality: formData.nationality || null,
  religion: formData.religion || null,
  marital_status: formData.maritalStatus || null,
  children_count: formData.childrenCount === "" ? null : Number(formData.childrenCount),
  profile_photo: profilePhoto,
};
  try {
    const response = await fetch(
      `${API_URL}/api/employees/${editingEmployeeId}`,
      {
        method: "PUT",
        headers: authHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(employeeData),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.message || t("employeesList.errors.updateFailed", { defaultValue: "Failed to update employee" }));
      return;
    }

    // Get the latest data from the database
    await fetchEmployees();

    showAlert({ variant: "success", message: t("employeesList.success.updated", { defaultValue: "Employee updated successfully!" }) });

    setEditingEmployeeId(null);
    setIsModalOpen(false);
    resetForm();

  } catch (error) {
    console.error("Error updating employee:", error);
    showAlert(t("leaveDetails.noBackend", { defaultValue: "Unable to connect to backend" }));
  }
};

  // =========================
  // TABLE COLUMNS
  // =========================

  const columns = [
    {
      key: "id",
      label: t("employeeSettings.employeeId", { defaultValue: "Employee ID" }),
      // IDs, emails and phones always read left-to-right, also on the Arabic (RTL) page
      render: (employee) => <span dir="ltr">{employee.id}</span>,
    },

    {
      key: "name",
      label: t("employeesList.table.name", { defaultValue: "Name" }),
    },

    {
      key: "designation",
      label: t("employeesList.table.designation", { defaultValue: "Designation" }),
    },

    {
      key: "department",
      label: t("profileEdit.fields.department", { defaultValue: "Department" }),
    },

    {
      key: "email",
      label: t("profileEdit.fields.email", { defaultValue: "Email" }),
      render: (employee) => <span dir="ltr">{employee.email}</span>,
    },

    {
      key: "phone",
      label: t("profileEdit.fields.phone", { defaultValue: "Phone" }),
      render: (employee) => <span dir="ltr">{employee.phone}</span>,
    },

    {
      key: "status",
      label: t("profileEdit.fields.status", { defaultValue: "Status" }),

      render: (employee) => (
        <span
          className={
            employee.status === "Active"
              ? "status active"
              : "status inactive"
          }
        >
          {valueLabel("status", employee.status)}
        </span>
      ),
    },

    {
      key: "view",
      label: t("employeesList.table.view", { defaultValue: "View" }),
      render: (employee) => (
        <button
          type="button"
          className="employee-view-button"
          onClick={() => viewEmployee(employee)}
          aria-label={t("employeesList.table.viewEmployee", { name: employee.name, defaultValue: "View {{name}}" })}
          title={t("employeesList.table.viewEmployee", { name: employee.name, defaultValue: "View {{name}}" })}
        >
          <Eye size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      ),
    },

{
  key: "delete",
  label: t("employeesList.table.delete", { defaultValue: "Delete" }),

  render: (employee) => (
    <Button
      variant="danger"
      onClick={() => deleteEmployee(employee)}
    >
      {t("employeesList.table.archive", { defaultValue: "Archive" })}
    </Button>
  ),
},
  ]

  // D365 directory rows are read-only. EmployeesV2 here provides only the identity
  // triple (PersonnelNumber + EmploymentLegalEntityId + EmploymentId) plus Name.
  // Phone Number / Status are NOT exposed by this endpoint, so those columns
  // render "Not available" instead of demo or fabricated values. Employee ID maps
  // to the standard D365 Personnel Number. Archive stays enabled for HRMS demo
  // records only and is disabled in D365 mode (no verified D365 delete operation).
  const directoryInitial = (name) => (String(name || "?").trim().charAt(0) || "?").toUpperCase();
  const [directoryDetailsRow, setDirectoryDetailsRow] = useState(null);
  const directoryUnavailable = (key, fallback) =>
    t(`employeesList.d365.unavailable.${key}`, { defaultValue: fallback });
  const d365RowKey = (row) =>
    `${row.personnelNumber}|${row.employmentLegalEntityId}|${row.employmentId}`;
  const d365Columns = [
    {
      key: "employeeId",
      label: t("employeesList.d365.employeeId", { defaultValue: "Employee ID" }),
      render: (row) => <span className="directory-mono" dir="ltr">{row.personnelNumber}</span>,
    },
    {
      key: "name",
      label: t("employeesList.d365.columnName", { defaultValue: "Employee Name" }),
      render: (row) => (
        <span className="directory-employee">
          <span className="directory-avatar" aria-hidden="true">{directoryInitial(row.name)}</span>
          <span className="directory-name">{row.name}</span>
        </span>
      ),
    },
    {
      key: "employmentLegalEntityId",
      label: t("employeesList.d365.legalEntity", { defaultValue: "Legal Entity" }),
      render: (row) => <span className="directory-entity" dir="ltr">{row.employmentLegalEntityId || directoryUnavailable("legalEntity", "Not available")}</span>,
    },
    {
      key: "phoneNumber",
      label: t("employeesList.d365.phoneNumber", { defaultValue: "Phone Number" }),
      render: () => <span className="directory-unavailable" dir="ltr">{directoryUnavailable("phone", "Not available")}</span>,
    },
    {
      key: "status",
      label: t("employeesList.d365.status", { defaultValue: "Status" }),
      render: () => <span className="directory-unavailable">{directoryUnavailable("status", "Not available")}</span>,
    },
    {
      key: "view",
      label: t("employeesList.table.view", { defaultValue: "View" }),
      render: (row) => (
        <button
          type="button"
          className="employee-view-button"
          onClick={() => setDirectoryDetailsRow(row)}
          aria-label={t("employeesList.table.viewEmployee", { name: row.name, defaultValue: "View {{name}}" })}
          title={t("employeesList.table.viewEmployee", { name: row.name, defaultValue: "View {{name}}" })}
        >
          <Eye size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      ),
    },
    {
      key: "archive",
      label: t("employeesList.table.delete", { defaultValue: "Delete / Archive" }),
      render: () => (
        <Button
          variant="danger"
          disabled
          title={t("employeesList.d365.archiveDisabled", { defaultValue: "Archiving is available for HRMS demo records only. D365 records are read-only." })}
        >
          {t("employeesList.table.archive", { defaultValue: "Archive" })}
        </Button>
      ),
    },
  ]

  // =========================
  // SEARCH FILTER
  // =========================
const normalizedSearch = search.trim().toLowerCase();
const designations = [...new Set(employees.map((employee) => employee.designation).filter(Boolean))].sort();
const filteredEmployees =
  employees
    .filter((employee) => {

    const matchesSearch =
      employee.name
        .toLowerCase()
        .includes(search.toLowerCase()) ||

      employee.id
        .toLowerCase()
        .includes(search.toLowerCase()) ||

      employee.department
        .toLowerCase()
        .includes(search.toLowerCase()) ||

      employee.designation
        .toLowerCase()
        .includes(search.toLowerCase()) ||

      employee.email
        .toLowerCase()
        .includes(search.toLowerCase()) ||

      employee.phone
        .toLowerCase()
        .includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === "All" ||
      employee.status === statusFilter;

    const matchesDesignation =
      designationFilter === "All" ||
      employee.designation === designationFilter;

    const joiningTime = employee.joiningDate
      ? new Date(employee.joiningDate).getTime()
      : NaN;
    const rangeStart = Date.now() - (
      dateRangeFilter === "7" ? 7 :
      dateRangeFilter === "30" ? 30 : 0
    ) * 24 * 60 * 60 * 1000;
    const matchesDateRange =
      dateRangeFilter === "all" ||
      (!Number.isNaN(joiningTime) && joiningTime >= rangeStart && joiningTime <= Date.now());

    return matchesSearch && matchesStatus && matchesDesignation && matchesDateRange;
    })
    .sort((first, second) => {
      if (!normalizedSearch) return 0;

      const firstName = first.name.toLowerCase();
      const secondName = second.name.toLowerCase();
      const firstExact = firstName === normalizedSearch;
      const secondExact = secondName === normalizedSearch;
      if (firstExact !== secondExact) return firstExact ? -1 : 1;

      const firstStartsWith = firstName.startsWith(normalizedSearch);
      const secondStartsWith = secondName.startsWith(normalizedSearch);
      if (firstStartsWith !== secondStartsWith) {
        return firstStartsWith ? -1 : 1;
      }

      if (firstName !== secondName) return firstName.localeCompare(secondName);
      return new Date(second.joiningDate || 0) - new Date(first.joiningDate || 0);
    });

  // =========================
  // PAGINATION
  // =========================

      const totalPages = Math.ceil(
        filteredEmployees.length / employeesPerPage
    );

      const startIndex =
        (currentPage - 1) * employeesPerPage;

      const currentEmployees =
        filteredEmployees.slice(
        startIndex,
        startIndex + employeesPerPage
     );

  const newJoiners = employees.filter((employee) => {
    if (!employee.joiningDate) return false;
    const joiningDate = new Date(employee.joiningDate);
    const daysSinceJoining =
      (Date.now() - joiningDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceJoining >= 0 && daysSinceJoining <= 30;
  }).length;

  // =========================
  // RETURN
  // =========================

  return (
    <DashboardLayout>

      <div className="employees-page">

        {/* ================= HEADER ================= */}

        <div className="employees-header">
          <div>
            <h1>{t("employeesList.title", { defaultValue: "Employees List" })}</h1>
            <p>
              {t("employeesList.subtitle", { defaultValue: "Manage all company employees" })}
              <span
                className={`employee-source-badge ${isLegacyDirectory ? "employee-source-badge--demo" : ""}`}
                title={isLegacyDirectory
                  ? t("employeesList.d365.sourceLegacyTitle", { defaultValue: "Local HRMS demo records (PostgreSQL)" })
                  : t("employeesList.d365.sourceD365Title", { defaultValue: "Live from Dynamics 365 Finance & Operations" })}
              >
                <span className="employee-source-badge-dot" aria-hidden="true"></span>
                {isLegacyDirectory
                  ? t("employeesList.d365.sourceLegacyShort", { defaultValue: "HRMS demo" })
                  : t("employeesList.d365.sourceD365Short", { defaultValue: "D365 · Finance & Operations" })}
              </span>
            </p>
          </div>

         <div className="header-actions">
            {isLegacyDirectory && (
              <>
                <button type="button" className={`view-toggle ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")} aria-label={t("employeesList.listView", { defaultValue: "List view" })}>
                  <List size={16} />
                </button>
                <button type="button" className={`view-toggle ${viewMode === "grid" ? "active" : ""}`} onClick={() => setViewMode("grid")} aria-label={t("employeesList.gridView", { defaultValue: "Grid view" })}>
                  <Grid2X2 size={15} />
                </button>
                <Button variant="secondary" onClick={exportEmployeesToCSV}>
                  {t("employeesList.export.button", { defaultValue: "Export" })} <ChevronDown size={14} />
                </Button>
                <Button onClick={openAddEmployee}>⊕ {t("hrDashboard.quickActions.addEmployee", { defaultValue: "Add Employee" })}</Button>
              </>
            )}

        </div>

        </div>

        <div className="employee-stats">

  {!isLegacyDirectory ? (
    <>
  {/* D365 KPI cards — same premium Demo styling; only the real API total is shown.
      Active/Inactive/New Joiners need verified D365 status/joining-date fields that
      EmployeesV2 does not expose, so they show "—" instead of invented numbers. */}
  <div className="stat-card">
    <div className="stat-card-content">
      <span>{t("employeesList.d365.totalEmployees", { defaultValue: "Total Employees" })}</span>
      <strong>{d365Total}</strong>
    </div>
    <Users className="stat-icon total" size={23} />
  </div>

  <div className="stat-card">
    <div className="stat-card-content">
      <span>{valueLabel("status", "Active")}</span>
      <strong>—</strong>
    </div>
    <UserCheck className="stat-icon active" size={23} />
  </div>

  <div className="stat-card">
    <div className="stat-card-content">
      <span>{valueLabel("status", "Inactive")}</span>
      <strong>—</strong>
    </div>
    <UserX className="stat-icon inactive" size={23} />
  </div>

  <div className="stat-card">
    <div className="stat-card-content">
      <span>{t("hrDashboard.stats.newJoiners", { defaultValue: "New Joiners" })}</span>
      <strong>—</strong>
    </div>
    <UserPlus className="stat-icon joiners" size={23} />
  </div>
    </>
  ) : (
    <>
  <div className="stat-card">
    <div className="stat-card-content">
      <span>{t("hrDashboard.stats.totalEmployees", { defaultValue: "Total Employees" })}</span>
      <strong>{employees.length}</strong>
    </div>
    <Users className="stat-icon total" size={23} />
  </div>

  <div className="stat-card">
    <div className="stat-card-content">
      <span>{valueLabel("status", "Active")}</span>
      <strong>
        {employees.filter(
          (employee) => employee.status === "Active"
        ).length}
      </strong>
    </div>
    <UserCheck className="stat-icon active" size={23} />
  </div>

  <div className="stat-card">
    <div className="stat-card-content">
      <span>{valueLabel("status", "Inactive")}</span>
      <strong>
        {employees.filter(
          (employee) => employee.status === "Inactive"
        ).length}
      </strong>
    </div>
    <UserX className="stat-icon inactive" size={23} />
  </div>

  <div className="stat-card">
    <div className="stat-card-content">
      <span>{t("hrDashboard.stats.newJoiners", { defaultValue: "New Joiners" })}</span>
      <strong>{newJoiners}</strong>
    </div>
    <UserPlus className="stat-icon joiners" size={23} />
  </div>
    </>
  )}

</div>

        {/* ================= TABLE ================= */}

        <div className="employee-list-header">
          <div>
            <p className="employee-list-kicker">{t("employeesList.directory", { defaultValue: "DIRECTORY" })}</p>
            <h2>{t("employeesList.employeeList", { defaultValue: "Employee List" })}</h2>
          </div>
          <div className="employee-list-header-actions">
            <div
              className="employee-source-toggle"
              role="group"
              aria-label={t("employeesList.d365.sourceAria", { defaultValue: "Employee directory source" })}
            >
              <button
                type="button"
                className={!isLegacyDirectory ? "active" : ""}
                aria-pressed={!isLegacyDirectory}
                onClick={() => switchDirectoryMode("d365")}
              >
                {t("employeesList.d365.sourceD365", { defaultValue: "D365 employees" })}
              </button>
              <button
                type="button"
                className={isLegacyDirectory ? "active" : ""}
                aria-pressed={isLegacyDirectory}
                onClick={() => switchDirectoryMode("legacy")}
              >
                {t("employeesList.d365.sourceLegacy", { defaultValue: "HRMS demo records" })}
              </button>
            </div>
            {isLegacyDirectory && (
              <button
                type="button"
                className={`filter-toggle ${showFilters ? "active" : ""}`}
                onClick={() => setShowFilters((visible) => !visible)}
                aria-expanded={showFilters}
              >
                <SlidersHorizontal size={16} />
                {t("employeesList.filters.button", { defaultValue: "Filters" })}
                <span className="filter-count">3</span>
              </button>
            )}
          </div>
        </div>

        <div className="employee-table-container">
          {isLegacyDirectory && showFilters && (
            <div className="employee-list-filters" aria-label={t("employeesList.filters.ariaLabel", { defaultValue: "Employee filters" })}>
              <button
                type="button"
                className="clear-filters-button"
                onClick={() => {
                  setDateRangeFilter("all");
                  setDesignationFilter("All");
                  setStatusFilter("All");
                  setCurrentPage(1);
                  setShowFilters(false);
                }}
              >
                {t("employeesList.filters.clear", { defaultValue: "Clear filters" })}
              </button>
              <div className="filter-field">
                <span>{t("employeesList.filters.dateRange", { defaultValue: "Date range" })}</span>
                <select value={dateRangeFilter} onChange={(e) => { setDateRangeFilter(e.target.value); setCurrentPage(1); setShowFilters(false); }}>
                  <option value="all">{t("employeesList.filters.allDates", { defaultValue: "All dates" })}</option>
                  <option value="7">{t("dashboard.last7Days", { defaultValue: "Last 7 days" })}</option>
                  <option value="30">{t("employeesList.filters.last30Days", { defaultValue: "Last 30 days" })}</option>
                </select>
              </div>
              <div className="filter-field">
                <span>{t("employeesList.table.designation", { defaultValue: "Designation" })}</span>
                <select value={designationFilter} onChange={(e) => { setDesignationFilter(e.target.value); setCurrentPage(1); setShowFilters(false); }}>
                  <option value="All">{t("employeesList.filters.allDesignations", { defaultValue: "All designations" })}</option>
                  {designations.map((designation) => <option key={designation} value={designation}>{designation}</option>)}
                </select>
              </div>
            </div>
          )}

          {!isLegacyDirectory ? (
            <>
              {/* ============ D365 DIRECTORY (server-side search + paging) ============ */}
              {d365Loading ? (
                <div className="employees-loading employees-loading--table" role="status" aria-live="polite">
                  <span className="employees-loading-spinner" aria-hidden="true"></span>
                  <p>{t("employeesList.d365.loading", { defaultValue: "Loading D365 employees..." })}</p>
                  <div className="directory-skeleton" aria-hidden="true">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <span key={index} className="directory-skeleton-row">
                        <span className="directory-skeleton-cell directory-skeleton-cell--id" />
                        <span className="directory-skeleton-cell directory-skeleton-cell--name" />
                        <span className="directory-skeleton-cell" />
                        <span className="directory-skeleton-cell directory-skeleton-cell--short" />
                        <span className="directory-skeleton-cell directory-skeleton-cell--short" />
                        <span className="directory-skeleton-cell directory-skeleton-cell--action" />
                        <span className="directory-skeleton-cell directory-skeleton-cell--action" />
                      </span>
                    ))}
                  </div>
                </div>
              ) : d365Error ? (
                <div className="employees-empty employees-error" role="alert">
                  <TriangleAlert size={34} strokeWidth={1.6} aria-hidden="true" />
                  <p>
                    {d365Error.stage === "config"
                      ? t("employeesList.d365.errorConfig", { defaultValue: "D365 is not configured on the backend. Set the D365_* environment variables and try again." })
                      : d365Error.stage === "authentication"
                        ? t("employeesList.d365.errorAuth", { defaultValue: "D365 authentication failed. Ask your administrator to check the app registration and admin consent." })
                        : t("employeesList.d365.errorGeneric", { defaultValue: "Unable to load D365 employees. Please try again." })}
                  </p>
                  <Button variant="secondary" onClick={retryD365Employees}>
                    <RefreshCw size={14} aria-hidden="true" />{" "}
                    {t("employeesList.d365.retry", { defaultValue: "Try again" })}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="employee-table-controls employee-table-controls--directory">
                    <div className="table-search">
                      <SearchBar
                        id="employee-search"
                        value={search}
                        onChange={setSearch}
                        placeholder={t("employeesList.d365.searchPlaceholder", { defaultValue: "Search by name or personnel number" })}
                      />
                    </div>
                    <div className="table-controls-spacer" />
                    <label className="directory-page-size" htmlFor="d365-employees-per-page">{t("employeeAttendance.rowsPerPage", { defaultValue: "Rows per page" })}</label>
                    <select
                      id="d365-employees-per-page"
                      className="directory-page-size-select"
                      value={d365PageSize}
                      onChange={(e) => {
                        setD365PageSize(Number(e.target.value));
                        setD365Page(1);
                      }}
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                    <button
                      type="button"
                      className="employee-refresh-button"
                      onClick={retryD365Employees}
                      disabled={d365Loading}
                      aria-label={t("employeesList.d365.refreshAria", { defaultValue: "Refresh D365 employees" })}
                    >
                      <RefreshCw size={15} className={d365Loading ? "employee-refresh-icon--spinning" : ""} aria-hidden="true" />
                      {t("employeesList.d365.refresh", { defaultValue: "Refresh" })}
                    </button>
                  </div>
                  {d365Rows.length === 0 ? (
                    <div className="employees-empty">
                      <SearchX size={34} strokeWidth={1.6} aria-hidden="true" />
                      <p>{t("employeesList.d365.empty", { defaultValue: "No D365 employees match the current search." })}</p>
                      {search && (
                        <Button variant="secondary" onClick={() => setSearch("")}>
                          {t("employeesList.d365.clearSearch", { defaultValue: "Clear search" })}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="directory-table-scroll">
                      <Table
                        columns={d365Columns}
                        data={d365Rows.map((row) => ({ ...row, id: d365RowKey(row) }))}
                      />
                    </div>
                  )}
                  <div className="pagination pagination--directory" role="navigation" aria-label={t("employeesList.d365.paginationAria", { defaultValue: "D365 employee pages" })}>
                    <button
                      type="button"
                      disabled={d365Page <= 1}
                      onClick={() => setD365Page((prev) => Math.max(1, prev - 1))}
                    >
                      {t("employeesList.pagination.previous", { defaultValue: "← Previous" })}
                    </button>
                    <span className="d365-page-indicator">
                      {t("employeesList.d365.pageOf", { page: d365Page, pages: d365TotalPages, defaultValue: "Page {{page}} of {{pages}}" })}
                      <span className="d365-total-count">
                        {t("employeesList.d365.totalCount", { total: d365Total, defaultValue: "({{total}} employees)" })}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={d365Page >= d365TotalPages}
                      onClick={() => setD365Page((prev) => Math.min(d365TotalPages, prev + 1))}
                    >
                      {t("employeesList.pagination.next", { defaultValue: "Next →" })}
                    </button>
                  </div>
                  <Modal
                    isOpen={Boolean(directoryDetailsRow)}
                    onClose={() => setDirectoryDetailsRow(null)}
                    title={directoryDetailsRow?.name || t("employeesList.d365.detailsTitle", { defaultValue: "Employee details" })}
                  >
                    {directoryDetailsRow && (
                      <div className="directory-details">
                        <div className="directory-details-row">
                          <span>{t("employeesList.d365.employeeId", { defaultValue: "Employee ID" })}</span>
                          <strong dir="ltr">{directoryDetailsRow.personnelNumber}</strong>
                        </div>
                        <div className="directory-details-row">
                          <span>{t("employeesList.d365.columnName", { defaultValue: "Employee Name" })}</span>
                          <strong>{directoryDetailsRow.name}</strong>
                        </div>
                        <div className="directory-details-row">
                          <span>{t("employeesList.d365.legalEntity", { defaultValue: "Legal Entity" })}</span>
                          <strong dir="ltr">{directoryDetailsRow.employmentLegalEntityId || directoryUnavailable("legalEntity", "Not available")}</strong>
                        </div>
                        <div className="directory-details-row">
                          <span>{t("employeesList.d365.employmentId", { defaultValue: "Employment ID" })}</span>
                          <strong dir="ltr">{directoryDetailsRow.employmentId || directoryUnavailable("employment", "Not available")}</strong>
                        </div>
                        <div className="directory-details-row">
                          <span>{t("employeesList.d365.phoneNumber", { defaultValue: "Phone Number" })}</span>
                          <strong dir="ltr">{directoryUnavailable("phone", "Not available")}</strong>
                        </div>
                        <div className="directory-details-row">
                          <span>{t("employeesList.d365.status", { defaultValue: "Status" })}</span>
                          <strong>{directoryUnavailable("status", "Not available")}</strong>
                        </div>
                        <p className="directory-details-note">
                          {t("employeesList.d365.detailsNote", { defaultValue: "Read-only D365 record. Archiving is available for HRMS demo records only." })}
                        </p>
                      </div>
                    )}
                  </Modal>
                </>
              )}
            </>
          ) : loading ? (
            <div className="employees-loading" role="status" aria-live="polite">
              <span className="employees-loading-spinner" aria-hidden="true"></span>
              <p>{t("employeesList.loading", { defaultValue: "Loading employees..." })}</p>
            </div>
          ) : (
            <>
              <div className="employee-table-controls">
                <div className="table-search">
                  <SearchBar
                    id="employee-search"
                    value={search}
                    onChange={setSearch}
                    placeholder={t("employeesList.searchPlaceholder", { defaultValue: "Search employees" })}
                  />
                </div>
                <div className="table-controls-spacer" />
                <label htmlFor="employees-per-page">{t("employeeAttendance.rowsPerPage", { defaultValue: "Rows per page" })}</label>
                <select
                  id="employees-per-page"
                  value={employeesPerPage}
                  onChange={(e) => {
                    setEmployeesPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
                <select
                  className="table-status-filter"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  aria-label={t("employeesList.filters.byStatus", { defaultValue: "Filter by status" })}
                >
                  <option value="All">{t("employeesList.filters.allStatus", { defaultValue: "All status" })}</option>
                  <option value="Active">{valueLabel("status", "Active")}</option>
                  <option value="Inactive">{valueLabel("status", "Inactive")}</option>
                  <option value="Resigned">{valueLabel("status", "Resigned")}</option>
                  <option value="Retired">{valueLabel("status", "Retired")}</option>
                  <option value="Dismissed">{valueLabel("status", "Dismissed")}</option>
                  <option value="Terminated">{valueLabel("status", "Terminated")}</option>
                </select>
              </div>
              {viewMode === "grid" ? (
                <div className="employee-grid">
                  {currentEmployees.map((employee) => (
                    <article className="employee-grid-card" key={employee.id}>
                      <div className="employee-grid-card-top">
                        <div className="employee-avatar">{employee.name?.charAt(0)?.toUpperCase()}</div>
                        <span className={employee.status === "Active" ? "status active" : "status inactive"}>{valueLabel("status", employee.status)}</span>
                      </div>
                      <h3>{employee.name}</h3>
                      <p>{employee.designation || t("employeesList.grid.noDesignation", { defaultValue: "Employee" })}</p>
                      <span>{employee.department || t("employeesList.grid.noDepartment", { defaultValue: "General" })}{employee.phone ? <> · <span dir="ltr">{employee.phone}</span></> : ""}</span>
                      <Button variant="secondary" onClick={() => viewEmployee(employee)}>{t("employeesList.grid.viewDetails", { defaultValue: "View details" })}</Button>
                    </article>
                  ))}
                </div>
              ) : (
                <Table columns={columns} data={currentEmployees} />
              )}
              <div className="pagination">

                <button
                  disabled={currentPage === 1}
                  onClick={() =>
                    setCurrentPage((prev) => prev - 1)
                  }
                >
                  {t("employeesList.pagination.previous", { defaultValue: "← Previous" })}
                </button>

                {Array.from(
                  { length: totalPages },
                  (_, index) => (
                    <button
                      key={index + 1}
                      className={
                        currentPage === index + 1
                          ? "active-page"
                          : ""
                      }
                      onClick={() =>
                        setCurrentPage(index + 1)
                      }
                    >
                      {index + 1}
                    </button>
                  )
                )}

                <button
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((prev) => prev + 1)
                  }
                >
                  {t("employeesList.pagination.next", { defaultValue: "Next →" })}
                </button>

              </div>
            </>
          )}

        </div>

        <Modal
          isOpen={archiveModal.open}
          closeOnOverlayClick={false}
          onClose={() =>
            setArchiveModal({
              open: false,
              employeeId: null,
              employeeName: "",
              exitStatus: "Resigned",
              lastDateWorked: new Date().toISOString().slice(0, 10),
              terminationReason: "Resigned",
            })
          }
          title={t("employeesList.archive.title", { defaultValue: "Archive Employee" })}
        >
          <div className="archive-modal-body">
            <p className="archive-modal-title">{archiveModal.employeeName || t("employeesList.grid.noDesignation", { defaultValue: "Employee" })}</p>
            <p className="archive-modal-text">{t("employeesList.archive.message", { defaultValue: "This will remove the employee from active work while preserving their record. Continue?" })}</p>

            <div className="archive-form-grid">
              <div className="archive-form-group">
                <label htmlFor="archive-status">{t("employeesList.archive.exitStatus", { defaultValue: "Exit status" })}</label>
                <select
                  id="archive-status"
                  value={archiveModal.exitStatus}
                  onChange={(event) =>
                    setArchiveModal((previous) => ({
                      ...previous,
                      exitStatus: event.target.value,
                    }))
                  }
                >
                  <option value="Inactive">{valueLabel("status", "Inactive")}</option>
                  <option value="Resigned">{valueLabel("status", "Resigned")}</option>
                  <option value="Retired">{valueLabel("status", "Retired")}</option>
                  <option value="Dismissed">{valueLabel("status", "Dismissed")}</option>
                  <option value="Terminated">{valueLabel("status", "Terminated")}</option>
                </select>
              </div>

              <div className="archive-form-group">
                <label htmlFor="archive-last-date">{t("employeesList.archive.lastDateWorked", { defaultValue: "Last date worked" })}</label>
                <input
                  id="archive-last-date"
                  type="date"
                  value={archiveModal.lastDateWorked}
                  onChange={(event) =>
                    setArchiveModal((previous) => ({
                      ...previous,
                      lastDateWorked: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="archive-form-group archive-form-group-full">
                <label htmlFor="archive-reason">{t("employeesList.archive.reason", { defaultValue: "Reason" })}</label>
                <input
                  id="archive-reason"
                  type="text"
                  value={archiveModal.terminationReason}
                  onChange={(event) =>
                    setArchiveModal((previous) => ({
                      ...previous,
                      terminationReason: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="archive-modal-actions">
              <button type="button" className="archive-cancel-btn" onClick={() => setArchiveModal({
                open: false,
                employeeId: null,
                employeeName: "",
                exitStatus: "Resigned",
                lastDateWorked: new Date().toISOString().slice(0, 10),
                terminationReason: "Resigned",
              })}>{t("profileEdit.cancel", { defaultValue: "Cancel" })}</button>
              <button type="button" className="archive-confirm-btn" onClick={confirmArchiveEmployee}>{t("employeesList.alerts.ok", { defaultValue: "OK" })}</button>
            </div>
          </div>
        </Modal>

        {/* ================= MODAL ================= */}

        <Modal
          isOpen={isModalOpen}
          closeOnOverlayClick={false}
          onClose={() => {
            setIsModalOpen(false);
            setEditingEmployeeId(null);
            resetForm();
          }}
          title={
            editingEmployeeId
              ? t("employeesList.form.editTitle", { defaultValue: "Edit Employee" })
              : t("hrDashboard.quickActions.addEmployee", { defaultValue: "Add Employee" })
          }
        >

          <div className="employee-form">

            {/* ================= PERSONAL DETAILS ================= */}

            <h3>
              {t("employeesList.form.personalDetails", { defaultValue: "Personal Details" })}
            </h3>

            {/* Employee ID */}

            <div className="form-group">

              <label>
                {t("employeeSettings.employeeId", { defaultValue: "Employee ID" })} <span className="required-mark">*</span>
              </label>

              <input
                type="text"
                placeholder={t("employeesList.form.enterEmployeeId", { defaultValue: "Enter employee ID" })}
                required
                aria-required="true"
                aria-invalid={invalidFields.employeeId ? "true" : "false"}

                className={invalidFields.employeeId ? "field-invalid" : ""}
                value={formData.employeeId}

                onChange={(e) =>
                  updateFormField("employeeId", e.target.value)
                }
              />

            </div>

            {/* Title */}

            <div className="form-group">

              <label>
                {t("employeesList.form.title", { defaultValue: "Title" })} <span className="required-mark">*</span>
              </label>

              <select
                required
                aria-required="true"
                aria-invalid={invalidFields.title ? "true" : "false"}

                className={invalidFields.title ? "field-invalid" : ""}
                value={formData.title}

                onChange={(e) =>
                  updateFormField("title", e.target.value)
                }
              >
                <option value="">{t("employeesList.form.selectTitle", { defaultValue: "Select title" })}</option>
                <option value="Mr">{valueLabel("title", "Mr")}</option>
                <option value="Ms">{valueLabel("title", "Ms")}</option>
                <option value="Mrs">{valueLabel("title", "Mrs")}</option>
                <option value="Dr">{valueLabel("title", "Dr")}</option>
              </select>

            </div>

            {/* First Name */}

            <div className="form-group">

              <label>
                {t("employeesList.form.firstName", { defaultValue: "First Name" })} <span className="required-mark">*</span>
              </label>

              <input
                type="text"
                placeholder={t("employeesList.form.enterFirstName", { defaultValue: "Enter first name" })}
                required
                aria-required="true"
                aria-invalid={invalidFields.firstName ? "true" : "false"}

                className={invalidFields.firstName ? "field-invalid" : ""}
                value={formData.firstName}

                onChange={(e) =>
                  updateFormField("firstName", e.target.value)
                }
              />

            </div>

            {/* Middle Name */}

            <div className="form-group">

              <label>
                {t("employeesList.form.middleName", { defaultValue: "Middle Name" })}
              </label>

              <input
                type="text"
                placeholder={t("employeesList.form.enterMiddleName", { defaultValue: "Enter middle name" })}
                value={formData.middleName}

                onChange={(e) =>
                  updateFormField("middleName", e.target.value)
                }
              />

            </div>

            {/* Last Name */}

            <div className="form-group">

              <label>
                {t("employeesList.form.lastName", { defaultValue: "Last Name" })} <span className="required-mark">*</span>
              </label>

              <input
                type="text"
                placeholder={t("employeesList.form.enterLastName", { defaultValue: "Enter last name" })}
                required
                aria-required="true"
                aria-invalid={invalidFields.lastName ? "true" : "false"}

                className={invalidFields.lastName ? "field-invalid" : ""}
                value={formData.lastName}

                onChange={(e) =>
                  updateFormField("lastName", e.target.value)
                }
              />

            </div>

            {/* Date of Birth */}

            <div className="form-group">

              <label>
                {t("employeesList.form.dateOfBirth", { defaultValue: "Date of Birth" })}
              </label>

              <DatePicker
                value={formData.dateOfBirth}
                onChange={(value) =>
                  setFormData((previous) => ({
                    ...previous,
                    dateOfBirth: value,
                  }))
                }
              />

            </div>

            {/* Gender */}

            <div className="form-group">

              <label>
                {t("profileEdit.fields.gender", { defaultValue: "Gender" })}
              </label>

              <select
                value={
                  formData.gender
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    gender:
                      e.target.value,
                  })
                }
              >

                <option value="">
                  {t("profileEdit.selectGender", { defaultValue: "Select gender" })}
                </option>

                <option value="Male">
                  {valueLabel("gender", "Male")}
                </option>

                <option value="Female">
                  {valueLabel("gender", "Female")}
                </option>

                <option value="Other">
                  {valueLabel("gender", "Other")}
                </option>

              </select>

            </div>

            {/* Phone */}

            <div className="form-group">

              <label>
                {t("profileEdit.fields.phone", { defaultValue: "Phone" })} <span className="required-mark">*</span>
              </label>

              <div className="phone-input">

                <select
                  value={formData.country}

                  onChange={(e) => {

                    const selectedCountry =
                      countries.find(
                        (country) =>
                          country.name ===
                          e.target.value
                      );

                    setFormData({
                      ...formData,

                      country:
                        selectedCountry.name,

                      phoneCountryCode:
                        selectedCountry.code,
                      phone: formatPhoneInput(
                      formData.phone,
                      selectedCountry.code
                      ),
                    });

                  }}
                >

                  {countries.map(
                    (country) => (

                      <option
                        key={
                          country.name
                        }

                        value={
                          country.name
                        }
                      >
                        {countryOptionLabel(country)}
                      </option>

                    )
                  )}

                </select>

                <input
                  type="tel"
                  placeholder={t("employeesList.form.enterPhone", { defaultValue: "Enter phone number" })}

                  value={
                    formData.phone
                  }
                  className={invalidFields.phone ? "field-invalid" : ""}

                  onChange={(e) =>
                    updateFormField(
                      "phone",
                      formatPhoneInput(
                        e.target.value,
                        formData.phoneCountryCode
                      )
                    )
                  }
                />

              </div>

            </div>

            {/* Email */}

            <div className="form-group">

              <label>
                {t("profileEdit.fields.email", { defaultValue: "Email" })} <span className="required-mark">*</span>
              </label>

              <input
                type="email"
                placeholder={t("employeesList.form.enterEmail", { defaultValue: "Enter email address" })}

                className={invalidFields.email ? "field-invalid" : ""}
                value={formData.email}

                onChange={(e) =>
                  updateFormField("email", e.target.value)
                }
              />

            </div>

            {/* Address */}

            <div className="form-group">

              <label>
                {t("profileEdit.fields.address", { defaultValue: "Address" })}
              </label>

              <textarea
                placeholder={t("employeesList.form.enterAddress", { defaultValue: "Enter address" })}

                value={
                  formData.address
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address:
                      e.target.value,
                  })
                }
              />

            </div>

            {/* ================= JOB DETAILS ================= */}

            <h3>
              {t("employeesList.form.jobDetails", { defaultValue: "Job Details" })}
            </h3>

            {/* Designation */}

            <div className="form-group">

              <label>
                {t("employeesList.table.designation", { defaultValue: "Designation" })} <span className="required-mark">*</span>
              </label>

              <input
                type="text"
                placeholder={t("employeesList.form.enterDesignation", { defaultValue: "Enter designation" })}

                className={invalidFields.designation ? "field-invalid" : ""}
                value={formData.designation}

                onChange={(e) =>
                  updateFormField("designation", e.target.value)
                }
              />

            </div>

            {/* Department */}

            <div className="form-group">

              <label>
                {t("profileEdit.fields.department", { defaultValue: "Department" })} <span className="required-mark">*</span>
              </label>

              <input
                type="text"
                placeholder={t("employeesList.form.enterDepartment", { defaultValue: "Enter department" })}

                className={invalidFields.department ? "field-invalid" : ""}

                onChange={(e) =>
                  updateFormField("department", e.target.value)
                }
              />

            </div>

            {/* Joining Date */}

            <div className="form-group">

              <label>
                {t("profileEdit.sectionFields.joining_date", { defaultValue: "Employment Start Date" })} <span className="required-mark">*</span>
              </label>

              <DatePicker
                value={formData.joiningDate}
                onChange={(value) =>
                  setFormData((previous) => ({
                    ...previous,
                    joiningDate: value,
                  }))
                }
              />

            </div>

            {/* Employment Type */}

            <div className="form-group">

              <label>
                {t("profileEdit.sectionFields.employment_type", { defaultValue: "Employment Type" })} <span className="required-mark">*</span>
              </label>

              <select
                value={
                  formData.employmentType
                }

                required
                aria-required="true"
                aria-invalid={invalidFields.employmentType ? "true" : "false"}

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    employmentType:
                      e.target.value,
                  })
                }
              >

                <option value="">
                  {t("profileEdit.selectEmploymentType", { defaultValue: "Select employment type" })}
                </option>

                <option value="Full Time">
                  {valueLabel("employmentType", "Full Time")}
                </option>

                <option value="Part Time">
                  {valueLabel("employmentType", "Part Time")}
                </option>

                <option value="Contract">
                  {valueLabel("employmentType", "Contract")}
                </option>

                <option value="Intern">
                  {valueLabel("employmentType", "Intern")}
                </option>

              </select>

            </div>

            {/* Status */}

            <div className="form-group">

              <label>
                {t("profileEdit.fields.status", { defaultValue: "Status" })}
              </label>

              <select
                value={
                  formData.status
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    status:
                      e.target.value,
                  })
                }
              >

                <option value="Active">
                  {valueLabel("status", "Active")}
                </option>

                <option value="Inactive">{valueLabel("status", "Inactive")}</option>
                <option value="Resigned">{valueLabel("status", "Resigned")}</option>
                <option value="Retired">{valueLabel("status", "Retired")}</option>
                <option value="Dismissed">{valueLabel("status", "Dismissed")}</option>
                <option value="Terminated">{valueLabel("status", "Terminated")}</option>

              </select>

            </div>

            {/* ================= DETAILS ================= */}

            <h3>{t("employeesList.form.details", { defaultValue: "Details" })}</h3>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.legal_entity", { defaultValue: "Legal Entity" })} <span className="required-mark">*</span></label>
              <input type="text" value={formData.legalEntity} disabled required />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.worker_type", { defaultValue: "Worker Type" })} <span className="required-mark">*</span></label>
              <input type="text" value={valueLabel("workerType", formData.workerType)} disabled required />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.employment_category", { defaultValue: "Employment Category" })} <span className="required-mark">*</span></label>
              <select
                value={formData.employmentCategory}
                className={invalidFields.employmentCategory ? "field-invalid" : ""}
                required
                onChange={(e) => setFormData((previous) => ({ ...previous, employmentCategory: e.target.value }))}
              >
                <option value="">{t("employeesList.form.selectEmploymentCategory", { defaultValue: "Select employment category" })}</option>
                <option value="Regular">{valueLabel("employmentCategory", "Regular")}</option>
                <option value="Temporary">{valueLabel("employmentCategory", "Temporary")}</option>
                <option value="Contractor">{valueLabel("employmentCategory", "Contractor")}</option>
              </select>
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.project_role_id", { defaultValue: "Project Role ID" })} <span className="required-mark">*</span></label>
              <select
                value={formData.projectRoleId}
                className={invalidFields.projectRoleId ? "field-invalid" : ""}
                required
                onChange={(e) => setFormData((previous) => ({ ...previous, projectRoleId: e.target.value }))}
              >
                <option value="">{t("employeesList.form.selectProjectRole", { defaultValue: "Select project role" })}</option>
                <option value="Developer">{valueLabel("projectRole", "Developer")}</option>
                <option value="Manager">{valueLabel("projectRole", "Manager")}</option>
                <option value="HR">{valueLabel("projectRole", "HR")}</option>
                <option value="Support">{valueLabel("projectRole", "Support")}</option>
              </select>
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.employment_end_date", { defaultValue: "Employment End Date" })} <span className="required-mark">*</span></label>
              <select value={formData.employmentEndDate} required onChange={(e) => setFormData((previous) => ({ ...previous, employmentEndDate: e.target.value }))}>
                <option value="Never">{t("employeeProfile.values.never", { defaultValue: "Never" })}</option>
                <option value="Fixed date">{t("employeesList.form.fixedDate", { defaultValue: "Fixed date" })}</option>
              </select>
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.termination_reason", { defaultValue: "Termination Reason" })} <span className="required-mark">*</span></label>
              <input type="text" value={formData.terminationReason} required className={invalidFields.terminationReason ? "field-invalid" : ""} onChange={(e) => updateFormField("terminationReason", e.target.value)} />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.last_date_worked", { defaultValue: "Last Date Worked" })} <span className="required-mark">*</span></label>
              <input type="text" value={formData.lastDateWorked} required className={invalidFields.lastDateWorked ? "field-invalid" : ""} onChange={(e) => updateFormField("lastDateWorked", e.target.value)} />
            </div>

            {/* ================= POSITION DETAILS ================= */}

            <h3>{t("employeeProfile.panels.position", { defaultValue: "Position Details" })}</h3>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.position", { defaultValue: "Position" })} <span className="required-mark">*</span></label>
              <select value={formData.position} required className={invalidFields.position ? "field-invalid" : ""} onChange={(e) => setFormData((previous) => ({ ...previous, position: e.target.value }))}>
                <option value="">{t("employeesList.form.selectPosition", { defaultValue: "Select position" })}</option>
                <option value="Developer">{valueLabel("position", "Developer")}</option>
                <option value="Designer">{valueLabel("position", "Designer")}</option>
                <option value="Accountant">{valueLabel("position", "Accountant")}</option>
                <option value="HR Executive">{valueLabel("position", "HR Executive")}</option>
                <option value="Manager">{valueLabel("position", "Manager")}</option>
              </select>
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.position_title", { defaultValue: "Position Title" })} <span className="required-mark">*</span></label>
              <input type="text" value={formData.positionTitle} required className={invalidFields.positionTitle ? "field-invalid" : ""} onChange={(e) => updateFormField("positionTitle", e.target.value)} />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.assignment_end", { defaultValue: "Assignment End" })} <span className="required-mark">*</span></label>
              <DatePicker value={formData.assignmentEnd} onChange={(value) => setFormData((previous) => ({ ...previous, assignmentEnd: value }))} />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.assignment_start", { defaultValue: "Assignment Start" })} <span className="required-mark">*</span></label>
              <DatePicker value={formData.assignmentStart} onChange={(value) => setFormData((previous) => ({ ...previous, assignmentStart: value }))} />
            </div>

            <div className="form-group">
              <label>{t("employeeProfile.position.makePrimary", { defaultValue: "Make Primary" })} <span className="required-mark">*</span></label>
              <select value={formData.makePrimary ? "Yes" : "No"} required onChange={(e) => setFormData((previous) => ({ ...previous, makePrimary: e.target.value === "Yes" }))}>
                <option value="No">{t("employeeProfile.values.no", { defaultValue: "No" })}</option>
                <option value="Yes">{t("employeeProfile.values.yes", { defaultValue: "Yes" })}</option>
              </select>
            </div>

            {/* ================= BANK DETAILS ================= */}

            <h3>{t("employeesList.form.bankDetails", { defaultValue: "Bank Details" })}</h3>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.account_number", { defaultValue: "Account Number" })}</label>
              <input type="text" inputMode="numeric" placeholder={t("employeesList.form.enterAccountNumber", { defaultValue: "Enter account number" })} value={formData.accountNumber} onChange={(e) => updateFormField("accountNumber", e.target.value)} />
            </div>

            <div className="form-group">
              <label>{t("employeesList.form.reAccountNumber", { defaultValue: "Re-Account Number" })}</label>
              <input type="text" inputMode="numeric" placeholder={t("employeesList.form.reEnterAccountNumber", { defaultValue: "Re-enter account number" })} value={formData.reAccountNumber} onChange={(e) => updateFormField("reAccountNumber", e.target.value)} />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.bank_name", { defaultValue: "Bank Name" })}</label>
              <input type="text" placeholder={t("employeesList.form.enterBankName", { defaultValue: "Enter bank name" })} value={formData.bankName} onChange={(e) => updateFormField("bankName", e.target.value)} />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.branch_name", { defaultValue: "Branch Name" })}</label>
              <input type="text" placeholder={t("employeesList.form.enterBranchName", { defaultValue: "Enter branch name" })} value={formData.branchName} onChange={(e) => updateFormField("branchName", e.target.value)} />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.ifsc_code", { defaultValue: "IFSC Code" })}</label>
              <input type="text" placeholder={t("employeesList.form.enterIfscCode", { defaultValue: "Enter IFSC code" })} value={formData.ifscCode} onChange={(e) => updateFormField("ifscCode", e.target.value.toUpperCase())} />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.sectionFields.account_type", { defaultValue: "Account Type" })}</label>
              <select value={formData.accountType} onChange={(e) => setFormData((previous) => ({ ...previous, accountType: e.target.value }))}>
                <option value="">{t("employeesList.form.selectAccountType", { defaultValue: "Select account type" })}</option>
                <option value="Savings">{valueLabel("accountType", "Savings")}</option>
                <option value="Current">{valueLabel("accountType", "Current")}</option>
              </select>
            </div>

            <div className="form-group">
              <label>{t("employeesList.form.branchAddress", { defaultValue: "Branch Address" })}</label>
              <textarea placeholder={t("employeesList.form.enterBranchAddress", { defaultValue: "Enter branch address" })} value={formData.branchAddress} onChange={(e) => updateFormField("branchAddress", e.target.value)} />
            </div>

            {/* ================= OTHER DETAILS ================= */}

            <h3>
              {t("employeesList.form.otherDetails", { defaultValue: "Other Details" })}
            </h3>

            <div className="form-group">
              <label>{t("profileEdit.fields.passport_no", { defaultValue: "Passport No" })}</label>
              <input type="text" placeholder={t("employeesList.form.enterPassportNumber", { defaultValue: "Enter passport number" })} value={formData.passportNo} onChange={(e) => updateFormField("passportNo", e.target.value)} />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.fields.passport_exp_date", { defaultValue: "Passport Exp Date" })}</label>
              <DatePicker value={formData.passportExpDate} onChange={(value) => setFormData((previous) => ({ ...previous, passportExpDate: value }))} />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.fields.nationality", { defaultValue: "Nationality" })}</label>
              <input type="text" placeholder={t("employeesList.form.enterNationality", { defaultValue: "Enter nationality" })} value={formData.nationality} onChange={(e) => updateFormField("nationality", e.target.value)} />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.fields.religion", { defaultValue: "Religion" })}</label>
              <input type="text" placeholder={t("employeesList.form.enterReligion", { defaultValue: "Enter religion" })} value={formData.religion} onChange={(e) => updateFormField("religion", e.target.value)} />
            </div>

            <div className="form-group">
              <label>{t("profileEdit.fields.marital_status", { defaultValue: "Marital Status" })}</label>
              <select value={formData.maritalStatus} onChange={(e) => setFormData((previous) => ({ ...previous, maritalStatus: e.target.value }))}>
                <option value="">{t("profileEdit.selectMaritalStatus", { defaultValue: "Select marital status" })}</option>
                <option value="Single">{valueLabel("maritalStatus", "Single")}</option>
                <option value="Married">{valueLabel("maritalStatus", "Married")}</option>
                <option value="Divorced">{valueLabel("maritalStatus", "Divorced")}</option>
                <option value="Widowed">{valueLabel("maritalStatus", "Widowed")}</option>
              </select>
            </div>

            <div className="form-group">
              <label>{t("profileEdit.fields.children_count", { defaultValue: "No. of Children" })}</label>
              <input type="number" min="0" placeholder={t("employeesList.form.enterChildrenCount", { defaultValue: "Enter number of children" })} value={formData.childrenCount} onChange={(e) => setFormData((previous) => ({ ...previous, childrenCount: e.target.value }))} />
            </div>

            {/* Emergency Contact */}

            <div className="form-group">

              <label>
                {t("employeesList.form.emergencyContact", { defaultValue: "Emergency Contact" })}
              </label>

              <div className="phone-input">
                <select
                  value={formData.emergencyContactCountry}
                  onChange={(e) => {
                    const selectedCountry = countries.find(
                      (country) => country.name === e.target.value
                    );
                    setFormData((previous) => ({
                      ...previous,
                      emergencyContactCountry: selectedCountry.name,
                      emergencyContactCountryCode: selectedCountry.code,
                      emergencyContact: formatPhoneInput(
                        previous.emergencyContact,
                        selectedCountry.code
                      ),
                    }));
                  }}
                >
                  {countries.map((country) => (
                    <option key={country.name} value={country.name}>
                      {countryOptionLabel(country)}
                    </option>
                  ))}
                </select>

                <input
                  type="tel"
                  placeholder={t("employeesList.form.enterEmergencyContact", { defaultValue: "Enter emergency contact" })}
                  value={formData.emergencyContact}
                  onChange={(e) =>
                    setFormData((previous) => ({
                      ...previous,
                      emergencyContact: formatPhoneInput(
                        e.target.value,
                        previous.emergencyContactCountryCode
                      ),
                    }))
                  }
                />
              </div>

            </div>

            {/* Profile Photo */}

            <div className="form-group">

              <label>
                {t("profileEdit.fields.profile_photo", { defaultValue: "Profile Photo" })}
              </label>

              <input
                type="file"
                accept="image/*"

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    profilePhoto:
                      e.target.files[0],
                  })
                }
              />

              {formData.profilePhoto && (
                <div className="profile-preview">
                  <img 
                    src={
                      typeof formData.profilePhoto === "string"
                      ? formData.profilePhoto
                      : URL.createObjectURL(formData.profilePhoto)
                    }
                    alt={t("employeesList.form.photoPreviewAlt", { defaultValue: "Profile perview" })}
                />
                </div>
             )}

            </div>

            {/* ================= BUTTONS ================= */}

            <div className="form-actions">

              <Button
                variant="secondary"

                onClick={() => {
                  setIsModalOpen(false);
                  setEditingEmployeeId(null);
                  resetForm();
                }}
              >
                {t("profileEdit.cancel", { defaultValue: "Cancel" })}
              </Button>

              <Button
                onClick={
                  editingEmployeeId
                    ? updateEmployee
                    : addEmployee
                }
              >
                {editingEmployeeId
                  ? t("profileEdit.save", { defaultValue: "Save Changes" })
                  : t("hrDashboard.quickActions.addEmployee", { defaultValue: "Add Employee" })}
              </Button>

            </div>

          </div>

        </Modal>

        
      </div>

    </DashboardLayout>
  );
}

export default Employees;
