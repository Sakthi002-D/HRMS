import { useEffect, useState } from "react";
import { Bell, ClipboardList, Eye, FileCheck2, FileText, FolderOpen, Hourglass, ReceiptText, RefreshCw, Send, ShieldCheck, Upload } from "lucide-react";
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

function EmployeeDocuments({ employee, onRequest, requestsVersion = 0, unreadNotifications = 0, onOpenNotifications }) {
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

    const onFile = documentItems.filter((item) => documents[item.key]).length;
    const needsUpload = documentItems.filter((item) => item.uploadedBy === "EMPLOYEE" && !documents[item.key]).length;
    const openRequests = Object.values(latestRequests).filter((row) => String(row.status || "").toLowerCase() === "pending").length;

    return <>
        <section className="employee-documents-view edoc">
            <header className="edash-hero">
                <div className="edash-hero-copy">
                    <span className="edash-hero-kicker">{t("employeeDocuments.kicker")}</span>
                    <h1>{t("employeeDocuments.title")}</h1>
                    <p>{t("employeeDocuments.subtitle")}</p>
                    {!loading && (
                        <div className="edash-hero-chips">
                            <span><FolderOpen size={14} aria-hidden="true" />{t("employeeDocuments.onFile", { count: onFile, total: documentItems.length, defaultValue: "{{count}} of {{total}} documents on file" })}</span>
                            <span><Upload size={14} aria-hidden="true" />{t("employeeDocuments.needsUpload", { count: needsUpload, defaultValue: "{{count}} waiting for your upload" })}</span>
                            <span><Hourglass size={14} aria-hidden="true" />{t("employeeDocuments.openRequests", { count: openRequests, defaultValue: "{{count}} requests with HR" })}</span>
                        </div>
                    )}
                </div>
                <div className="edash-hero-side">
                    <button type="button" className="edash-hero-bell" onClick={onOpenNotifications} aria-label={t("employeeNotifications.openNotifications", { defaultValue: "Open notifications" })}>
                        <Bell size={22} />
                        {unreadNotifications > 0 && <span className="edash-hero-bell-count">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
                    </button>
                </div>
            </header>

            <div className="edash-body">
                {/* Documents */}
                <article className="edash-card">
                    <header className="edash-card-head">
                        <div>
                            <h2>{t("employeeDocuments.myDocuments", { defaultValue: "My Documents" })}</h2>
                            <p className="edash-card-sub">{t("employeeDocuments.myDocumentsHint", { defaultValue: "HR adds your contract, offer letter and QID. You upload your visa and passport." })}</p>
                        </div>
                        <span className="edash-card-icon"><FileText size={16} /></span>
                    </header>
                    <div className="edoc-grid">
                        {documentItems.map((item) => {
                            const { key, icon: Icon, uploadedBy } = item;
                            const title = documentTitle(key);
                            const document = documents[key];
                            const isUploading = uploadingType === key;
                            const employeeUploads = uploadedBy === "EMPLOYEE";

                            let statusText = t("employeeDocuments.pendingHrUpload");
                            let statusTone = "pending";
                            if (loading) {
                                statusText = t("employeeDocuments.loading");
                                statusTone = "muted";
                            } else if (document) {
                                const date = formatDocumentDate(document.uploaded_at);
                                statusText = employeeUploads
                                    ? t("employeeDocuments.uploadedOn", { date })
                                    : t("employeeDocuments.addedByHrOn", { date });
                                statusTone = "approved";
                            } else if (employeeUploads) {
                                statusText = t("employeeDocuments.notUploaded");
                                statusTone = "rejected";
                            }

                            return <article className="edoc-tile" key={key}>
                                <div className="edoc-tile-head">
                                    <span className="edoc-icon"><Icon size={20} /></span>
                                    <div>
                                        <h3>{title}</h3>
                                        <p>{t(`employeeDocuments.items.${key}.description`)}</p>
                                    </div>
                                </div>
                                <div className="edoc-tile-foot">
                                    <span className={`edash-pill edash-pill-${statusTone}`}>{statusText}</span>
                                    <div className="edoc-actions">
                                        {document && (
                                            <button type="button" className="edoc-btn" onClick={() => setPreview({ ...document, displayName: title })}>
                                                <Eye size={14} /> {t("employeeDocuments.view")}
                                            </button>
                                        )}
                                        {employeeUploads && !loading && (
                                            <label className={`edoc-btn primary${isUploading ? " disabled" : ""}`}>
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
                    <p className="edash-card-sub">{t("employeeDocuments.fileTypes", { defaultValue: "Accepted files: PDF, JPG or PNG." })}</p>
                </article>

                {/* Requests to HR */}
                <article className="edash-card">
                    <header className="edash-card-head">
                        <div>
                            <h2>{t("employeeDocuments.requestsTitle")}</h2>
                            <p className="edash-card-sub">{t("employeeDocuments.requestsSubtitle")}</p>
                        </div>
                        <span className="edash-card-icon"><Send size={16} /></span>
                    </header>
                    <div className="edoc-grid">
                        {REQUEST_ITEMS.map(({ requestType, labelKey, icon: Icon }) => {
                            const label = t(`employeeDocuments.requests.${labelKey}.title`);
                            const latest = latestRequests[requestType];
                            const tone = String(latest?.status || "").toLowerCase();
                            return (
                                <article className="edoc-tile" key={requestType}>
                                    <div className="edoc-tile-head">
                                        <span className="edoc-icon"><Icon size={20} /></span>
                                        <div>
                                            <h3>{label}</h3>
                                            <p>{t(`employeeDocuments.requests.${labelKey}.description`)}</p>
                                        </div>
                                    </div>
                                    <div className="edoc-tile-foot">
                                        {latest ? (
                                            <span className={`edash-pill edash-pill-${tone}`}>
                                                {t("employeeDocuments.lastRequest", {
                                                    status: t(`employeeDocuments.requestStatus.${tone}`, { defaultValue: latest.status }),
                                                    date: formatDocumentDate(latest.created_at),
                                                })}
                                                {latest.file_name ? t("employeeDocuments.documentReady") : ""}
                                            </span>
                                        ) : <span />}
                                        <div className="edoc-actions">
                                            {latest?.file_name && (
                                                <button
                                                    type="button"
                                                    className="edoc-btn"
                                                    onClick={() => setPreview({ requestId: latest.id, original_file_name: latest.file_name, displayName: label })}
                                                >
                                                    <Eye size={14} /> {t("employeeDocuments.view")}
                                                </button>
                                            )}
                                            <button type="button" className="edoc-btn primary" onClick={() => onRequest?.(requestType)}>
                                                <Send size={14} /> {t("employeeDocuments.request")}
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </article>
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