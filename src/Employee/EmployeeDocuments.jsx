import { useEffect, useState } from "react";
import { Eye, FileCheck2, FileText, Mail, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { useConfirm } from "../components/common/dialog/dialogContext";
import { DocumentToast, EmployeeDocumentPreviewModal } from "../components/documents/EmployeeDocumentOverlays";
import { formatDocumentDate, listEmployeeDocuments, uploadEmployeeDocument } from "../components/documents/employeeDocumentApi";
import "./EmployeeDocuments.css";

// uploadedBy must match DOCUMENT_TYPES in backend/routes/employeeDocuments.js
const documentItems = [
    { key: "employment_contract", title: "Employment Contract", description: "Your signed employment agreement", icon: FileCheck2, uploadedBy: "HR" },
    { key: "offer_letter", title: "Offer Letter", description: "Your official offer letter", icon: FileText, uploadedBy: "HR" },
    { key: "visa_copy", title: "Visa Copy", description: "Your employee visa document", icon: ShieldCheck, uploadedBy: "EMPLOYEE" },
    { key: "qid_copy", title: "QID Copy", description: "Your Qatar ID document", icon: ShieldCheck, uploadedBy: "HR" },
    { key: "passport_copy", title: "Passport Copy", description: "Your passport document", icon: FileText, uploadedBy: "EMPLOYEE" },
];

const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

function EmployeeDocuments({ employee }) {
    const confirm = useConfirm();
    const employeeId = employee?.employee_id;
    const [documents, setDocuments] = useState({});
    const [loading, setLoading] = useState(true);
    const [uploadingType, setUploadingType] = useState("");
    const [toast, setToast] = useState(null);
    const [preview, setPreview] = useState(null);

    // Load the employee's saved documents
    useEffect(() => {
        if (!employeeId) return undefined;
        let ignore = false;
        listEmployeeDocuments(employeeId)
            .then((rows) => {
                if (!ignore) setDocuments(Object.fromEntries(rows.map((row) => [row.doc_type, row])));
            })
            .catch((error) => {
                if (!ignore) setToast({ type: "error", message: error.message });
            })
            .finally(() => {
                if (!ignore) setLoading(false);
            });
        return () => { ignore = true; };
    }, [employeeId]);

    // Upload (or replace after confirming) a Visa / Passport copy
    const handleFile = async (item, file) => {
        if (!file) return;
        const existing = documents[item.key];
        if (existing) {
            const replace = await confirm({
                variant: "warning",
                title: `Replace ${item.title}?`,
                message: `Your current file "${existing.original_file_name}" will be replaced with "${file.name}".`,
                cancelText: "Keep current",
                confirmText: "Replace",
            });
            if (!replace) return;
        }
        try {
            setUploadingType(item.key);
            const saved = await uploadEmployeeDocument(employeeId, item.key, file);
            setDocuments((current) => ({ ...current, [item.key]: saved }));
            setToast({ type: "success", message: `${item.title} uploaded successfully` });
        } catch (error) {
            setToast({ type: "error", message: error.message });
        } finally {
            setUploadingType("");
        }
    };

    const requestSalaryCertificate = () => {
        const subject = encodeURIComponent(`Salary Certificate Request - ${employee.employee_id}`);
        const body = encodeURIComponent(`Hello HR,\n\nI would like to request a salary certificate.\n\nEmployee ID: ${employee.employee_id}\nEmployee Name: ${employee.name}\n\nThank you.`);
        window.location.href = `mailto:${employee.hr_email || "hr@company.com"}?subject=${subject}&body=${body}`;
    };

    return <>
        <section className="employee-documents-view">
            <div className="employee-documents-heading"><div><span className="employee-documents-kicker">Employee records</span><h2>Documents</h2><p>Access your important employment documents</p></div><FileText size={34} /></div>
            <div className="employee-document-grid">
                {documentItems.map((item) => {
                    const { key, title, description, icon: Icon, uploadedBy } = item;
                    const document = documents[key];
                    const isUploading = uploadingType === key;
                    const employeeUploads = uploadedBy === "EMPLOYEE";

                    let statusText = "Pending HR upload";
                    let statusTone = "";
                    if (loading) {
                        statusText = "Loading...";
                        statusTone = "muted";
                    } else if (document) {
                        statusText = `${employeeUploads ? "Uploaded" : "Added by HR"} on ${formatDocumentDate(document.uploaded_at)}`;
                        statusTone = "uploaded";
                    } else if (employeeUploads) {
                        statusText = "Not uploaded yet";
                        statusTone = "muted";
                    }

                    return <article className="employee-document-card" key={key}>
                        <div className="employee-document-icon"><Icon size={22} /></div>
                        <div><h3>{title}</h3><p>{description}</p></div>
                        <div className="employee-document-footer">
                            <span className={`employee-document-status ${statusTone}`}>{statusText}</span>
                            <div className="employee-document-actions">
                                {document && (
                                    <button type="button" className="employee-document-btn secondary" onClick={() => setPreview({ ...document, displayName: title })}>
                                        <Eye size={14} /> View
                                    </button>
                                )}
                                {employeeUploads && !loading && (
                                    <label className={`employee-document-btn primary${isUploading ? " disabled" : ""}`}>
                                        {document ? <RefreshCw size={14} /> : <Upload size={14} />}
                                        {isUploading ? "Uploading..." : document ? "Replace" : "Upload"}
                                        <input
                                            type="file"
                                            accept={FILE_ACCEPT}
                                            hidden
                                            disabled={isUploading}
                                            onChange={(event) => {
                                                const file = event.target.files?.[0];
                                                event.target.value = "";
                                                handleFile(item, file);
                                            }}
                                        />
                                    </label>
                                )}
                            </div>
                        </div>
                    </article>;
                })}
                <article className="employee-document-card request"><div className="employee-document-icon"><Mail size={22} /></div><div><h3>Salary Certificate Request</h3><p>Request an official salary certificate from HR</p></div><button type="button" onClick={requestSalaryCertificate}>Request</button></article>
            </div>
        </section>

        <DocumentToast toast={toast} onClose={() => setToast(null)} />
        <EmployeeDocumentPreviewModal
            employeeId={employeeId}
            document={preview}
            onClose={() => setPreview(null)}
            onError={(message) => setToast({ type: "error", message })}
        />
    </>;
}

export default EmployeeDocuments;