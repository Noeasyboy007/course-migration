const fs = require('fs/promises');

async function parseCsvFile(filePath) {
    const content = await fs.readFile(filePath, 'utf8');

    return parseCsv(content);
}

function parseCsv(content) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let index = 0; index < content.length; index += 1) {
        const char = content[index];
        const nextChar = content[index + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                field += '"';
                index += 1;
                continue;
            }

            if (char === '"') {
                inQuotes = false;
                continue;
            }

            field += char;
            continue;
        }

        if (char === '"') {
            inQuotes = true;
            continue;
        }

        if (char === ',') {
            row.push(field);
            field = '';
            continue;
        }

        if (char === '\r') {
            continue;
        }

        if (char === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            continue;
        }

        field += char;
    }

    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    if (rows.length === 0) {
        return [];
    }

    const [headers, ...dataRows] = rows;

    return dataRows
        .filter((currentRow) => currentRow.some((value) => value !== ''))
        .map((currentRow) => buildRowObject(headers, currentRow));
}

function buildRowObject(headers, row) {
    return headers.reduce((accumulator, header, index) => {
        accumulator[header] = row[index] ?? '';
        return accumulator;
    }, {});
}

module.exports = {
    parseCsvFile,
};
