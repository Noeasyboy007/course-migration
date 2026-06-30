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

    return collectCsvRowsSlice(filePath, 0, n);
}

/**
 * Read CSV rows in file order: skip `offset`, then take up to `limit` rows.
 * limit = Infinity (default) means take all rows after offset.
 */
async function collectCsvRowsSlice(filePath, offset = 0, limit = Number.POSITIVE_INFINITY) {
    const off = Math.max(0, Number(offset) || 0);
    const lim = limit == null || limit === '' ? Number.POSITIVE_INFINITY : Number(limit);

    if (lim <= 0) {
        return [];
    }

    const rows = [];
    let skipped = 0;

    await streamCsvRecords(filePath, (row) => {
        if (skipped < off) {
            skipped++;
            return true;
        }

        rows.push(row);

        if (rows.length >= lim) {
            return false;
        }

        return true;
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
    collectCsvRowsSlice,
    streamCsvRecords,
};
