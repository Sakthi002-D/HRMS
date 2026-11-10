// Small pill next to an employee's name (Employees list, Employee details) once HR has accepted
// their resignation: "Serving notice", "Exit clearance", ... The employee status itself stays Active.
import { useTranslation } from "react-i18next";
import "./resignation.css";

const STAGES = {
    Accepted: ["servingNotice", "Serving notice"],
    "Serving Notice": ["servingNotice", "Serving notice"],
    "Exit Clearance": ["exitClearance", "Exit clearance"],
    "Final Settlement": ["finalSettlement", "Final settlement"],
    "Exit Formalities": ["exitFormalities", "Exit formalities"],
};

function ResignationStagePill({ status }) {
    const { t } = useTranslation();
    const stage = STAGES[status];
    if (!stage) return null;
    return (
        <span className={`resignation-stage-pill${stage[0] === "servingNotice" ? " notice" : ""}`}>
            {t(`resignation.stagePill.${stage[0]}`, { defaultValue: stage[1] })}
        </span>
    );
}

export default ResignationStagePill;
