// Resignation PDFs (jsPDF, same navy header as the payslip): final settlement statement,
// experience certificate and relieving letter. jsPDF's built-in font is Latin-only, so the
// documents are in English. The same functions serve HR (generate + email) and the employee
// (download), so both get the same document.
import { jsPDF } from "jspdf";
import { formatAppDate, getAppSettings } from "../../utils/appSettings";

const NAVY = [18, 48, 74];
const HEADER = [4, 35, 48];
const BLUE = [37, 100, 235];
const MUTED = [100, 116, 139];
const LINE = [216, 227, 238];
const PAGE_WIDTH = 210;
const LEFT = 18;
const RIGHT = PAGE_WIDTH - 18;

const company = () => getAppSettings().companyName || "Shelter Group";
const date = (value) => (value ? formatAppDate(String(value).slice(0, 10), { empty: "-" }) : "-");
const money = (value) => `QAR ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safe = (value) => (value === null || value === undefined || value === "" ? "-" : String(value));

function header(pdf, title) {
    pdf.setFillColor(...HEADER);
    pdf.rect(0, 0, PAGE_WIDTH, 30, "F");
    pdf.setFillColor(...BLUE);
    pdf.rect(0, 30, PAGE_WIDTH, 1.6, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(17);
    pdf.text(company(), LEFT, 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.text(title, LEFT, 22);
}

function footer(pdf, note) {
    pdf.setDrawColor(...LINE);
    pdf.line(LEFT, 280, RIGHT, 280);
    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.text(note, LEFT, 286);
}

// Two-column block of "Label: value"
function details(pdf, pairs, top) {
    pdf.setFontSize(10);
    pairs.forEach(([label, value], index) => {
        const column = index % 2;
        const y = top + Math.floor(index / 2) * 7;
        const x = column === 0 ? LEFT : 110;
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(...MUTED);
        pdf.text(label, x, y);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...NAVY);
        pdf.text(safe(value), x + 34, y);
    });
    return top + Math.ceil(pairs.length / 2) * 7;
}

const employeePairs = (resignation) => [
    ["Employee", resignation.employee_name],
    ["Employee ID", resignation.employee_id],
    ["Designation", resignation.designation],
    ["Department", resignation.department],
    ["Grade", resignation.grade],
    ["Resignation no.", resignation.resignation_no],
    ["Joining date", date(resignation.joining_date)],
    ["Last working day", date(resignation.last_working_day)],
];

// ---------- Final settlement statement ----------
export function settlementStatementPdf(resignation, settlement) {
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    header(pdf, "Final Settlement Statement");
    let y = details(pdf, employeePairs(resignation), 42);

    y += 4;
    pdf.setFillColor(...NAVY);
    pdf.rect(LEFT, y, RIGHT - LEFT, 8, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.text("Item", LEFT + 3, y + 5.4);
    pdf.text("Amount", RIGHT - 3, y + 5.4, { align: "right" });
    y += 8;

    for (const row of settlement.rows) {
        const formula = pdf.splitTextToSize(row.formula || "", 120);
        const height = 7 + formula.length * 3.8;
        if (y + height > 262) {
            footer(pdf, `${company()} HRMS - continued`);
            pdf.addPage();
            header(pdf, "Final Settlement Statement (continued)");
            y = 40;
        }
        pdf.setTextColor(...NAVY);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.text(pdf.splitTextToSize(row.label, 125)[0], LEFT + 3, y + 5);
        pdf.text(`${row.kind === "deduction" ? "- " : ""}${money(row.amount)}`, RIGHT - 3, y + 5, { align: "right" });
        pdf.setTextColor(...MUTED);
        pdf.setFontSize(8);
        pdf.text(formula, LEFT + 3, y + 9);
        y += height;
        pdf.setDrawColor(...LINE);
        pdf.line(LEFT, y, RIGHT, y);
    }

    y += 2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(...NAVY);
    pdf.text("Total earnings", LEFT + 3, y + 5);
    pdf.text(money(settlement.total_earnings), RIGHT - 3, y + 5, { align: "right" });
    pdf.text("Total deductions", LEFT + 3, y + 11);
    pdf.text(`- ${money(settlement.total_deductions)}`, RIGHT - 3, y + 11, { align: "right" });
    y += 15;
    // Net < 0: the employee owes the company (amber row, positive amount)
    const owes = Number(settlement.net) < 0;
    if (owes) pdf.setFillColor(255, 244, 224);
    else pdf.setFillColor(...NAVY);
    pdf.rect(LEFT, y, RIGHT - LEFT, 10, "F");
    if (owes) pdf.setTextColor(146, 64, 14);
    else pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11.5);
    pdf.text(owes ? "Amount the employee owes" : "Net amount payable", LEFT + 3, y + 6.8);
    pdf.text(money(Math.abs(Number(settlement.net) || 0)), RIGHT - 3, y + 6.8, { align: "right" });
    y += 18;

    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    const rules = settlement.rules || {};
    const notes = [
        `Gratuity: ${rules.gratuityDaysPerYear ?? 21} days' basic salary per year of service, from ${rules.minServiceYears ?? 1} year(s) of service. Leave encashment on ${rules.leaveEncashmentBasis === "gross" ? "gross" : "basic"} salary.`,
        `Calculated ${settlement.calculated_at ? date(settlement.calculated_at) : "-"}${settlement.calculated_by ? ` by ${settlement.calculated_by}` : ""}${resignation.settlement_decided_by_name ? `; approved by ${resignation.settlement_decided_by_name} (${settlement.approval?.role === "HR" ? "HR" : "Finance"}) on ${date(resignation.settlement_decided_at)}` : ""}.`,
    ];
    pdf.text(pdf.splitTextToSize(notes.join(" "), RIGHT - LEFT), LEFT, y);

    footer(pdf, `${company()} HRMS - generated ${date(new Date().toISOString())}`);
    return pdf;
}

// ---------- Experience certificate / relieving letter ----------
const LETTERS = {
    experience_certificate: {
        title: "Experience Certificate",
        body: (r, name) => [
            "TO WHOM IT MAY CONCERN",
            `This is to certify that ${r.employee_name} (Employee ID ${r.employee_id}) was employed with ${name} from ${date(r.joining_date)} to ${date(r.last_working_day)}.`,
            `During this period, ${r.employee_name} worked as ${safe(r.designation)}${r.department ? ` in the ${r.department} department` : ""}${r.grade ? `, grade ${r.grade}` : ""}.`,
            `We found ${r.employee_name} sincere and hardworking, and we wish them every success in their future career.`,
            "This certificate is issued on the employee's request, without any liability on the part of the company.",
        ],
    },
    relieving_letter: {
        title: "Relieving Letter",
        body: (r, name) => [
            `Dear ${r.employee_name},`,
            `This refers to your resignation ${r.resignation_no} dated ${date(r.resignation_date)}. Your resignation has been accepted and you are relieved from the services of ${name} at the close of business on ${date(r.last_working_day)}.`,
            `Position held: ${safe(r.designation)}${r.grade ? ` (grade ${r.grade})` : ""}. Date of joining: ${date(r.joining_date)}.`,
            "We confirm that you have completed the exit clearance and your full and final settlement has been processed.",
            "We thank you for your contribution and wish you every success in the future.",
        ],
    },
};

export function exitLetterPdf(type, resignation, issuedOn) {
    const letter = LETTERS[type];
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const name = company();
    header(pdf, letter.title);

    pdf.setTextColor(...NAVY);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.text(`Date: ${date(issuedOn)}`, RIGHT, 44, { align: "right" });
    pdf.text(`Ref: ${safe(resignation.resignation_no)}`, LEFT, 44);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text(letter.title.toUpperCase(), PAGE_WIDTH / 2, 62, { align: "center" });

    let y = 78;
    pdf.setFontSize(11);
    letter.body(resignation, name).forEach((paragraph, index) => {
        pdf.setFont("helvetica", index === 0 ? "bold" : "normal");
        const lines = pdf.splitTextToSize(paragraph, RIGHT - LEFT);
        pdf.text(lines, LEFT, y);
        y += lines.length * 5.6 + 5;
    });

    y += 16;
    pdf.setFont("helvetica", "normal");
    pdf.text("For and on behalf of", LEFT, y);
    pdf.setFont("helvetica", "bold");
    pdf.text(name, LEFT, y + 6);
    pdf.setDrawColor(...NAVY);
    pdf.line(LEFT, y + 26, LEFT + 60, y + 26);
    pdf.setFont("helvetica", "normal");
    pdf.text("Human Resources", LEFT, y + 32);

    footer(pdf, `${name} HRMS - ${letter.title}, ${safe(resignation.employee_id)}`);
    return pdf;
}

export const EXIT_LETTER_TITLES = Object.fromEntries(Object.entries(LETTERS).map(([key, value]) => [key, value.title]));

export const pdfFileName = (resignation, type) => `${resignation.employee_id}-${type.replace(/_/g, "-")}.pdf`;
export const pdfBase64 = (pdf) => pdf.output("datauristring");
