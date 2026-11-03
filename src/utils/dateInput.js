// Date pickers need YYYY-MM-DD. The API sends DATE columns as timestamps
// (2020-12-08T18:30:00.000Z is 9 December in India), so cutting the text gives the day before.
export const toDateInput = (value) => {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) return "";

  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
};
