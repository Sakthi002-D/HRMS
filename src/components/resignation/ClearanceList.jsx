// Exit clearance departments and items.
// - canEdit(department): show controls (HR, or the department owner in My Approvals → Clearance)
// - onSave(item, { status, amount }): saves one item; returns a promise
// Without canEdit (the resigning employee) each item shows its status only.
import { useState } from "react";
import { CheckCircle2, Clock3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CLEARANCE_STATUSES, clearanceStatusLabel, clearanceTone, formatQar } from "./resignationApi";

const typeLabel = (t, type) => t(`resignation.clearance.types.${String(type).toLowerCase()}`, { defaultValue: type });

function ClearanceItem({ item, editable, onSave, idPrefix }) {
    const { t } = useTranslation();
    const [status, setStatus] = useState(item.status);
    const [amount, setAmount] = useState(item.deduction_amount ? String(item.deduction_amount) : "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const selectId = `${idPrefix}-status-${item.id}`;
    const amountId = `${idPrefix}-amount-${item.id}`;

    const save = async (nextStatus, nextAmount) => {
        setSaving(true);
        setError("");
        try {
            await onSave(item, { status: nextStatus, amount: nextStatus === "Deduct" ? Number(nextAmount) : null });
        } catch (err) {
            setError(err.message);
            setStatus(item.status);
        } finally {
            setSaving(false);
        }
    };

    const changeStatus = (next) => {
        setStatus(next);
        setError("");
        // Deduct waits for the amount; the others save straight away
        if (next !== "Deduct") save(next, null);
    };

    const saveDeduction = () => {
        if (!(Number(amount) > 0)) {
            setError(t("resignation.clearance.amountRequired", { defaultValue: "Enter the amount to deduct (QAR)" }));
            return;
        }
        save("Deduct", amount);
    };

    return (
        <li className={`clearance-item status-${clearanceTone(item.status)}`}>
            <div className="clearance-item-name">
                <strong>{item.name}</strong>
                <span className="clearance-type">{typeLabel(t, item.item_type)}</span>
                {item.updated_by_name && item.status !== "Pending" && (
                    <small>{t("resignation.clearance.by", { name: item.updated_by_name, defaultValue: "by {{name}}" })}</small>
                )}
            </div>
            {editable ? (
                <div className="clearance-item-controls">
                    <label className="sr-only" htmlFor={selectId}>{t("resignation.clearance.statusFor", { item: item.name, defaultValue: "Status for {{item}}" })}</label>
                    <select id={selectId} value={status} onChange={(event) => changeStatus(event.target.value)} disabled={saving}>
                        {CLEARANCE_STATUSES.map((option) => <option key={option} value={option}>{clearanceStatusLabel(option, item.item_type)}</option>)}
                    </select>
                    {status === "Deduct" && (
                        <span className="clearance-amount">
                            <label className="sr-only" htmlFor={amountId}>{t("resignation.clearance.amountFor", { item: item.name, defaultValue: "Amount to deduct for {{item}} (QAR)" })}</label>
                            <span aria-hidden="true">QAR</span>
                            <input
                                id={amountId}
                                type="number"
                                min="0.01"
                                step="0.01"
                                inputMode="decimal"
                                value={amount}
                                onChange={(event) => { setAmount(event.target.value); setError(""); }}
                                aria-invalid={Boolean(error)}
                            />
                            <button type="button" className="hiring-btn ghost clearance-save" onClick={saveDeduction} disabled={saving}>
                                {saving ? t("profileEdit.saving", { defaultValue: "Saving..." }) : t("resignation.clearance.save", { defaultValue: "Save" })}
                            </button>
                        </span>
                    )}
                    {saving && status !== "Deduct" && <span className="clearance-saving" role="status">{t("profileEdit.saving", { defaultValue: "Saving..." })}</span>}
                </div>
            ) : (
                <span className={`mpr-status ${clearanceTone(item.status)}`}>
                    {clearanceStatusLabel(item.status, item.item_type)}
                    {item.status === "Deduct" && item.deduction_amount ? ` · ${formatQar(item.deduction_amount)}` : ""}
                </span>
            )}
            {editable && item.status === "Deduct" && item.deduction_amount && status === "Deduct" && (
                <small className="clearance-saved-amount">{t("resignation.clearance.saved", { amount: formatQar(item.deduction_amount), defaultValue: "Saved: {{amount}}" })}</small>
            )}
            {error && <p className="mpr-form-error clearance-error" role="alert">{error}</p>}
        </li>
    );
}

function ClearanceList({ departments, canEdit = () => false, onSave, idPrefix = "clearance", showOwners = true }) {
    const { t } = useTranslation();
    if (!departments?.length) {
        return <p className="mpr-muted">{t("resignation.clearance.none", { defaultValue: "No clearance items." })}</p>;
    }

    return (
        <div className="clearance-departments">
            {departments.map((department) => {
                const pending = department.items.filter((item) => item.status === "Pending").length;
                const editable = canEdit(department);
                return (
                    <section key={department.id} className={`clearance-department${department.cleared ? " cleared" : ""}`} aria-labelledby={`${idPrefix}-dept-${department.id}`}>
                        <header>
                            <div>
                                <h4 id={`${idPrefix}-dept-${department.id}`}>{department.name}</h4>
                                {showOwners && (
                                    <small>
                                        {department.owners.length
                                            ? t("resignation.clearance.owner", { names: department.owners.map((owner) => owner.name).join(", "), defaultValue: "Owner: {{names}}" })
                                            : t("resignation.clearance.noOwner", { defaultValue: "No owner set – HR clears" })}
                                    </small>
                                )}
                            </div>
                            {department.cleared ? (
                                <span className="mpr-status done"><CheckCircle2 size={13} aria-hidden="true" /> {t("resignation.clearance.cleared", { defaultValue: "Cleared" })}</span>
                            ) : (
                                <span className="mpr-status pending"><Clock3 size={13} aria-hidden="true" /> {t("resignation.clearance.pendingCount", { count: pending, defaultValue: "{{count}} pending" })}</span>
                            )}
                        </header>
                        <ul>
                            {department.items.map((item) => (
                                <ClearanceItem
                                    key={`${item.id}:${item.status}:${item.deduction_amount ?? ""}`}
                                    item={item}
                                    editable={editable}
                                    onSave={onSave}
                                    idPrefix={idPrefix}
                                />
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}

export default ClearanceList;
