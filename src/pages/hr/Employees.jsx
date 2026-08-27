import { useState, useEffect } from "react";
import "./Employees.css";
import DashboardLayout from "../../components/layout/DashboardLayout";
import SearchBar from "../../components/layout/common/SearchBar";
import Button from "../../components/layout/common/Button";
import Table from "../../components/layout/common/Table";
import Modal from "../../components/layout/common/Modal";

function Employees() {
  // =========================
  // EMPLOYEES
  // =========================

  const [employees, setEmployees] = useState([]);

const fetchEmployees = async () => {
  try {
    const response = await fetch(
      "https://hrms-cuoq.onrender.com/api/employees"
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
  phone: employee.phone,
  status: employee.status,
  joiningDate: employee.joining_date,

  // Additional employee details
  dateOfBirth: employee.date_of_birth,
  gender: employee.gender,
  country: employee.country,
  address: employee.address,
  employmentType: employee.employment_type,
  emergencyContact: employee.emergency_contact,
  profilePhoto: employee.profile_photo,
}));

    setEmployees(formattedEmployees);
  } catch (error) {
    console.error("Error fetching employees:", error);
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


  const [currentPage, setCurrentPage] = useState(1);

  const employeesPerPage = 5;
  // =========================
  // MODAL
  // =========================

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [viewEmployeeData, setViewEmployeeData] = useState(null);

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
    profilePhoto: null,
  });

  // =========================
  // COUNTRIES
  // =========================

  const countries = [
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
      `https://hrms-cuoq.onrender.com/api/employees/${id}`,
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
  emergency_contact: formData.emergencyContact || null,
};

    try {
      const response = await fetch(
        "https://hrms-cuoq.onrender.com/api/employees",
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
   setViewEmployeeData(employee);
  };


  const editEmployee = (employee) => {
    setEditingEmployeeId(employee.id);

    let phoneNumber = employee.phone || "";

    let countryCode = "+91";
    let country = "India";

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

      phone:
        phoneNumber,

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

      emergencyContact:
        employee.emergencyContact || "",

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
  emergency_contact: formData.emergencyContact || null,
};
  try {
    const response = await fetch(
      `https://hrms-cuoq.onrender.com/api/employees/${editingEmployeeId}`,
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
  key: "edit",
  label: "Edit",

  render: (employee) => (
    <Button
      variant="secondary"
      onClick={() => editEmployee(employee)}
    >
      Edit
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
const filteredEmployees =
  employees.filter((employee) => {

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

    return matchesSearch && matchesStatus;
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

  // =========================
  // RETURN
  // =========================

  return (
    <DashboardLayout>

      <div className="employees-page">

        {/* ================= HEADER ================= */}

        <div className="employees-header">

          <div>
            <h1>Employees</h1>

            <p>
              Manage all company employees
            </p>
          </div>

         <div className="header-actions">

        <Button
          variant="secondary"
          onClick={exportEmployeesToCSV}
          >
            Export CSV
        </Button>

        <Button
        onClick={openAddEmployee}
        >
          + Add Employee
        </Button>

        </div>

        </div>

        <div className="employee-stats">

  <div className="stat-card">
    <span>Total Employees</span>
    <strong>{employees.length}</strong>
  </div>

  <div className="stat-card">
    <span>Active Employees</span>
    <strong>
      {employees.filter(
        (employee) => employee.status === "Active"
      ).length}
    </strong>
  </div>

  <div className="stat-card">
    <span>Inactive Employees</span>
    <strong>
      {employees.filter(
        (employee) => employee.status === "Inactive"
      ).length}
    </strong>
  </div>

</div>

        {/* ================= SEARCH ================= */}

        <div className="employee-tools">

          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search employee..."
          />

      <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
         <option value="All">All Status</option>
         <option value="Active">Active</option>
         <option value="Inactive">Inactive</option>
       </select>

    </div>

        {/* ================= TABLE ================= */}

        <div className="employee-table-container">

          <Table
            columns={columns}
            data={currentEmployees}
          />
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

        </div>

        {/* ================= MODAL ================= */}

        <Modal
          isOpen={isModalOpen}
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
                Employee ID
              </label>

              <input
                type="text"
                placeholder="Enter employee ID"

                value={
                  formData.employeeId
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    employeeId:
                      e.target.value,
                  })
                }
              />

            </div>

            {/* Full Name */}

            <div className="form-group">

              <label>
                Full Name
              </label>

              <input
                type="text"
                placeholder="Enter full name"

                value={
                  formData.fullName
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    fullName:
                      e.target.value,
                  })
                }
              />

            </div>

            {/* Date of Birth */}

            <div className="form-group">

              <label>
                Date of Birth
              </label>

              <input
                type="date"

                value={
                  formData.dateOfBirth
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    dateOfBirth:
                      e.target.value,
                  })
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
                Phone
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

                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      phone:
                        e.target.value,
                    })
                  }
                />

              </div>

            </div>

            {/* Email */}

            <div className="form-group">

              <label>
                Email
              </label>

              <input
                type="email"
                placeholder="Enter email address"

                value={
                  formData.email
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    email:
                      e.target.value,
                  })
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
                Designation
              </label>

              <input
                type="text"
                placeholder="Enter designation"

                value={
                  formData.designation
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    designation:
                      e.target.value,
                  })
                }
              />

            </div>

            {/* Department */}

            <div className="form-group">

              <label>
                Department
              </label>

              <input
                type="text"
                placeholder="Enter department"

                value={
                  formData.department
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    department:
                      e.target.value,
                  })
                }
              />

            </div>

            {/* Joining Date */}

            <div className="form-group">

              <label>
                Joining Date
              </label>

              <input
                type="date"

                value={
                  formData.joiningDate
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    joiningDate:
                      e.target.value,
                  })
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

            {/* Emergency Contact */}

            <div className="form-group">

              <label>
                Emergency Contact
              </label>

              <input
                type="tel"
                placeholder="Enter emergency contact"

                value={
                  formData.emergencyContact
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    emergencyContact:
                      e.target.value,
                  })
                }
              />

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

        {viewEmployeeData && (
  <Modal
    isOpen={true}
    onClose={() => setViewEmployeeData(null)}
    title="Employee Details"
  >

   <div className="employee-profile">

  {/* Profile Header */}
  <div className="employee-profile-header">

    <div className="employee-profile-photo">
      {viewEmployeeData.profilePhoto ? (
        <img
          src={viewEmployeeData.profilePhoto}
          alt={viewEmployeeData.name}
        />
      ) : (
        <div className="profile-placeholder">
          {viewEmployeeData.name?.charAt(0).toUpperCase()}
        </div>
      )}
    </div>

    <div className="employee-profile-title">
      <h2>{viewEmployeeData.name}</h2>

      <p>
        {viewEmployeeData.designation}
      </p>

      <span
        className={
          viewEmployeeData.status === "Active"
            ? "status active"
            : "status inactive"
        }
      >
        {viewEmployeeData.status}
      </span>
    </div>

  </div>

  {/* Personal Details */}
  <div className="profile-section">

    <h3>Personal Details</h3>

    <div className="profile-grid">

      <div>
        <span>Employee ID</span>
        <strong>{viewEmployeeData.id}</strong>
      </div>

      <div>
        <span>Date of Birth</span>
        <strong>
          {viewEmployeeData.dateOfBirth || "-"}
        </strong>
      </div>

      <div>
        <span>Gender</span>
        <strong>
          {viewEmployeeData.gender || "-"}
        </strong>
      </div>

      <div>
        <span>Phone</span>
        <strong>
          {viewEmployeeData.phone || "-"}
        </strong>
      </div>

      <div>
        <span>Email</span>
        <strong>
          {viewEmployeeData.email || "-"}
        </strong>
      </div>

      <div>
        <span>Address</span>
        <strong>
          {viewEmployeeData.address || "-"}
        </strong>
      </div>

    </div>

  </div>

  {/* Job Details */}
  <div className="profile-section">

    <h3>Job Details</h3>

    <div className="profile-grid">

      <div>
        <span>Designation</span>
        <strong>
          {viewEmployeeData.designation || "-"}
        </strong>
      </div>

      <div>
        <span>Department</span>
        <strong>
          {viewEmployeeData.department || "-"}
        </strong>
      </div>

      <div>
        <span>Joining Date</span>
        <strong>
          {viewEmployeeData.joiningDate || "-"}
        </strong>
      </div>

      <div>
        <span>Employment Type</span>
        <strong>
          {viewEmployeeData.employmentType || "-"}
        </strong>
      </div>

    </div>

  </div>

  {/* Other Details */}
  <div className="profile-section">

    <h3>Other Details</h3>

    <div className="profile-grid">

      <div>
        <span>Emergency Contact</span>
        <strong>
          {viewEmployeeData.emergencyContact || "-"}
        </strong>
      </div>

    </div>

  </div>

</div>
  </Modal>
)}

      </div>

    </DashboardLayout>
  );
}

export default Employees;
