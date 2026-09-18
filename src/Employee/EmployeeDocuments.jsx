import { FileCheck2, FileText, Mail, ShieldCheck } from "lucide-react";
import "./EmployeeDocuments.css";

const documentItems = [
    { key: "employment_contract_url", title: "Employment Contract", description: "Your signed employment agreement", icon: FileCheck2 },
    { key: "offer_letter_url", title: "Offer Letter", description: "Your official offer letter", icon: FileText },
    { key: "visa_copy_url", title: "Visa Copy", description: "Your employee visa document", icon: ShieldCheck },
    { key: "qid_copy_url", title: "QID Copy", description: "Your Qatar ID document", icon: ShieldCheck },
    { key: "passport_copy_url", title: "Passport Copy", description: "Your passport document", icon: FileText },
];

function EmployeeDocuments({ employee }) {
    const requestSalaryCertificate = () => {
        const subject = encodeURIComponent(`Salary Certificate Request - ${employee.employee_id}`);
        const body = encodeURIComponent(`Hello HR,\n\nI would like to request a salary certificate.\n\nEmployee ID: ${employee.employee_id}\nEmployee Name: ${employee.name}\n\nThank you.`);
        window.location.href = `mailto:${employee.hr_email || "hr@company.com"}?subject=${subject}&body=${body}`;
    };

    return <section className="employee-documents-view">
        <div className="employee-documents-heading"><div><span className="employee-documents-kicker">Employee records</span><h2>Documents</h2><p>Access your important employment documents</p></div><FileText size={34} /></div>
        <div className="employee-document-grid">{documentItems.map(({ key, title, description, icon: Icon }) => <article className="employee-document-card" key={title}><div className="employee-document-icon"><Icon size={22} /></div><div><h3>{title}</h3><p>{description}</p></div>{employee[key] ? <a className="employee-document-view-link" href={employee[key]} target="_blank" rel="noreferrer">View document</a> : <span className="employee-document-status">Pending HR upload</span>}</article>)}<article className="employee-document-card request"><div className="employee-document-icon"><Mail size={22} /></div><div><h3>Salary Certificate Request</h3><p>Request an official salary certificate from HR</p></div><button type="button" onClick={requestSalaryCertificate}>Request</button></article></div>
    </section>;
}

export default EmployeeDocuments;
