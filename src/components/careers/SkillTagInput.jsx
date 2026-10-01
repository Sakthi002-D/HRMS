// Tag input for key skills: Enter or comma adds a tag, Backspace on an empty box removes the last one.
import { useState } from "react";
import { X } from "lucide-react";

const MAX_TAGS = 30;

function SkillTagInput({ id, value, onChange, suggestions = [], invalid = false }) {
    const [draft, setDraft] = useState("");
    const has = (skill) => value.some((item) => item.toLowerCase() === skill.toLowerCase());

    const add = (raw) => {
        const parts = String(raw).split(",").map((part) => part.trim().slice(0, 50)).filter(Boolean);
        const next = [...value];
        parts.forEach((skill) => {
            if (next.length < MAX_TAGS && !next.some((item) => item.toLowerCase() === skill.toLowerCase())) next.push(skill);
        });
        if (next.length !== value.length) onChange(next);
        setDraft("");
    };

    const handleKeyDown = (event) => {
        if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add(draft);
        } else if (event.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
        }
    };

    const remaining = suggestions.filter((skill) => !has(skill));

    return (
        <div className="skill-tags">
            <div className={`skill-tags-box${invalid ? " invalid" : ""}`}>
                {value.map((skill) => (
                    <span key={skill} className="skill-tag">
                        {skill}
                        <button type="button" onClick={() => onChange(value.filter((item) => item !== skill))} aria-label={`Remove ${skill}`}>
                            <X size={12} aria-hidden="true" />
                        </button>
                    </span>
                ))}
                <input
                    id={id}
                    value={draft}
                    onChange={(event) => (event.target.value.includes(",") ? add(event.target.value) : setDraft(event.target.value))}
                    onKeyDown={handleKeyDown}
                    onBlur={() => draft.trim() && add(draft)}
                    placeholder={value.length ? "Add another skill" : "Type a skill and press Enter"}
                    disabled={value.length >= MAX_TAGS}
                    aria-invalid={invalid}
                />
            </div>
            {remaining.length > 0 && (
                <div className="skill-suggestions">
                    <small>Skills for this role:</small>
                    {remaining.map((skill) => (
                        <button key={skill} type="button" onClick={() => add(skill)}>+ {skill}</button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default SkillTagInput;
