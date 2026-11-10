// 8 progress steps: Request, Manager, HR, Notice, Clearance, Settlement, Exit, Resigned.
// Reuses the Hiring window's step styles (.hiring-steps) with eight columns.
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PROGRESS_STEPS, progressStepLabel, resignationProgress } from "./resignationApi";

function ResignationProgress({ resignation }) {
    const { t } = useTranslation();
    const { current, stoppedAt } = resignationProgress(resignation);

    return (
        <ol className="hiring-steps resignation-steps" aria-label={t("resignation.progress.label", { defaultValue: "Resignation progress" })}>
            {PROGRESS_STEPS.map((step, index) => {
                const state = stoppedAt === index ? "stopped" : index < current ? "done" : index === current && stoppedAt === undefined ? "current" : "todo";
                return (
                    <li key={step} className={`hiring-step ${state}`} aria-current={state === "current" ? "step" : undefined}>
                        <span className="hiring-step-dot" aria-hidden="true">
                            {state === "done" ? <Check size={13} strokeWidth={3} /> : state === "stopped" ? "×" : index + 1}
                        </span>
                        <span className="hiring-step-label">{progressStepLabel(step, index)}</span>
                    </li>
                );
            })}
        </ol>
    );
}

export default ResignationProgress;
