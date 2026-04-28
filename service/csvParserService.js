const fs = require('fs');
const { parse } = require('csv-parse');

function createParserPipeline(filePath) {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const parser = stream.pipe(
        parse({
            columns: true,
            relax_column_count: true,
            relax_quotes: true,
            skip_empty_lines: true,
        }),
    );
    return { stream, parser };
}

/**
 * Stream CSV rows; return false from visitor to stop reading (closes the file stream).
 */
async function streamCsvRecords(filePath, visitor) {
    const { stream, parser } = createParserPipeline(filePath);

    try {
        for await (const row of parser) {
            const shouldContinue = await visitor(row);
            if (shouldContinue === false) {
                break;
            }
        }
    } finally {
        if (!stream.destroyed) {
            stream.destroy();
        }
    }
}

async function collectAllCsvRows(filePath) {
    const rows = [];
    await streamCsvRecords(filePath, (row) => {
        rows.push(row);
        return true;
    });
    return rows;
}

async function collectCsvRowsWhere(filePath, predicate) {
    const rows = [];
    await streamCsvRecords(filePath, (row) => {
        if (predicate(row)) {
            rows.push(row);
        }
        return true;
    });
    return rows;
}

async function collectFirstNCsvRows(filePath, n) {
    if (n <= 0) {
        return [];
    }

    const rows = [];
    await streamCsvRecords(filePath, (row) => {
        rows.push(row);
        return rows.length < n;
    });
    return rows;
}

/** @deprecated Prefer collectAllCsvRows — kept for callers that still use this name. */
async function parseCsvFile(filePath) {
    return collectAllCsvRows(filePath);
}

module.exports = {
    parseCsvFile,
    collectAllCsvRows,
    collectCsvRowsWhere,
    collectFirstNCsvRows,
    streamCsvRecords,
};
