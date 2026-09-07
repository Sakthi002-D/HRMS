import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

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

function Employees() {

  const navigate = useNavigate();
  // =========================
  // EMPLOYEES
  // =========================

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

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
    fullName: "",
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

  // =========================
  // RESET FORM
  // =========================
const resetForm = () => {
  setInvalidFields({});
  setFormData({
    employeeId: "",
    fullName: "",
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

 const deleteEmployee = async (id) => {
  const confirmDelete = window.confirm(
    "Are you sure you want to delete this employee?"
  );

  if (!confirmDelete) {
    return;
  }

  try {
    const response = await fetch(
      `${API_URL}/api/employees/${id}`,
      {
        method: "DELETE",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      alert(data.message || "Failed to delete employee");
      return;
    }

    await fetchEmployees();

    alert("Employee deleted successfully!");

  } catch (error) {
    console.error("Error deleting employee:", error);
    alert("Unable to connect to backend");
  }
};

  const exportEmployeesToCSV = () => {
  if (employees.length === 0) {
    alert("No employees to export");
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
  // =========================
  // ADD EMPLOYEE
  // =========================

  

  const addEmployee = async () => {
    const employeeId = formData.employeeId.trim();
    const requiredFields = ["employeeId", "fullName", "designation", "department", "email", "phone"];
    const missingFields = requiredFields.reduce(
      (fields, field) => ({ ...fields, [field]: !formData[field].trim() }),
      {}
    );

    if (Object.values(missingFields).some(Boolean)) {
      setInvalidFields(missingFields);
    }

    if (!employeeId) {
      alert("Please enter Employee ID");
      return;
    }

    if (isEmployeeIdExists(employeeId)) {
      alert("Employee ID already exists!");
      return;
    }

    if (!formData.fullName.trim()) {
      alert("Please enter Full Name");
      return;
    }

    if (!formData.designation.trim()) {
      alert("Please enter Designation");
      return;
    }

    if (!formData.department.trim()) {
      alert("Please enter Department");
      return;
    }

    if (!formData.email.trim()) {
      alert("Please enter Email");
      return;
    }

    if (!isValidEmail(formData.email)) {
      alert("Please enter a valid email address");
      return;
    }

    if (!formData.phone.trim()) {
      alert("Please enter phone number");
      return;
    }

    const phoneDigits = formData.phone.replace(/\D/g, "");

    if (formData.phoneCountryCode === "+91") {
      if (
        phoneDigits.length !== 10 ||
        !/^[6-9]\d{9}$/.test(phoneDigits)
      ) {
        alert("Please enter a valid 10-digit Indian phone number");
        return;
      }
    } else if (
      !isValidPhone(
        formData.phone,
        formData.phoneCountryCode
      )
    ) {
      alert("Please enter a valid phone number");
      return;
    }
const employeeData = {
  employee_id: employeeId,
  name: formData.fullName.trim(),
  date_of_birth: formData.dateOfBirth || null,
  gender: formData.gender || null,
  phone: `${formData.phoneCountryCode} ${formData.phone.trim()}`,
  email: formData.email.trim(),
  address: formData.address || null,
  designation: formData.designation.trim(),
  department: formData.department.trim(),
  joining_date: formData.joiningDate || null,
  employment_type: formData.employmentType || null,
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
};

    try {
      const response = await fetch(
        `${API_URL}/api/employees`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(employeeData),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Backend error:", data);
        alert(data.message || "Failed to add employee");
        return;
      }

      console.log("Employee added successfully:", data);

      // Get the latest data from the database
      await fetchEmployees();

      alert("Employee added successfully!");

      setIsModalOpen(false);
      setEditingEmployeeId(null);
      resetForm();
    } catch (error) {
      console.error("Error adding employee:", error);
      alert("Unable to connect to backend");
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

      fullName: employee.name || "",

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
  const requiredFields = ["employeeId", "fullName", "designation", "department", "email", "phone"];
  const missingFields = requiredFields.reduce(
    (fields, field) => ({ ...fields, [field]: !formData[field].trim() }),
    {}
  );

  if (Object.values(missingFields).some(Boolean)) {
    setInvalidFields(missingFields);
  }

  if (!employeeId) {
    alert("Please enter Employee ID");
    return;
  }

  if (
    isEmployeeIdExists(
      employeeId,
      editingEmployeeId
    )
  ) {
    alert("Employee ID already exists!");
    return;
  }

  if (!formData.fullName.trim()) {
    alert("Please enter Full Name");
    return;
  }

  if (!formData.designation.trim()) {
    alert("Please enter Designation");
    return;
  }

  if (!formData.department.trim()) {
    alert("Please enter Department");
    return;
  }

  if (!formData.email.trim()) {
    alert("Please enter Email");
    return;
  }

  if (!formData.phone.trim()) {
    alert("Please enter Phone Number");
    return;
  }

  // Data to send to backend
  const employeeData = {
  employee_id: employeeId,
  name: formData.fullName,
  date_of_birth: formData.dateOfBirth || null,
  gender: formData.gender || null,
  phone: `${formData.phoneCountryCode} ${formData.phone}`,
  email: formData.email,
  address: formData.address || null,
  designation: formData.designation,
  department: formData.department,
  joining_date: formData.joiningDate || null,
  employment_type: formData.employmentType || null,
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
};
  try {
    const response = await fetch(
      `${API_URL}/api/employees/${editingEmployeeId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(employeeData),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      alert(data.message || "Failed to update employee");
      return;
    }

    // Get the latest data from the database
    await fetchEmployees();

    alert("Employee updated successfully!");

    setEditingEmployeeId(null);
    setIsModalOpen(false);
    resetForm();

  } catch (error) {
    console.error("Error updating employee:", error);
    alert("Unable to connect to backend");
  }
};

  // =========================
  // TABLE COLUMNS
  // =========================

  const columns = [
    {
      key: "id",
      label: "Employee ID",
    },

    {
      key: "name",
      label: "Name",
    },

    {
      key: "designation",
      label: "Designation",
    },

    {
      key: "department",
      label: "Department",
    },

    {
      key: "email",
      label: "Email",
    },

    {
      key: "phone",
      label: "Phone",
    },

    {
      key: "status",
      label: "Status",

      render: (employee) => (
        <span
          className={
            employee.status === "Active"
              ? "status active"
              : "status inactive"
          }
        >
          {employee.status}
        </span>
      ),
    },

    {
      key: "view",
      label: "View",
      render: (employee) => (
        <Button
          variant="secondary"
          onClick={() => viewEmployee(employee)}
        >
          View
        </Button>
      ),
    },

{
  key: "delete",
  label: "Delete",

  render: (employee) => (
    <Button
      variant="danger"
      onClick={() => deleteEmployee(employee.id)}
    >
      Delete
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
            <h1>Employees List</h1>
            <p>
              Manage all company employees
            </p>
          </div>

         <div className="header-actions">
            <button type="button" className={`view-toggle ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")} aria-label="List view">
              <List size={16} />
            </button>
            <button type="button" className={`view-toggle ${viewMode === "grid" ? "active" : ""}`} onClick={() => setViewMode("grid")} aria-label="Grid view">
              <Grid2X2 size={15} />
            </button>
            <Button variant="secondary" onClick={exportEmployeesToCSV}>
              Export <ChevronDown size={14} />
            </Button>
            <Button onClick={openAddEmployee}>⊕ Add Employee</Button>

        </div>

        </div>

        <div className="employee-stats">

  <div className="stat-card">
    <div className="stat-card-content">
      <span>Total Employees</span>
      <strong>{employees.length}</strong>
    </div>
    <Users className="stat-icon total" size={23} />
  </div>

  <div className="stat-card">
    <div className="stat-card-content">
      <span>Active</span>
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
      <span>Inactive</span>
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
      <span>New Joiners</span>
      <strong>{newJoiners}</strong>
    </div>
    <UserPlus className="stat-icon joiners" size={23} />
  </div>

</div>

        {/* ================= TABLE ================= */}

        <div className="employee-list-header">
          <div>
            <p className="employee-list-kicker">DIRECTORY</p>
            <h2>Employee List</h2>
          </div>
          <button
            type="button"
            className={`filter-toggle ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters((visible) => !visible)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal size={16} />
            Filters
            <span className="filter-count">3</span>
          </button>
        </div>

        <div className="employee-table-container">
          {showFilters && (
            <div className="employee-list-filters" aria-label="Employee filters">
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
                Clear filters
              </button>
              <div className="filter-field">
                <span>Date range</span>
                <select value={dateRangeFilter} onChange={(e) => { setDateRangeFilter(e.target.value); setCurrentPage(1); setShowFilters(false); }}>
                  <option value="all">All dates</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                </select>
              </div>
              <div className="filter-field">
                <span>Designation</span>
                <select value={designationFilter} onChange={(e) => { setDesignationFilter(e.target.value); setCurrentPage(1); setShowFilters(false); }}>
                  <option value="All">All designations</option>
                  {designations.map((designation) => <option key={designation} value={designation}>{designation}</option>)}
                </select>
              </div>
            </div>
          )}

          {loading ? (
            <div className="employees-loading" role="status" aria-live="polite">
              <span className="employees-loading-spinner" aria-hidden="true"></span>
              <p>Loading employees...</p>
            </div>
          ) : (
            <>
              <div className="employee-table-controls">
                <div className="table-search">
                  <SearchBar
                    id="employee-search"
                    value={search}
                    onChange={setSearch}
                    placeholder="Search employees"
                  />
                </div>
                <div className="table-controls-spacer" />
                <label htmlFor="employees-per-page">Rows per page</label>
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
                  aria-label="Filter by status"
                >
                  <option value="All">All status</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              {viewMode === "grid" ? (
                <div className="employee-grid">
                  {currentEmployees.map((employee) => (
                    <article className="employee-grid-card" key={employee.id}>
                      <div className="employee-grid-card-top">
                        <div className="employee-avatar">{employee.name?.charAt(0)?.toUpperCase()}</div>
                        <span className={employee.status === "Active" ? "status active" : "status inactive"}>{employee.status}</span>
                      </div>
                      <h3>{employee.name}</h3>
                      <p>{employee.designation || "Employee"}</p>
                      <span>{employee.department || "General"}{employee.phone ? ` · ${employee.phone}` : ""}</span>
                      <Button variant="secondary" onClick={() => viewEmployee(employee)}>View details</Button>
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
                  ← Previous
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
                  Next →
                </button>

              </div>
            </>
          )}

        </div>

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
              ? "Edit Employee"
              : "Add Employee"
          }
        >

          <div className="employee-form">

            {/* ================= PERSONAL DETAILS ================= */}

            <h3>
              Personal Details
            </h3>

            {/* Employee ID */}

            <div className="form-group">

              <label>
                Employee ID <span className="required-mark">*</span>
              </label>

              <input
                type="text"
                placeholder="Enter employee ID"

                className={invalidFields.employeeId ? "field-invalid" : ""}
                value={formData.employeeId}

                onChange={(e) =>
                  updateFormField("employeeId", e.target.value)
                }
              />

            </div>

            {/* Full Name */}

            <div className="form-group">

              <label>
                Full Name <span className="required-mark">*</span>
              </label>

              <input
                type="text"
                placeholder="Enter full name"

                className={invalidFields.fullName ? "field-invalid" : ""}
                value={formData.fullName}

                onChange={(e) =>
                  updateFormField("fullName", e.target.value)
                }
              />

            </div>

            {/* Date of Birth */}

            <div className="form-group">

              <label>
                Date of Birth
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
                Gender
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
                  Select gender
                </option>

                <option value="Male">
                  Male
                </option>

                <option value="Female">
                  Female
                </option>

                <option value="Other">
                  Other
                </option>

              </select>

            </div>

            {/* Phone */}

            <div className="form-group">

              <label>
                Phone <span className="required-mark">*</span>
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
                        {country.name}{" "}
                        ({country.code})
                      </option>

                    )
                  )}

                </select>

                <input
                  type="tel"
                  placeholder="Enter phone number"

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
                Email <span className="required-mark">*</span>
              </label>

              <input
                type="email"
                placeholder="Enter email address"

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
                Address
              </label>

              <textarea
                placeholder="Enter address"

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
              Job Details
            </h3>

            {/* Designation */}

            <div className="form-group">

              <label>
                Designation <span className="required-mark">*</span>
              </label>

              <input
                type="text"
                placeholder="Enter designation"

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
                Department <span className="required-mark">*</span>
              </label>

              <input
                type="text"
                placeholder="Enter department"

                className={invalidFields.department ? "field-invalid" : ""}

                onChange={(e) =>
                  updateFormField("department", e.target.value)
                }
              />

            </div>

            {/* Joining Date */}

            <div className="form-group">

              <label>
                Joining Date
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
                Employment Type
              </label>

              <select
                value={
                  formData.employmentType
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    employmentType:
                      e.target.value,
                  })
                }
              >

                <option value="">
                  Select employment type
                </option>

                <option value="Full Time">
                  Full Time
                </option>

                <option value="Part Time">
                  Part Time
                </option>

                <option value="Contract">
                  Contract
                </option>

                <option value="Intern">
                  Intern
                </option>

              </select>

            </div>

            {/* Status */}

            <div className="form-group">

              <label>
                Status
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
                  Active
                </option>

                <option value="Inactive">
                  Inactive
                </option>

              </select>

            </div>

            {/* ================= OTHER DETAILS ================= */}

            <h3>
              Other Details
            </h3>

            <div className="form-group">
              <label>Passport No</label>
              <input type="text" placeholder="Enter passport number" value={formData.passportNo} onChange={(e) => updateFormField("passportNo", e.target.value)} />
            </div>

            <div className="form-group">
              <label>Passport Exp Date</label>
              <DatePicker value={formData.passportExpDate} onChange={(value) => setFormData((previous) => ({ ...previous, passportExpDate: value }))} />
            </div>

            <div className="form-group">
              <label>Nationality</label>
              <input type="text" placeholder="Enter nationality" value={formData.nationality} onChange={(e) => updateFormField("nationality", e.target.value)} />
            </div>

            <div className="form-group">
              <label>Religion</label>
              <input type="text" placeholder="Enter religion" value={formData.religion} onChange={(e) => updateFormField("religion", e.target.value)} />
            </div>

            <div className="form-group">
              <label>Marital Status</label>
              <select value={formData.maritalStatus} onChange={(e) => setFormData((previous) => ({ ...previous, maritalStatus: e.target.value }))}>
                <option value="">Select marital status</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Divorced">Divorced</option>
                <option value="Widowed">Widowed</option>
              </select>
            </div>

            <div className="form-group">
              <label>No. of Children</label>
              <input type="number" min="0" placeholder="Enter number of children" value={formData.childrenCount} onChange={(e) => setFormData((previous) => ({ ...previous, childrenCount: e.target.value }))} />
            </div>

            {/* Emergency Contact */}

            <div className="form-group">

              <label>
                Emergency Contact
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
                      {country.name} ({country.code})
                    </option>
                  ))}
                </select>

                <input
                  type="tel"
                  placeholder="Enter emergency contact"
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
                Profile Photo
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
                    alt="Profile perview"
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
                Cancel
              </Button>

              <Button
                onClick={
                  editingEmployeeId
                    ? updateEmployee
                    : addEmployee
                }
              >
                {editingEmployeeId
                  ? "Save Changes"
                  : "Add Employee"}
              </Button>

            </div>

          </div>

        </Modal>

        
      </div>

    </DashboardLayout>
  );
}

export default Employees;
