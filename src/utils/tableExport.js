// One export for every list page: Excel (.xlsx) or PDF (a table with the header repeated on each page).
// jsPDF's built-in font only draws Latin letters, so Arabic text does not appear in the PDF.
import { jsPDF } from "jspdf";
import { downloadXlsx } from "./xlsxExport";

const MARGIN = 32;
const CELL_PADDING = 4;
const HEADER_FILL = [4, 35, 48];
const STRIPE_FILL = [248, 250, 252];

const cellText = (value) => (value === null || value === undefined || value === "" ? "-" : String(value));

// Wider columns for longer text, within the page width
const columnWidths = (pdf, headers, rows, tableWidth) => {
    const natural = headers.map((header, column) => {
        const longest = [header, ...rows.slice(0, 200).map((row) => cellText(row[column]))]
            .reduce((max, text) => Math.max(max, pdf.getTextWidth(text)), 0);
        return Math.min(Math.max(longest + CELL_PADDING * 2, 40), 180);
    });
    const total = natural.reduce((sum, width) => sum + width, 0);
    return natural.map((width) => (width / total) * tableWidth);
};

export const downloadTablePdf = (fileName, title, headers, rows) => {
    const pdf = new jsPDF({ orientation: headers.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const fontSize = headers.length > 9 ? 7.5 : 8.5;
    const lineHeight = fontSize * 1.25;

    pdf.setFont("helvetica", "bold").setFontSize(15).setTextColor(4, 35, 48);
    pdf.text(title, MARGIN, MARGIN + 6);
    pdf.setFont("helvetica", "normal").setFontSize(9).setTextColor(70, 85, 100);
    pdf.text(`Generated ${new Date().toLocaleString("en-GB")}  ·  ${rows.length} ${rows.length === 1 ? "row" : "rows"}`, MARGIN, MARGIN + 22);

    pdf.setFontSize(fontSize);
    const widths = columnWidths(pdf, headers, rows, pageWidth - MARGIN * 2);
    let y = MARGIN + 36;

    const drawRow = (cells, { header = false, stripe = false } = {}) => {
        pdf.setFont("helvetica", header ? "bold" : "normal");
        const lines = cells.map((value, column) => pdf.splitTextToSize(cellText(value), widths[column] - CELL_PADDING * 2));
        const height = Math.max(...lines.map((cell) => cell.length)) * lineHeight + CELL_PADDING * 2;

        if (header) pdf.setFillColor(...HEADER_FILL).rect(MARGIN, y, pageWidth - MARGIN * 2, height, "F");
        else if (stripe) pdf.setFillColor(...STRIPE_FILL).rect(MARGIN, y, pageWidth - MARGIN * 2, height, "F");

        pdf.setTextColor(...(header ? [255, 255, 255] : [20, 30, 40]));
        let x = MARGIN;
        lines.forEach((cell, column) => {
            pdf.text(cell, x + CELL_PADDING, y + CELL_PADDING + fontSize);
            x += widths[column];
        });
        pdf.setDrawColor(226, 232, 240).line(MARGIN, y + height, pageWidth - MARGIN, y + height);
        y += height;
    };

    drawRow(headers, { header: true });
    rows.forEach((row, index) => {
        const lines = row.map((value, column) => pdf.splitTextToSize(cellText(value), widths[column] - CELL_PADDING * 2));
        const height = Math.max(...lines.map((cell) => cell.length)) * lineHeight + CELL_PADDING * 2;
        if (y + height > pageHeight - MARGIN - 14) {
            pdf.addPage();
            y = MARGIN;
            drawRow(headers, { header: true });
        }
        drawRow(row, { stripe: index % 2 === 1 });
    });

    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
        pdf.setPage(page);
        pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(100, 116, 139);
        pdf.text(`Page ${page} of ${pages}`, pageWidth - MARGIN, pageHeight - 16, { align: "right" });
    }
    pdf.save(`${fileName}.pdf`);
};

// format: "excel" | "pdf"; fileName without extension
export const exportTable = (format, { fileName, title, headers, rows, sheetName = title }) => {
    if (format === "pdf") downloadTablePdf(fileName, title, headers, rows);
    else downloadXlsx(`${fileName}.xlsx`, headers, rows, sheetName);
};
