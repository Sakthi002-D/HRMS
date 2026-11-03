import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import "./ExportMenu.css";

// Export button with the two formats every list offers: Excel and PDF
function ExportMenu({ onExport, disabled = false, className = "" }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const close = (event) => {
            if (event.type === "keydown" ? event.key === "Escape" : !ref.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", close);
        return () => {
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", close);
        };
    }, [open]);

    const choose = (format) => {
        setOpen(false);
        onExport(format);
    };

    return (
        <div className={`export-dd ${className}`} ref={ref}>
            <button type="button" className="export-dd-button" onClick={() => setOpen((value) => !value)} disabled={disabled} aria-haspopup="menu" aria-expanded={open}>
                <Download size={15} aria-hidden="true" />
                {t("employeesList.export.button", { defaultValue: "Export" })}
                <ChevronDown size={14} aria-hidden="true" />
            </button>
            {open && (
                <div className="export-dd-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => choose("excel")}>
                        <FileSpreadsheet size={16} aria-hidden="true" /> {t("export.excel", { defaultValue: "Excel" })}
                    </button>
                    <button type="button" role="menuitem" onClick={() => choose("pdf")}>
                        <FileText size={16} aria-hidden="true" /> {t("export.pdf", { defaultValue: "PDF" })}
                    </button>
                </div>
            )}
        </div>
    );
}

export default ExportMenu;
