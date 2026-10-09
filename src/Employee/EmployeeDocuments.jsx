import { useEffect, useState } from "react";
import { ClipboardList, Eye, FileCheck2, FileText, ReceiptText, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "../components/common/dialog/dialogContext";
import { DocumentToast, EmployeeDocumentPreviewModal } from "../components/documents/EmployeeDocumentOverlays";
import { formatDocumentDate, listEmployeeDocuments, uploadEmployeeDocument } from "../components/documents/employeeDocumentApi";
import API_URL from "../config/api";
import "./EmployeeDocuments.css";

// key = document type used by the backend; uploadedBy must match backend/routes/employeeDocuments.js
const documentItems = [
    { key: "employment_contract", icon: FileCheck2, uploadedBy: "HR" },
    { key: "offer_letter", icon: FileText, uploadedBy: "HR" },
    { key: "visa_copy", icon: ShieldCheck, uploadedBy: "EMPLOYEE" },
    { key: "qid_copy", icon: ShieldCheck, uploadedBy: "HR" },
    { key: "passport_copy", icon: FileText, uploadedBy: "EMPLOYEE" },
];

const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

// requestType = what is SAVED for HR (must stay in English).
// labelKey   = translated label shown on the card.
const REQUEST_ITEMS = [
    { requestType: "Salary Certificate", labelKey: "salaryCertificate", icon: ReceiptText },
    { requestType: "NOC Request", labelKey: "nocRequest", icon: ShieldCheck },
    { requestType: "Letter Request", labelKey: "letterRequest", icon: FileText },
    { requestType: "Expense Reimbursement", labelKey: "expenseReimbursement", icon: ClipboardList },
];

function EmployeeDocuments({ employee, onRequest, requestsVersion = 0 }) {
    const { t } = useTranslation();
    const confirm = useConfirm();
    const employeeId = employee?.employee_id;
    const [documents, setDocuments] = useState({});
    const [loading, setLoading] = useState(true);
    const [uploadingType, setUploadingType] = useState("");
    const [toast, setToast] = useState(null);
    const [preview, setPreview] = useState(null);
    const [latestRequests, setLatestRequests] = useState({});

    const documentTitle = (key) => t(`employeeDocuments.items.${key}.title`);

    // Latest request of each type (Salary Certificate, NOC, ...) with its status and attached file
    useEffect(() => {
        if (!employeeId) return undefined;
        let ignore = false;
        fetch(`${API_URL}/api/employee-requests/${encodeURIComponent(employeeId)}`, { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : []))
            .then((rows) => {
                if (ignore) return;
                const latest = {};
                rows.forEach((row) => {
                    if (!latest[row.request_type]) latest[row.request_type] = row;
                });
                setLatestRequests(latest);
            })
            .catch(() => {});
        return () => { ignore = true; };
    }, [employeeId, requestsVersion]);

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
        const title = documentTitle(item.key);
        const existing = documents[item.key];
        if (existing) {
            const replace = await confirm({
                variant: "warning",
                title: t("employeeDocuments.replaceTitle", { title }),
                message: t("employeeDocuments.replaceMessage", { current: existing.original_file_name, next: file.name }),
                cancelText: t("employeeDocuments.keepCurrent"),
                confirmText: t("employeeDocuments.replace"),
            });
            if (!replace) return;
        }
        try {
            setUploadingType(item.key);
            const saved = await uploadEmployeeDocument(employeeId, item.key, file);
            setDocuments((current) => ({ ...current, [item.key]: saved }));
            setToast({ type: "success", message: t("employeeDocuments.uploadedSuccess", { title }) });
        } catch (error) {
            setToast({ type: "error", message: error.message });
        } finally {
            setUploadingType("");
        }
    };

    return <>
        <section className="employee-documents-view">
            <div className="employee-documents-heading">
                <div>
                    <span className="employee-documents-kicker">{t("employeeDocuments.kicker")}</span>
                    <h2>{t("employeeDocuments.title")}</h2>
                    <p>{t("employeeDocuments.subtitle")}</p>
                </div>
                <FileText size={34} />
            </div>

            {/* Documents */}
            <div className="employee-document-grid">
                {documentItems.map((item) => {
                    const { key, icon: Icon, uploadedBy } = item;
                    const title = documentTitle(key);
                    const document = documents[key];
                    const isUploading = uploadingType === key;
                    const employeeUploads = uploadedBy === "EMPLOYEE";

                    let statusText = t("employeeDocuments.pendingHrUpload");
                    let statusTone = "";
                    if (loading) {
                        statusText = t("employeeDocuments.loading");
                        statusTone = "muted";
                    } else if (document) {
                        const date = formatDocumentDate(document.uploaded_at);
                        statusText = employeeUploads
                            ? t("employeeDocuments.uploadedOn", { date })
                            : t("employeeDocuments.addedByHrOn", { date });
                        statusTone = "uploaded";
                    } else if (employeeUploads) {
                        statusText = t("employeeDocuments.notUploaded");
                        statusTone = "muted";
                    }

                    return <article className="employee-document-card" key={key}>
                        <div className="employee-document-icon"><Icon size={22} /></div>
                        <div><h3>{title}</h3><p>{t(`employeeDocuments.items.${key}.description`)}</p></div>
                        <div className="employee-document-footer">
                            <span className={`employee-document-status ${statusTone}`}>{statusText}</span>
                            <div className="employee-document-actions">
                                {document && (
                                    <button type="button" className="employee-document-btn secondary" onClick={() => setPreview({ ...document, displayName: title })}>
                                        <Eye size={14} /> {t("employeeDocuments.view")}
                                    </button>
                                )}
                                {employeeUploads && !loading && (
                                    <label className={`employee-document-btn primary${isUploading ? " disabled" : ""}`}>
                                        {document ? <RefreshCw size={14} /> : <Upload size={14} />}
                                        {isUploading
                                            ? t("employeeDocuments.uploading")
                                            : document ? t("employeeDocuments.replace") : t("employeeDocuments.upload")}
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
            </div>

            {/* Requests to HR */}
            <div className="employee-documents-subheading">
                <h3>{t("employeeDocuments.requestsTitle")}</h3>
                <p>{t("employeeDocuments.requestsSubtitle")}</p>
            </div>
            <div className="employee-document-grid">
                {REQUEST_ITEMS.map(({ requestType, labelKey, icon: Icon }) => {
                    const label = t(`employeeDocuments.requests.${labelKey}.title`);
                    const latest = latestRequests[requestType];
                    const tone = String(latest?.status || "").toLowerCase();
                    return (
                        <article className="employee-document-card request" key={requestType}>
                            <div className="employee-document-icon"><Icon size={22} /></div>
                            <div>
                                <h3>{label}</h3>
                                <p>{t(`employeeDocuments.requests.${labelKey}.description`)}</p>
                                {latest && (
                                    <span className={`employee-request-latest ${tone}`}>
                                        {t("employeeDocuments.lastRequest", {
                                            status: t(`employeeDocuments.requestStatus.${tone}`, { defaultValue: latest.status }),
                                            date: formatDocumentDate(latest.created_at),
                                        })}
                                        {latest.file_name ? t("employeeDocuments.documentReady") : ""}
                                    </span>
                                )}
                            </div>
                            <div className="employee-request-card-actions">
                                {latest?.file_name && (
                                    <button
                                        type="button"
                                        className="employee-document-btn secondary"
                                        onClick={() => setPreview({ requestId: latest.id, original_file_name: latest.file_name, displayName: label })}
                                    >
                                        <Eye size={14} /> {t("employeeDocuments.view")}
                                    </button>
                                )}
                                <button type="button" onClick={() => onRequest?.(requestType)}>{t("employeeDocuments.request")}</button>
                            </div>
                        </article>
                    );
                })}
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