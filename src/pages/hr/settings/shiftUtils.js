// Shared by Shift settings and the employee Shift panel

export const SHIFT_TYPES = ["standard", "labour", "summer", "ramadan"];

const toMinutes = (time) => {
    const [hours, minutes] = String(time || "").split(":").map(Number);
    return hours * 60 + minutes;
};

// Start to end, going past midnight when the end is earlier
export const shiftSpanMinutes = (shift) => ((toMinutes(shift.end_time) - toMinutes(shift.start_time) + 1440) % 1440) || 1440;

// Work time after the unpaid break
export const shiftWorkMinutes = (shift) => Math.max(0, shiftSpanMinutes(shift) - Number(shift.break_minutes || 0));

export const formatHours = (minutes) => `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;

export const shiftTypeLabel = (t, type) => t(`settings.shifts.types.${type}`, {
    defaultValue: { standard: "Standard", labour: "Labour", summer: "Summer Evening", ramadan: "Ramadan" }[type] || type,
});
