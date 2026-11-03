// Minimal .xlsx writer (one sheet, bold frozen header row) with no dependencies.
// An .xlsx file is a zip of SpreadsheetML parts; entries are stored uncompressed.

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
};

// Stored (method 0) zip archive from [{ name, data: Uint8Array }]
const buildZip = (files) => {
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
        const name = encoder.encode(file.name);
        const crc = crc32(file.data);
        const size = file.data.length;

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true); // UTF-8 names
        local.setUint16(8, 0, true);
        local.setUint16(10, dosTime, true);
        local.setUint16(12, dosDate, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, size, true);
        local.setUint32(22, size, true);
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);
        localParts.push(new Uint8Array(local.buffer), name, file.data);

        const central = new DataView(new ArrayBuffer(46));
        central.setUint32(0, 0x02014b50, true);
        central.setUint16(4, 20, true);
        central.setUint16(6, 20, true);
        central.setUint16(8, 0x0800, true);
        central.setUint16(10, 0, true);
        central.setUint16(12, dosTime, true);
        central.setUint16(14, dosDate, true);
        central.setUint32(16, crc, true);
        central.setUint32(20, size, true);
        central.setUint32(24, size, true);
        central.setUint16(28, name.length, true);
        central.setUint32(42, offset, true);
        centralParts.push(new Uint8Array(central.buffer), name);

        offset += 30 + name.length + size;
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...localParts, ...centralParts, new Uint8Array(end.buffer)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
};

// XML text: escape markup and drop characters XML 1.0 does not allow
const xmlText = (value) => String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const columnName = (index) => {
    let name = "";
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    }
    return name;
};

const cellXml = (value, ref, style = 0) => {
    const styleAttr = style ? ` s="${style}"` : "";
    if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
    }
    return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
};

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const sheetXml = (headers, rows) => {
    const widths = headers.map((header, column) => Math.min(50, Math.max(10,
        ...[header, ...rows.map((row) => row[column])].map((value) => String(value ?? "").length + 2)
    )));
    const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    const rowXml = (values, rowNumber, style) =>
        `<row r="${rowNumber}">${values.map((value, column) => cellXml(value, `${columnName(column)}${rowNumber}`, style)).join("")}</row>`;

    return `${XML_HEADER}<worksheet xmlns="${MAIN_NS}">`
        + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        + `<cols>${cols}</cols>`
        + `<sheetData>${rowXml(headers, 1, 1)}${rows.map((row, index) => rowXml(row, index + 2, 0)).join("")}</sheetData>`
        + "</worksheet>";
};

// Saves headers + rows (arrays of strings/numbers) as `fileName`.xlsx
export const downloadXlsx = (fileName, headers, rows, sheetName = "Sheet1") => {
    const safeSheetName = xmlText(String(sheetName).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1");
    const parts = {
        "[Content_Types].xml": `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
            + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            + '<Default Extension="xml" ContentType="application/xml"/>'
            + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            + "</Types>",
        "_rels/.rels": `${XML_HEADER}<Relationships xmlns="${REL_NS}">`
            + `<Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="xl/workbook.xml"/>`
            + "</Relationships>",
        "xl/workbook.xml": `${XML_HEADER}<workbook xmlns="${MAIN_NS}" xmlns:r="${DOC_REL}">`
            + `<sheets><sheet name="${safeSheetName}" sheetId="1" r:id="rId1"/></sheets>`
            + "</workbook>",
        "xl/_rels/workbook.xml.rels": `${XML_HEADER}<Relationships xmlns="${REL_NS}">`
            + `<Relationship Id="rId1" Type="${DOC_REL}/worksheet" Target="worksheets/sheet1.xml"/>`
            + `<Relationship Id="rId2" Type="${DOC_REL}/styles" Target="styles.xml"/>`
            + "</Relationships>",
        "xl/styles.xml": `${XML_HEADER}<styleSheet xmlns="${MAIN_NS}">`
            + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
            + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
            + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
            + "</styleSheet>",
        "xl/worksheets/sheet1.xml": sheetXml(headers, rows),
    };

    const blob = buildZip(Object.entries(parts).map(([name, xml]) => ({ name, data: encoder.encode(xml) })));
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
