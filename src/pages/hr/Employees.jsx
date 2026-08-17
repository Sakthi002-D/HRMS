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

  const [employees, setEmployees] = useState(() => {
    const savedEmployees = localStorage.getItem("employees");

    if (savedEmployees) {
      return JSON.parse(savedEmployees);
    }

    return [
      {
        id: "EMP001",
        name: "Sakthivel",
        designation: "Web Developer",
        department: "IT",
        email: "sakthivel@company.com",
        phone: "+91 1234567890",
        status: "Active",
      },

      {
        id: "EMP002",
        name: "Sundhar",
        designation: "Web Developer",
        department: "IT",
        email: "sundhar@company.com",
        phone: "+91 1234567890",
        status: "Inactive",
      },

      {
        id: "EMP003",
        name: "John Doe",
        designation: "Web Developer",
        department: "IT",
        email: "john.doe@company.com",
        phone: "+91 1234567890",
        status: "Active",
      },
    ];
  });

  // =========================
  // SAVE TO LOCAL STORAGE
  // =========================

  useEffect(() => {
    localStorage.setItem(
      "employees",
      JSON.stringify(employees)
    );
  }, [employees]);

  // =========================
  // SEARCH
  // =========================

  const [search, setSearch] = useState("");

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

  const [formData, setFormData] = useState({
    employeeId: "",
    fullName: "",
    dateOfBirth: "",
    gender: "",

    country: "India",
    countryCode: "+91",

    phone: "",
    email: "",
    address: "",

    designation: "",
    department: "",
    joiningDate: "",
    employmentType: "",
    salary: "",

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

      country: "India",
      countryCode: "+91",

      phone: "",
      email: "",
      address: "",

      designation: "",
      department: "",
      joiningDate: "",
      employmentType: "",
      salary: "",

      status: "Active",

      emergencyContact: "",
      profilePhoto: null,
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

  const deleteEmployee = (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this employee?"
    );

    if (confirmDelete) {
      setEmployees((prevEmployees) =>
        prevEmployees.filter(
          (employee) => employee.id !== id
        )
      );
    }
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

  // =========================
  // ADD EMPLOYEE
  // =========================

  const addEmployee = () => {
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

    if (!formData.phone.trim()) {
      alert("Please enter Phone Number");
      return;
    }

    const newEmployee = {
      id: employeeId,
      name: formData.fullName,
      designation: formData.designation,
      department: formData.department,
      email: formData.email,
      phone: `${formData.countryCode} ${formData.phone}`,
      status: formData.status,

      // Extra details
      dateOfBirth: formData.dateOfBirth,
      gender: formData.gender,
      country: formData.country,
      countryCode: formData.countryCode,
      address: formData.address,
      joiningDate: formData.joiningDate,
      employmentType: formData.employmentType,
      salary: formData.salary,
      emergencyContact: formData.emergencyContact,
      profilePhoto: formData.profilePhoto,
    };

    setEmployees((prevEmployees) => [
      ...prevEmployees,
      newEmployee,
    ]);

    alert("Employee added successfully!");

    setIsModalOpen(false);

    setEditingEmployeeId(null);

    resetForm();
  };

  // =========================
  // EDIT EMPLOYEE
  // =========================

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

      countryCode:
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

      salary:
        employee.salary || "",

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

  const updateEmployee = () => {
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

    setEmployees((prevEmployees) =>
      prevEmployees.map((employee) =>
        employee.id === editingEmployeeId
          ? {
              ...employee,

              id: employeeId,

              name: formData.fullName,

              designation:
                formData.designation,

              department:
                formData.department,

              email:
                formData.email,

              phone:
                `${formData.countryCode} ${formData.phone}`,

              status:
                formData.status,

              dateOfBirth:
                formData.dateOfBirth,

              gender:
                formData.gender,

              country:
                formData.country,

              countryCode:
                formData.countryCode,

              address:
                formData.address,

              joiningDate:
                formData.joiningDate,

              employmentType:
                formData.employmentType,

              salary:
                formData.salary,

              emergencyContact:
                formData.emergencyContact,

              profilePhoto:
                formData.profilePhoto,
            }
          : employee
      )
    );

    alert("Employee updated successfully!");

    setEditingEmployeeId(null);

    setIsModalOpen(false);

    resetForm();
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
      key: "action",
      label: "Action",

      render: (employee) => (
        <>
          <Button
            variant="secondary"
            onClick={() =>
              editEmployee(employee)
            }
          >
            Edit
          </Button>

          <Button
            variant="danger"
            onClick={() =>
              deleteEmployee(employee.id)
            }
          >
            Delete
          </Button>
        </>
      ),
    },
  ];

  // =========================
  // SEARCH FILTER
  // =========================

  const filteredEmployees =
    employees.filter(
      (employee) =>
        employee.name
          .toLowerCase()
          .includes(
            search.toLowerCase()
          ) ||

        employee.id
          .toLowerCase()
          .includes(
            search.toLowerCase()
          ) ||

        employee.department
          .toLowerCase()
          .includes(
            search.toLowerCase()
          )
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

          <Button
            onClick={openAddEmployee}
          >
            + Add Employee
          </Button>

        </div>

        {/* ================= SEARCH ================= */}

        <div className="employee-tools">

          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search employee..."
          />

        </div>

        {/* ================= TABLE ================= */}

        <div className="employee-table-container">

          <Table
            columns={columns}
            data={filteredEmployees}
          />

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
                  value={
                    formData.country
                  }

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

                      countryCode:
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

            {/* Salary */}

            <div className="form-group">

              <label>
                Salary
              </label>

              <input
                type="number"
                placeholder="Enter salary"

                value={
                  formData.salary
                }

                onChange={(e) =>
                  setFormData({
                    ...formData,
                    salary:
                      e.target.value,
                  })
                }
              />

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