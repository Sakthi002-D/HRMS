import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import useScrollLock from "../common/dialog/useScrollLock";
import {
    downloadEmployeeDocument,
    downloadEmployeeRequestFile,
    fetchEmployeeDocumentFile,
    fetchEmployeeRequestFile,
} from "./employeeDocumentApi";
import "./employeeDocumentOverlays.css";

export function DocumentToast({ toast, onClose }) {
    useEffect(() => {
        if (!toast) return undefined;
        const timer = window.setTimeout(onClose, 4500);
        return () => window.clearTimeout(timer);
    }, [toast, onClose]);

    if (!toast) return null;
    return createPortal(
        <div className={`employee-document-toast ${toast.type}`} role={toast.type === "error" ? "alert" : "status"} aria-live="polite">
            <span>{toast.message}</span>
            <button type="button" aria-label="Dismiss notification" onClick={onClose}>×</button>
        </div>,
        window.document.body
    );
}

// Preview pop-up for an employee document (document.doc_type)
// or for a file attached to an employee request (document.requestId).
export function EmployeeDocumentPreviewModal({ employeeId, document, isHR = false, onClose, onError }) {
    const [preview, setPreview] = useState({ key: "", url: "", mime: "", loading: true, error: "" });
    useScrollLock(Boolean(document));

    const requestId = document?.requestId;
    const documentType = document?.doc_type;
    // A unique name for "which file is open", so a new file always reloads
    const fileKey = requestId ? `request-${requestId}` : documentType ? `document-${documentType}` : "";

    useEffect(() => {
        if (!fileKey) return undefined;
        let objectUrl = "";
        let ignore = false;
        const loadFile = requestId
            ? fetchEmployeeRequestFile(requestId, isHR)
            : fetchEmployeeDocumentFile(employeeId, { doc_type: documentType }, isHR);
        loadFile
            .then((blob) => {
                objectUrl = URL.createObjectURL(blob);
                if (!ignore) setPreview({ key: fileKey, url: objectUrl, mime: blob.type, loading: false, error: "" });
            })
            .catch((error) => {
                if (!ignore) setPreview({ key: fileKey, url: "", mime: "", loading: false, error: error.message });
            });
        return () => {
            ignore = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [employeeId, fileKey, requestId, documentType, isHR]);

    if (!document) return null;
    const currentPreview = preview.key === fileKey ? preview : { url: "", mime: "", loading: true, error: "" };
    // The file's own type (sent by the server), or the type from the list as a fallback
    const mimeType = currentPreview.mime || document.mime_type || "";

    const handleDownload = async () => {
        try {
            if (requestId) await downloadEmployeeRequestFile(requestId, document.original_file_name, isHR);
            else await downloadEmployeeDocument(employeeId, document, isHR);
        } catch (error) {
            onError?.(error.message);
        }
    };

    const content = (
        <div className="employee-document-preview-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <section className="employee-document-preview" role="dialog" aria-modal="true" aria-labelledby="employee-document-preview-title">
                <header>
                    <div>
                        <h2 id="employee-document-preview-title">{document.displayName}</h2>
                        <p>{document.original_file_name}</p>
                    </div>
                    <div className="employee-document-preview-actions">
                        <button type="button" onClick={handleDownload}><Download size={16} />Download</button>
                        <button type="button" className="close" onClick={onClose}><X size={17} />Close</button>
                    </div>
                </header>
                <div className="employee-document-preview-content">
                    {currentPreview.loading && <p role="status">Loading preview...</p>}
                    {currentPreview.error && <p className="error" role="alert">{currentPreview.error}</p>}
                    {currentPreview.url && mimeType === "application/pdf" && (
                        <iframe src={currentPreview.url} title={`${document.displayName} preview`} />
                    )}
                    {currentPreview.url && mimeType.startsWith("image/") && (
                        <img src={currentPreview.url} alt={`${document.displayName}: ${document.original_file_name}`} />
                    )}
                </div>
            </section>
        </div>
    );

    return createPortal(content, window.document.body);
}