const fs = require('fs/promises');
const vm = require('vm');

const { getMigrationConfig } = require('../config/migrationConfig');
const {
    collectAllCsvRows,
    collectCsvRowsWhere,
    collectFirstNCsvRows,
    streamCsvRecords,
} = require('./csvParserService');
const { loadSectionDatasets, buildSectionContentMap } = require('./contentSectionService');

async function previewCourses(options = {}) {
    const courses = await buildMigratedCourses(options);
    const filtered = filterCourses(courses, options);

    return {
        totalAvailable: courses.length,
        totalSelected: filtered.length,
        courses: filtered,
    };
}

async function migrateCourses(options = {}) {
    const courses = await buildMigratedCourses(options);
    const selectedCourses = filterCourses(courses, options);
    const results = [];

    for (const course of selectedCourses) {
        if (options.dryRun) {
            results.push({
                legacyCourseId: course.meta.legacyCourseId,
                title: course.payload.title,
                success: true,
                dryRun: true,
                payload: course.payload,
            });
            continue;
        }

        const apiResponse = await createCourse(course.payload);

        results.push({
            legacyCourseId: course.meta.legacyCourseId,
            title: course.payload.title,
            success: apiResponse.ok,
            status: apiResponse.status,
            response: apiResponse.data,
        });
    }

    return {
        totalAvailable: courses.length,
        totalSelected: selectedCourses.length,
        successCount: results.filter((result) => result.success).length,
        failureCount: results.filter((result) => !result.success).length,
        results,
    };
}

async function buildMigratedCourses(options = {}) {
    const dataset = await loadMigrationSourceData(options);
    const { courseRows, bannerRows, contentRows, courseTypeMap, mapping, sectionDatasets } = dataset;

    const bannerMap  = buildBannerMap(bannerRows);
    const contentMap = buildContentMap(contentRows);

    // Build an id-indexed map of tbl_course_content rows for section-based HTML rendering
    const contentRowsById = new Map(
        contentRows.map((r) => [String(r.id ?? '').trim(), r]),
    );
    const sectionContentMap = buildSectionContentMap(courseRows, contentRowsById, sectionDatasets);

    return courseRows.map((courseRow) => {
        const courseId    = String(courseRow.id ?? '').trim();
        const bannerRow   = bannerMap.get(courseRow.id) || {};
        const contentData = contentMap.get(courseRow.id) || createEmptyContentData(courseRow.id);
        const typeId      = String(courseRow.type_of_course ?? '').trim();
        const courseTypeRow = (typeId && courseTypeMap.get(typeId)) || {};
        const sectionHtml = sectionContentMap.get(courseId) || '';

        const payload = buildPayload({
            mapping,
            courseRow,
            bannerRow,
            contentData,
            courseTypeRow,
            sectionHtml,
        });

        return {
            meta: {
                legacyCourseId: courseRow.id,
                sourceCourseName: courseRow.course_name || '',
                contentRowCount: contentData.rowCount,
                bannerFound: Boolean(Object.keys(bannerRow).length),
            },
            payload,
        };
    });
}

function resolveMaxRows(limit) {
    if (limit == null || limit === '') {
        return Number.POSITIVE_INFINITY;
    }

    const n = Number(limit);

    if (!Number.isFinite(n) || n < 0) {
        return Number.POSITIVE_INFINITY;
    }

    return n;
}

/**
 * Loads course rows (respecting courseId / courseIds / limit) and only banner/content
 * rows for those courses, using streaming CSV reads to avoid holding multi‑MB files in memory twice.
 */
async function loadMigrationSourceData(options = {}) {
    const config = getMigrationConfig();
    const maxRows = resolveMaxRows(options.limit);

    if (maxRows === 0) {
        const mapping = await loadMapping(config.mappingFile);
        const courseTypeRows = await collectAllCsvRows(config.csv.courseType);
        return {
            courseRows: [],
            bannerRows: [],
            contentRows: [],
            sectionDatasets: {},
            courseTypeMap: buildCourseTypeMapById(courseTypeRows),
            mapping,
        };
    }

    const [mapping, courseTypeRows, courseRows] = await Promise.all([
        loadMapping(config.mappingFile),
        collectAllCsvRows(config.csv.courseType),
        collectCourseRowsWithFilters(config.csv.course, options),
    ]);

    const idSetForRelated = new Set(
        courseRows.map((row) => String(row.id ?? '').trim()).filter(Boolean),
    );

    const [bannerRows, contentRows, sectionDatasets] = await Promise.all([
        collectCsvRowsWhere(config.csv.banner, (row) =>
            idSetForRelated.has(String(row.course_id ?? '').trim()),
        ),
        collectCsvRowsWhere(config.csv.content, (row) =>
            idSetForRelated.has(String(row.course_id ?? '').trim()),
        ),
        loadSectionDatasets(config, idSetForRelated),
    ]);

    return {
        courseRows,
        bannerRows,
        contentRows,
        sectionDatasets,
        courseTypeMap: buildCourseTypeMapById(courseTypeRows),
        mapping,
    };
}

async function collectCourseRowsWithFilters(filePath, options = {}) {
    const maxRows = resolveMaxRows(options.limit);

    if (options.courseId) {
        const courseId = String(options.courseId).trim();
        const rows = await collectCsvRowsWhere(
            filePath,
            (row) => String(row.id ?? '').trim() === courseId,
        );

        if (maxRows === Number.POSITIVE_INFINITY) {
            return rows;
        }

        return rows.slice(0, maxRows);
    }

    if (Array.isArray(options.courseIds) && options.courseIds.length > 0) {
        const idSet = new Set(options.courseIds.map((id) => String(id).trim()));
        const matched = [];

        await streamCsvRecords(filePath, (row) => {
            if (!idSet.has(String(row.id ?? '').trim())) {
                return true;
            }

            matched.push(row);

            if (maxRows !== Number.POSITIVE_INFINITY && matched.length >= maxRows) {
                return false;
            }

            return true;
        });

        return matched;
    }

    if (maxRows !== Number.POSITIVE_INFINITY) {
        return collectFirstNCsvRows(filePath, maxRows);
    }

    return collectAllCsvRows(filePath);
}

async function loadMapping(mappingFilePath) {
    const rawMapping = await fs.readFile(mappingFilePath, 'utf8');
    const mapping = vm.runInNewContext(`(${rawMapping})`);

    if (!mapping || typeof mapping !== 'object') {
        throw new Error('Mapping file did not return an object.');
    }

    return mapping;
}

function buildCourseTypeMapById(rows) {
    const map = new Map();

    for (const row of rows) {
        const id = String(row.id ?? '').trim();

        if (id) {
            map.set(id, row);
        }
    }

    return map;
}

function buildBannerMap(rows) {
    const grouped = new Map();

    for (const row of rows) {
        if (!grouped.has(row.course_id)) {
            grouped.set(row.course_id, []);
        }

        grouped.get(row.course_id).push(row);
    }

    return new Map(
        Array.from(grouped.entries()).map(([courseId, bannerRows]) => [
            courseId,
            selectBestBannerRow(bannerRows),
        ]),
    );
}

function selectBestBannerRow(rows) {
    return [...rows].sort(compareBannerRows)[0] || {};
}

function compareBannerRows(left, right) {
    return (
        compareBooleanFlag(right.use_as_listing, left.use_as_listing) ||
        comparePrimaryBanner(right.banner_type, left.banner_type) ||
        compareActiveStatus(right.status, left.status) ||
        compareDate(right.modified_date, left.modified_date) ||
        compareNumber(right.id, left.id)
    );
}

function compareBooleanFlag(left, right) {
    return normalizeBoolean(left) - normalizeBoolean(right);
}

function comparePrimaryBanner(left, right) {
    return Number(String(left).toLowerCase() === 'primary') - Number(String(right).toLowerCase() === 'primary');
}

function compareActiveStatus(left, right) {
    return Number(String(left).toUpperCase() === 'A') - Number(String(right).toUpperCase() === 'A');
}

function compareDate(left, right) {
    return new Date(left || 0).getTime() - new Date(right || 0).getTime();
}

function compareNumber(left, right) {
    return Number(left || 0) - Number(right || 0);
}

function buildContentMap(rows) {
    const grouped = new Map();

    for (const row of rows) {
        if (!grouped.has(row.course_id)) {
            grouped.set(row.course_id, []);
        }

        grouped.get(row.course_id).push(row);
    }

    return new Map(
        Array.from(grouped.entries()).map(([courseId, contentRows]) => [
            courseId,
            mergeContentRows(courseId, contentRows),
        ]),
    );
}

function mergeContentRows(courseId, rows) {
    const orderedRows = [...rows].sort((left, right) => compareNumber(left.id, right.id));

    const sections = orderedRows
        .map((row) => renderContentSection(row.content_title, row.content_details))
        .filter(Boolean);

    return {
        course_id: courseId,
        rowCount: orderedRows.length,
        content_details: sections.join('\n\n'),
        content_title: orderedRows
            .map((row) => cleanText(row.content_title))
            .filter(Boolean)
            .join(' | '),
        merged_content: sections.join('\n\n'),
    };
}

function renderContentSection(title, details) {
    const cleanTitle = cleanText(title);
    const cleanDetails = cleanText(details);

    if (!cleanTitle && !cleanDetails) {
        return '';
    }

    if (cleanTitle && cleanDetails) {
        return `<section><h2>${escapeHtml(cleanTitle)}</h2>${cleanDetails}</section>`;
    }

    if (cleanTitle) {
        return `<section><h2>${escapeHtml(cleanTitle)}</h2></section>`;
    }

    return cleanDetails;
}

function buildPayload({ mapping, courseRow, bannerRow, contentData, courseTypeRow = {}, sectionHtml = '' }) {
    const payload = {};

    for (const [targetField, rule] of Object.entries(mapping)) {
        payload[targetField] = resolveMappedValue(rule, {
            courseRow,
            bannerRow,
            contentData,
            courseTypeRow,
        });
    }

    payload.slug = payload.slug || slugify(payload.title || courseRow.url_mask || courseRow.course_name || '');
    payload.title = payload.title || courseRow.course_name || '';
    // sectionHtml is built from tbl_course_section_type_mapping ordered by section_position,
    // mirroring the legacy PHP CourseLib::getSections() algorithm.
    // Falls back to the flat merged_content if no section data is available.
    payload.course_content = sectionHtml || payload.course_content || contentData.merged_content || '';
    payload.header_tag_snippets = normalizeJsonArray(payload.header_tag_snippets);
    payload.footer_tag_snippets = normalizeJsonArray(payload.footer_tag_snippets);
    payload.course_tags = normalizeCourseTags(payload.course_tags);
    payload.banner_url = payload.banner_url || '';
    payload.third_party_lead_enabled = resolveThirdPartyLeadEnabled(payload.third_party_lead_enabled);

    return normalizePayload(payload, {
        courseRow,
        bannerRow,
        contentData,
        courseTypeRow,
    });
}

function resolveMappedValue(rule, context) {
    if (typeof rule !== 'string') {
        return rule;
    }

    const trimmedRule = rule.trim();

    if (trimmedRule === '') {
        return '';
    }

    if (trimmedRule === 'true') {
        return true;
    }

    if (trimmedRule === 'false') {
        return false;
    }

    if (trimmedRule === 'content_title+content_details') {
        return context.contentData.merged_content || '';
    }

    if (trimmedRule.includes('+')) {
        return trimmedRule
            .split('+')
            .map((part) => resolveColumnValue(part.trim(), context))
            .filter((value) => cleanText(value))
            .join(' ');
    }

    return resolveColumnValue(trimmedRule, context);
}

function resolveColumnValue(columnName, { courseRow, bannerRow, contentData, courseTypeRow = {} }) {
    if (Object.prototype.hasOwnProperty.call(courseRow, columnName)) {
        return courseRow[columnName];
    }

    if (Object.prototype.hasOwnProperty.call(bannerRow, columnName)) {
        return bannerRow[columnName];
    }

    if (Object.prototype.hasOwnProperty.call(contentData, columnName)) {
        return contentData[columnName];
    }

    if (Object.prototype.hasOwnProperty.call(courseTypeRow, columnName)) {
        return courseTypeRow[columnName];
    }

    return '';
}

function normalizePayload(payload, sourceContext = {}) {
    const booleanFields = new Set([
        'is_published',
        'payment_enabled',
        'third_party_lead_enabled',
        'share_enabled',
        'is_new',
        'is_featured',
        'get_study_material_enabled',
        'use_custom_study_material_template',
        'counselling_call_enabled',
        'join_waitlist_enabled',
        'use_custom_join_waitlist_email_template',
        'show_banner_phone',
        'show_banner_tagline',
        'show_learn_from',
        'show_get_course_syllabus',
        'refund_policy',
        'send_to_timepay',
        'send_to_leadsquared',
        'send_to_wati',
        'send_to_email',
    ]);

    const numberFields = new Set(['amount']);

    for (const key of Object.keys(payload)) {
        if (booleanFields.has(key)) {
            if (key === 'is_published') {
                // courseMap maps legacy hide_from_list: Y = hide from list, N = show in list.
                // Target is_published: true = visible/published on listing.
                payload[key] = normalizeIsPublishedFromHideFromList(payload[key]);
            } else {
                payload[key] = normalizeBoolean(payload[key]);
            }
            continue;
        }

        if (numberFields.has(key)) {
            payload[key] = normalizeAmount(payload[key]);
            continue;
        }

        if (key === 'currency') {
            payload[key] = cleanText(payload[key]) || 'INR';
            continue;
        }

        if (key === 'duration_minutes') {
            payload[key] = normalizeDurationMinutes(
                payload[key],
                sourceContext.courseRow?.duration_type || sourceContext.bannerRow?.duration_type || '',
            );
            continue;
        }

        if (key === 'status') {
            payload[key] = normalizeStatus(payload[key]);
            continue;
        }

        if (key === 'enrollment_last_date') {
            payload[key] = normalizeDate(payload[key]);
            continue;
        }

        if (key === 'logo_type') {
            payload[key] = normalizeLogoType(payload[key]);
            continue;
        }

        if (typeof payload[key] === 'string') {
            payload[key] = cleanText(payload[key]);
        }
    }

    return payload;
}

async function createCourse(payload) {
    const config = getMigrationConfig();
    const formData = new FormData();

    for (const [key, value] of Object.entries(payload)) {
        formData.append(key, serializeFormValue(value));
    }

    const headers = buildAuthHeaders(config.target.token);

    const response = await fetch(config.target.baseUrl, {
        method: 'POST',
        headers,
        body: formData,
    });

    const responseBody = await readResponseBody(response);

    return {
        ok: response.ok,
        status: response.status,
        data: responseBody,
    };
}

function buildAuthHeaders(token) {
    const cleanToken = cleanText(token);

    if (!cleanToken) {
        return {};
    }

    const authorizationValue = cleanToken.toLowerCase().startsWith('bearer ')
        ? cleanToken
        : `Bearer ${cleanToken}`;

    return {
        Authorization: authorizationValue,
        token: cleanToken,
    };
}

async function readResponseBody(response) {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        return response.json();
    }

    return response.text();
}

function filterCourses(courses, options) {
    let filtered = [...courses];

    if (options.courseId) {
        filtered = filtered.filter((course) => String(course.meta.legacyCourseId) === String(options.courseId));
    }

    if (Array.isArray(options.courseIds) && options.courseIds.length > 0) {
        const idSet = new Set(options.courseIds.map(String));
        filtered = filtered.filter((course) => idSet.has(String(course.meta.legacyCourseId)));
    }

    if (options.limit) {
        filtered = filtered.slice(0, Number(options.limit));
    }

    return filtered;
}

function normalizeCourseTags(value) {
    const cleanValue = cleanText(value);

    if (!cleanValue) {
        return '[]';
    }

    const tags = cleanValue
        .split(',')
        .map((tag) => cleanText(tag))
        .filter(Boolean);

    return JSON.stringify(tags);
}

function resolveThirdPartyLeadEnabled(value) {
    const cleanValue = cleanText(value).toLowerCase();

    if (cleanValue === '') {
        return true;
    }

    if (['y', 'yes', 'true', '1'].includes(cleanValue)) {
        return true;
    }

    if (['n', 'no', 'false', '0'].includes(cleanValue)) {
        return false;
    }

    return true;
}

function normalizeJsonArray(value) {
    const cleanValue = cleanText(value);
    return cleanValue || '[]';
}

function normalizeBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }

    const normalized = String(value || '').trim().toLowerCase();

    if (['y', 'yes', 'true', '1', 'a'].includes(normalized)) {
        return true;
    }

    if (normalized === 'n' || normalized === 'false' || normalized === '0') {
        return false;
    }

    return false;
}

/** Legacy hide_from_list → target is_published (inverse of plain Y/N “yes” semantics). */
function normalizeIsPublishedFromHideFromList(value) {
    if (typeof value === 'boolean') {
        return value;
    }

    const normalized = String(value || '').trim().toLowerCase();

    if (['y', 'yes', 'true', '1', 'a'].includes(normalized)) {
        return false;
    }

    if (normalized === 'n' || normalized === 'no' || normalized === 'false' || normalized === '0') {
        return true;
    }

    return false;
}

function normalizeLogoType(value) {
    return cleanText(value);
}

function normalizeAmount(value) {
    const numericValue = Number.parseFloat(String(value || '').replace(/,/g, ''));
    return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeDurationMinutes(durationValue, durationType) {
    const numericDuration = Number.parseFloat(String(durationValue || '').replace(/,/g, '').trim());

    if (!Number.isFinite(numericDuration)) {
        return cleanText(durationValue);
    }

    const normalizedType = cleanText(durationType).toLowerCase();

    if (normalizedType === 'days' || normalizedType === 'day') {
        return String(Math.round(numericDuration * 24 * 60));
    }

    if (normalizedType === 'months' || normalizedType === 'month') {
        return String(Math.round(numericDuration * 30.4166667 * 24 * 60));
    }

    return String(Math.round(numericDuration));
}

function normalizeStatus(value) {
    const normalized = String(value || '').trim().toUpperCase();

    if (['A', 'P', 'D'].includes(normalized)) {
        return normalized;
    }

    if (normalized === '') {
        return 'P';
    }

    return 'P';
}

function normalizeDate(value) {
    const cleanValue = cleanText(value);

    if (!cleanValue || cleanValue.toUpperCase() === 'NULL') {
        return '';
    }

    const date = new Date(cleanValue);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function serializeFormValue(value) {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'boolean') {
        return String(value);
    }

    if (typeof value === 'number') {
        return String(value);
    }

    return String(value);
}

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function createEmptyContentData(courseId) {
    return {
        course_id: courseId,
        rowCount: 0,
        content_details: '',
        content_title: '',
        merged_content: '',
    };
}

function cleanText(value) {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = String(value);
    return stringValue.toUpperCase() === 'NULL' ? '' : stringValue.trim();
}

function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = {
    previewCourses,
    migrateCourses,
};
