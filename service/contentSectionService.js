'use strict';

/**
 * contentSectionService.js
 *
 * Builds the `course_content` HTML field by replicating the legacy PHP section
 * assembly algorithm from CourseLib.php::getSections().
 *
 * Output structure (mirrors new-system-course-content-example.html):
 *
 *   <div class="cc-main cc-top-sections">
 *     [quick-stats from quick_overview]
 *     [GLOBAL: learners-advantage]
 *     [GLOBAL: success-stories]
 *     [key-highlights from program_overview JSON]
 *     [promotional-video cards if present]
 *     [special-section if present]
 *   </div>
 *
 *   <div class="cc-layout">
 *     <aside class="cc-sidebar">
 *       <nav><ul class="cc-nav">[show_on_menu=Y links]</ul></nav>
 *     </aside>
 *     <div class="cc-sidebar-overlay">&nbsp;</div>
 *     <div class="cc-main">
 *       [textcontent | faculty | academia_panel | syllabus | course_plan
 *        | faq | testimonials | video_testimonials | legal_expert | …]
 *     </div>
 *   </div>
 */

const { collectAllCsvRows, collectCsvRowsWhere } = require('./csvParserService');

// ─── Types treated as "top" fixed sections (PHP specialSections) ───────────────
const TOP_SECTION_TYPES = new Set([
    'banner', 'quick_overview', 'program_overview', 'promotional_video', 'specialsection',
]);

// ─── S3 CDN base ──────────────────────────────────────────────────────────────
const S3 = 'https://lawsikho-frontend-production.s3.amazonaws.com/public';

// ─── Plan type name → CSS class mapping ──────────────────────────────────────
const PLAN_CSS_CLASS = {
    'free materials': 'free',
    standard:         'standard',
    'master access':  'masteraccess',
    basic:            'basic',
    premium:          'premium',
    'early bird':     'earlybird',
    'book now':       'booknow',
    scholarship:      'scholarship',
    monthly:          'monthly',
    residents:        'residents',
    'non-residents':  'non-residents',
};

// Global platform sections (learners-advantage, success-stories, etc.) are rendered
// by the new system's own page template — they must NOT be injected into course_content.

// ─── Public API ───────────────────────────────────────────────────────────────

async function loadSectionDatasets(config, courseIdSet) {
    const cc = config.contentCsv;
    if (!cc) return {};

    const byCourse = (row) => courseIdSet.has(String(row.course_id ?? '').trim());

    const [
        sectionMappingRows,
        programOverviewRows,
        promoVideoRows,
        academiaPanelRows,
        academiaPanelMappingRows,
        facultyMappingRows,
        facultyMasterRows,
        courseFaqRows,
        faqQuestionRows,
        courseSyllabusRows,
        syllabusModuleRows,
        syllabusChapterRows,
        quickOverviewRows,
        specialSectionRows,
        courseLegalExpertRows,
        legalExpertRows,
        courseTestimonialRows,
        testimonialsMasterRows,
        courseVideoTestimonialRows,
        videoTestimonialsMasterRows,
        courseIndustryRows,
        courseIndustryMappingRows,
        courseFormRows,
        coursePlanTypeMappingRows,
        coursePlanTypeMasterRows,
    ] = await Promise.all([
        collectCsvRowsWhere(cc.sectionMapping,          byCourse),
        collectCsvRowsWhere(cc.programOverview,          byCourse),
        collectCsvRowsWhere(cc.promoVideo,               byCourse),
        collectCsvRowsWhere(cc.academiaPanel,            byCourse),
        // academiaPanelMapping: filter by course_id (the mapping table has course_id)
        collectCsvRowsWhere(cc.academiaPanelMapping,    byCourse),
        // facultyMapping has course_id — filter to relevant courses
        collectCsvRowsWhere(cc.facultyMapping,           byCourse),
        collectAllCsvRows(cc.facultyMaster),
        collectCsvRowsWhere(cc.courseFaq,                byCourse),
        collectCsvRowsWhere(cc.faqQuestions,             byCourse),
        collectCsvRowsWhere(cc.courseSyllabus,           byCourse),
        collectCsvRowsWhere(cc.syllabusModule,           byCourse),
        collectCsvRowsWhere(cc.syllabusChapter,          byCourse),
        collectCsvRowsWhere(cc.quickOverview,            byCourse),
        collectCsvRowsWhere(cc.specialSection,           byCourse),
        collectCsvRowsWhere(cc.courseLegalExpert,        byCourse),
        collectAllCsvRows(cc.legalExpert),
        // testimonials: section-header (aritra/) + master (aritra/)
        collectCsvRowsWhere(cc.courseTestimonials,       byCourse),
        collectCsvRowsWhere(cc.testimonialsMaster,       byCourse),
        // video_testimonials: section-header w/ JSON selection (content-csv/) + master (aritra/)
        collectCsvRowsWhere(cc.courseVideoTestimonials,  byCourse),
        collectCsvRowsWhere(cc.videoTestimonialsMaster,  byCourse),
        // industry
        collectCsvRowsWhere(cc.courseIndustry,           byCourse),
        collectCsvRowsWhere(cc.courseIndustryMapping,    byCourse),
        // forms (section_type = 'forms') — only tbl_course_form
        collectCsvRowsWhere(cc.courseForm,               byCourse),
        collectCsvRowsWhere(cc.coursePlanTypeMapping,    byCourse),
        collectAllCsvRows(cc.coursePlanTypeMaster),
    ]);

    return {
        sectionMappingByCourse:            groupBy(sectionMappingRows,           'course_id'),
        programOverviewByCourseId:         indexBy(programOverviewRows,           'course_id'),
        promoVideoById:                    indexBy(promoVideoRows,                'id'),
        academiaPanelById:                 indexBy(academiaPanelRows,             'id'),
        academiaPanelMappingByPanelId:     groupBy(academiaPanelMappingRows,     'course_academia_panel_id'),
        academiaPanelMappingByCourseId:    groupBy(academiaPanelMappingRows,     'course_id'),
        // faculty: keyed by course_id (tbl_course_faculty_mapping has course_id directly)
        facultyMappingByCourseId:          groupBy(facultyMappingRows,           'course_id'),
        facultyMasterById:                 indexBy(facultyMasterRows,             'id'),
        courseFaqById:                     indexBy(courseFaqRows,                 'id'),
        faqQuestionsByCourseId:            groupBy(faqQuestionRows,               'course_id'),
        courseSyllabusById:                indexBy(courseSyllabusRows,            'id'),
        syllabusModuleByCourseId:          groupBy(syllabusModuleRows,            'course_id'),
        syllabusChapterByModuleId:         groupBy(syllabusChapterRows,           'module_id'),
        quickOverviewById:                 indexBy(quickOverviewRows,             'id'),
        quickOverviewByCourseId:           indexBy(quickOverviewRows,             'course_id'),
        specialSectionById:                indexBy(specialSectionRows,            'id'),
        courseLegalExpertById:             indexBy(courseLegalExpertRows,         'id'),
        legalExpertByCourseId:             groupBy(legalExpertRows,               'course_id'),
        // testimonials
        courseTestimonialsById:            indexBy(courseTestimonialRows,         'id'),
        testimonialsMasterByCourseId:      groupBy(testimonialsMasterRows,        'course_id'),
        // video_testimonials
        courseVideoTestimonialsById:       indexBy(courseVideoTestimonialRows,    'id'),
        videoTestimonialsMasterByCourseId: groupBy(videoTestimonialsMasterRows,   'course_id'),
        // industry
        courseIndustryById:                indexBy(courseIndustryRows,            'id'),
        courseIndustryMappingByIndustryId: groupBy(courseIndustryMappingRows,    'course_industry_id'),
        // forms (section_type = 'forms')
        courseFormById:                    indexBy(courseFormRows,                 'id'),
        coursePlanTypeMappingByCourseId:   groupBy(coursePlanTypeMappingRows,     'course_id'),
        coursePlanTypeMasterById:          indexBy(coursePlanTypeMasterRows,      'id'),
    };
}

/**
 * Build Map<courseId, htmlString> for course_content.
 */
function buildSectionContentMap(courseRows, contentRowsById, sectionDatasets) {
    if (!sectionDatasets || !sectionDatasets.sectionMappingByCourse) {
        return new Map();
    }
    const map = new Map();
    for (const courseRow of courseRows) {
        const courseId = String(courseRow.id ?? '').trim();
        if (!courseId) continue;
        map.set(courseId, buildCourseContentHtml(courseId, contentRowsById, sectionDatasets));
    }
    return map;
}

// ─── Core HTML builder ────────────────────────────────────────────────────────

function buildCourseContentHtml(courseId, contentRowsById, ds) {
    const allSections = (ds.sectionMappingByCourse.get(courseId) || [])
        .filter((r) => r.status === 'A' && r.section_type !== 'banner')
        .sort((a, b) => Number(a.section_position) - Number(b.section_position));

    if (!allSections.length && !contentRowsById) return '';

    // ── Textcontent fallback: if mapping IDs are stale use all course content ──
    const courseContentRows = [...contentRowsById.values()]
        .filter((r) => String(r.course_id ?? '').trim() === courseId && r.status === 'A')
        .sort((a, b) => Number(a.id) - Number(b.id));
    const validCourseContentIds = new Set(courseContentRows.map((r) => String(r.id).trim()));

    const tcSections     = allSections.filter((s) => s.section_type === 'textcontent');
    const hasValidTcMap  = tcSections.length > 0 &&
        tcSections.some((s) => validCourseContentIds.has(String(s.section_type_id).trim()));

    // Separate top (fixed) vs main (ordered) sections
    const topSections  = allSections.filter((s) => TOP_SECTION_TYPES.has(s.section_type));
    const mainSections = allSections.filter((s) => !TOP_SECTION_TYPES.has(s.section_type));

    // ── Build top-sections HTML ────────────────────────────────────────────────
    const topParts = [];

    // 1. Quick overview → quick-stats block
    const qoSection = topSections.find((s) => s.section_type === 'quick_overview');
    if (qoSection) {
        const qoHtml = renderQuickStats(String(qoSection.section_type_id).trim(), courseId, ds);
        if (qoHtml) topParts.push(qoHtml);
    }

    // 2. Program overview → key-highlights
    const poSection = topSections.find((s) => s.section_type === 'program_overview');
    if (poSection) {
        const poHtml = renderKeyHighlights(courseId, ds);
        if (poHtml) topParts.push(poHtml);
    }

    // 3. Promotional video → video cards
    const pvSection = topSections.find((s) => s.section_type === 'promotional_video');
    if (pvSection) {
        const pvHtml = renderPromoVideo(String(pvSection.section_type_id).trim(), courseId, ds);
        if (pvHtml) topParts.push(pvHtml);
    }

    // 4. Special section (raw HTML)
    const ssSection = topSections.find((s) => s.section_type === 'specialsection');
    if (ssSection) {
        const ssHtml = renderSpecialSection(String(ssSection.section_type_id).trim(), courseId, ds);
        if (ssHtml) topParts.push(ssHtml);
    }

    const ccTopHtml = `<div class="cc-main cc-top-sections">\n${topParts.join('\n')}\n</div>`;

    // ── Build main sections + sidebar ──────────────────────────────────────────
    const mainHtmlParts  = [];
    const navLinks       = [];
    let   tcFallbackDone = false;

    for (const s of mainSections) {
        const stype  = s.section_type;
        const sid    = String(s.section_type_id).trim();
        const inMenu = s.show_on_menu === 'Y';

        let html = '';
        let navHref = '';
        let navText = '';

        if (stype === 'textcontent') {
            if (hasValidTcMap) {
                if (validCourseContentIds.has(sid)) {
                    html = renderTextContentRow(contentRowsById.get(sid));
                    if (html && inMenu) {
                        const row = contentRowsById.get(sid);
                        const title = cleanText(row && row.content_title);
                        navHref = '#' + slugify(title);
                        navText = title;
                    }
                }
            } else if (!tcFallbackDone) {
                // Stale mapping → inject all course content at first tc position
                for (const row of courseContentRows) {
                    const h = renderTextContentRow(row);
                    if (h) {
                        mainHtmlParts.push(h);
                        if (inMenu) {
                            const title = cleanText(row.content_title);
                            navLinks.push(`<li><a class="nav-link" href="#${slugify(title)}">${escapeHtml(title)}</a></li>`);
                        }
                    }
                }
                tcFallbackDone = true;
                continue;
            } else {
                continue;
            }
        } else if (stype === 'faculty') {
            html = renderFaculty(sid, courseId, ds);
            if (html && inMenu) {
                const heading = 'Here are some of our faculty members';
                navHref = '#' + slugify(heading);
                navText = heading;
            }
        } else if (stype === 'academia_panel') {
            html = renderAcademiaPanel(sid, courseId, ds);
            if (html && inMenu) {
                const panel = ds.academiaPanelById.get(sid);
                const heading = cleanText(panel && panel.course_academia_panel_name) || 'Industry Academia Panel';
                navHref = '#' + slugify(heading);
                navText = heading;
            }
        } else if (stype === 'syllabus') {
            html = renderSyllabus(sid, courseId, ds);
            if (html && inMenu) {
                navHref = '#faq';
                navText = 'Syllabus';
            }
        } else if (stype === 'course_plan') {
            html = renderCoursePlan(courseId, ds);
            if (html && inMenu) {
                navHref = '#course-plan';
                navText = 'Course Plan';
            }
        } else if (stype === 'faq') {
            html = renderFaq(sid, courseId, ds);
            if (html && inMenu) {
                const faqRow = ds.courseFaqById.get(sid);
                const heading = cleanText(faqRow && faqRow.course_faq_name) || 'FAQ';
                navHref = '#' + slugify(heading);
                navText = heading;
            }
        } else if (stype === 'testimonials') {
            html = renderTestimonials(sid, courseId, ds);
            if (html && inMenu) {
                const tRow = ds.courseTestimonialsById.get(sid);
                const heading = cleanText(tRow && tRow.course_testimonial_name) || 'Testimonials';
                navHref = '#' + slugify(heading);
                navText = heading;
            }
        } else if (stype === 'video_testimonials') {
            html = renderVideoTestimonials(sid, courseId, ds);
            if (html && inMenu) {
                const vtRow = ds.courseVideoTestimonialsById.get(sid);
                const heading = cleanText(vtRow && vtRow.course_video_testimonial_name) || 'Success Stories';
                navHref = '#' + slugify(heading);
                navText = heading;
            }
        } else if (stype === 'industry') {
            html = renderIndustry(sid, courseId, ds);
            if (html && inMenu) {
                const indRow = ds.courseIndustryById.get(sid);
                const heading = cleanText(indRow && indRow.course_industry_name) || 'Industries';
                navHref = '#' + slugify(heading);
                navText = heading;
            }
        } else if (stype === 'forms') {
            html = renderForm(sid, courseId, ds);
            if (html && inMenu) {
                const fRow = ds.courseFormById.get(sid);
                const heading = cleanText(fRow && fRow.course_form_name) || 'Enquiry';
                navHref = '#' + slugify(heading);
                navText = heading;
            }
        } else if (stype === 'legal_expert') {
            html = renderLegalExpert(sid, courseId, ds);
            if (html && inMenu) {
                const leRow = ds.courseLegalExpertById.get(sid);
                const heading = cleanText(leRow && leRow.course_legal_expert_name) || 'Legal Expert';
                navHref = '#' + slugify(heading);
                navText = heading;
            }
        }
        // industry, forms → no CSV available, skip

        if (html) {
            mainHtmlParts.push(html);
            if (inMenu && navHref && navText) {
                navLinks.push(`<li><a class="nav-link" href="${navHref}">${escapeHtml(navText)}</a></li>`);
            }
        }
    }

    // Append any unfallback'd course content rows (no tc entries in mapping at all)
    if (!tcFallbackDone && tcSections.length === 0 && courseContentRows.length > 0) {
        for (const row of courseContentRows) {
            const h = renderTextContentRow(row);
            if (h) mainHtmlParts.push(h);
        }
    }

    if (!topParts.length && !mainHtmlParts.length) return '';

    const sidebarHtml = navLinks.length
        ? `<aside class="cc-sidebar">\n<nav>\n<ul class="cc-nav">\n${navLinks.join('\n')}\n</ul>\n</nav>\n</aside>`
        : '';

    const ccLayoutHtml = mainHtmlParts.length
        ? `<div class="cc-layout">\n${sidebarHtml}\n<div class="cc-sidebar-overlay">&nbsp;</div>\n<div class="cc-main">\n${mainHtmlParts.join('\n')}\n</div>\n</div>`
        : '';

    const rawHtml = [ccTopHtml, ccLayoutHtml].filter(Boolean).join('\n');
    return stripCssFromHtml(rawHtml);
}

// ─── Top section renderers ────────────────────────────────────────────────────

/**
 * quick_overview → <section class="quick-stats"> wrapping the raw HTML from content_details
 */
function renderQuickStats(sectionTypeId, courseId, ds) {
    const row = ds.quickOverviewById.get(sectionTypeId);
    if (!row) {
        // fallback: look up by course_id
        const fallback = ds.quickOverviewByCourseId && ds.quickOverviewByCourseId.get(courseId);
        if (!fallback || fallback.status !== 'A') return '';
        const details = cleanText(fallback.content_details);
        if (!details) return '';
        return `<section class="quick-stats" id="course-outcomes-top">\n${details}\n</section>`;
    }
    if (String(row.course_id ?? '').trim() !== courseId) return '';
    if (row.status !== 'A') return '';
    const details = cleanText(row.content_details);
    if (!details) return '';
    return `<section class="quick-stats" id="course-outcomes-top">\n${details}\n</section>`;
}

/**
 * program_overview → <section class="key-highlights"> with icon + text grid.
 * The JSON field program_overview_selected has shape:
 *   { "program_overview": [ {refId, icon, txt, allowed}, … ], "video_info": {…} }
 */
function renderKeyHighlights(courseId, ds) {
    const row = ds.programOverviewByCourseId && ds.programOverviewByCourseId.get(courseId);
    if (!row || row.status !== 'A') return '';

    const rawJson = cleanText(row.program_overview_selected);
    if (!rawJson) return '';

    let items = [];
    try {
        const parsed = JSON.parse(rawJson);
        const arr = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed.program_overview) ? parsed.program_overview : []);
        items = arr.filter((i) => Number(i.allowed) === 1);
    } catch (_) {
        return '';
    }

    if (!items.length) return '';

    const mid   = Math.ceil(items.length / 2);
    const left  = items.slice(0, mid);
    const right = items.slice(mid);

    const renderItem = (item) => {
        const icon    = cleanText(item.icon);
        const txt     = cleanText(item.txt);
        const iconSrc = icon
            ? `${S3}/uploads/program-overview/${encodeURIComponent(icon)}`
            : '';
        return (
            `<div class="kh-item">\n` +
            `<div class="kh-icon">${iconSrc ? `<img alt="" src="${iconSrc}" />` : ''}</div>\n` +
            `<div class="kh-text">${escapeHtml(txt)}</div>\n` +
            `</div>`
        );
    };

    const leftHtml  = left.map(renderItem).join('\n');
    const rightHtml = right.map(renderItem).join('\n');

    return (
        `<section class="key-highlights" id="key-highlights-top">\n` +
        `<div class="container">\n` +
        `<h2 class="kh-title"><span><img alt="Key Highlights" src="${S3}/images/course-details/keyhighlights.png" /></span>Key Highlights</h2>\n` +
        `<div class="kh-grid">\n` +
        `<div class="kh-col">\n${leftHtml}\n</div>\n` +
        `<div class="kh-col">\n${rightHtml}\n</div>\n` +
        `</div>\n</div>\n</section>`
    );
}

/**
 * promotional_video → video cards section.
 * promo_video_details is a JSON array:
 *   [{header_text, normal_text, youtube_link, image_name}, …]
 */
function renderPromoVideo(sectionTypeId, courseId, ds) {
    const row = ds.promoVideoById && ds.promoVideoById.get(sectionTypeId);
    if (!row) return '';
    if (String(row.course_id ?? '').trim() !== courseId) return '';
    if (row.status !== 'A') return '';

    const heading = cleanText(row.course_promo_video_name) || 'Promotional Videos';
    const rawJson = cleanText(row.promo_video_details);
    if (!rawJson) return '';

    let videos = [];
    try {
        const parsed = JSON.parse(rawJson);
        videos = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return '';
    }

    if (!videos.length) return '';

    const cards = videos.map((v) => {
        const headerText  = cleanText(v.header_text);
        const normalText  = cleanText(v.normal_text);
        const youtubeLink = cleanText(v.youtube_link);
        const imgName     = cleanText(v.image_name);
        const imgSrc      = imgName
            ? `${S3}/uploads/promotional-video-image/${encodeURIComponent(imgName)}`
            : '';

        const embedUrl = youtubeLink
            ? youtubeLink.replace('watch?v=', 'embed/')
            : '';

        return (
            `<div class="col-12 col-lg-4">\n` +
            `<div class="videowrp">\n` +
            `<a class="videoBox pop-blur youtubeVideoPopUp" href="${escapeHtml(embedUrl)}" tabindex="0">\n` +
            (imgSrc ? `<img loading="lazy" alt="Image" src="${imgSrc}" />\n` : '') +
            `</a>\n` +
            `<span class="vdoInfo">\n` +
            `<span>${escapeHtml(headerText)}</span>\n` +
            `<p>${escapeHtml(normalText)}</p>\n` +
            `</span>\n` +
            `</div>\n` +
            `</div>`
        );
    });

    const id = slugify(heading);
    return (
        `<div class="cc-subsection" id="${id || 'promotional-video'}">\n` +
        `<h2 class="cc-sub-title">${escapeHtml(heading)}</h2>\n` +
        `<div class="container-fluid features">\n` +
        `<div class="row">\n${cards.join('\n')}\n</div>\n` +
        `</div>\n` +
        `</div>`
    );
}

/** specialsection → raw HTML from content_details */
function renderSpecialSection(sectionTypeId, courseId, ds) {
    const row = ds.specialSectionById && ds.specialSectionById.get(sectionTypeId);
    if (!row) return '';
    if (String(row.course_id ?? '').trim() !== courseId) return '';
    if (row.status !== 'A') return '';
    const title   = cleanText(row.content_title);
    const details = cleanText(row.content_details);
    if (!title && !details) return '';
    const id = slugify(title);
    return (
        `<div class="cc-subsection cipp-detail-section"${id ? ` id="${id}"` : ''}>\n` +
        (title ? `<h2 class="cc-sub-title">${escapeHtml(title)}</h2>\n` : '') +
        `${details}\n` +
        `</div>`
    );
}

// ─── Main section renderers ───────────────────────────────────────────────────

/** Render a single tbl_course_content row as a cc-subsection block. */
function renderTextContentRow(row) {
    if (!row) return '';
    const title   = cleanText(row.content_title);
    const details = cleanText(row.content_details);
    if (!title && !details) return '';
    const id = slugify(title);
    return (
        `<div class="cc-subsection cipp-detail-section"${id ? ` id="${id}"` : ''}>\n` +
        `<h2 class="cc-sub-title">${escapeHtml(title)}</h2>\n` +
        `${details}\n` +
        `</div>`
    );
}

/**
 * faculty → tbl_course_faculty_mapping (has course_id) + tbl_faculty_master
 * Note: tbl_course_faculty (section header) is no longer available; we look up members
 * directly via course_id in the mapping table and use a default heading.
 */
function renderFaculty(sectionTypeId, courseId, ds) {
    // sectionTypeId is the old tbl_course_faculty.id — used only as the HTML anchor.
    // Members are fetched by course_id from faculty_mapping.
    const heading = 'Here are some of our faculty members';
    const id      = slugify(heading);

    const members = (ds.facultyMappingByCourseId.get(courseId) || [])
        .filter((m) => m.status === 'A')
        .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
        .map((m) => {
            const master = ds.facultyMasterById.get(String(m.faculty_id ?? '').trim());
            if (!master || master.status !== 'A') return '';
            const name        = cleanText(master.faculty_name);
            const designation = cleanText(master.faculty_designation);
            const linkedin    = cleanText(master.faculty_linkedin);
            const img         = cleanText(master.image_name);
            const imgSrc      = img
                ? `${S3}/uploads/faculty-master/thumbs/${encodeURIComponent(img)}`
                : '';
            const linkedinHtml = linkedin
                ? `\n<div class="profLink"><a href="${escapeHtml(linkedin)}"><img alt="LinkedIn" loading="lazy" src="${S3}/images/social-media/Linkedin.svg" /></a></div>`
                : '';
            return (
                `<div class="col-12 col-sm-6">\n` +
                `<div class="panelWrap">\n` +
                `<div class="panelImg">${imgSrc ? `<img alt="${escapeHtml(name)}" loading="lazy" src="${imgSrc}" />` : ''}</div>\n` +
                `<div class="panelText"><span>${escapeHtml(name)}</span>\n` +
                `<p>${escapeHtml(designation)}</p>${linkedinHtml}\n</div>\n` +
                `</div>\n</div>`
            );
        })
        .filter(Boolean);

    if (!members.length) return '';

    return (
        `<div class="cc-subsection"${id ? ` id="${id}"` : ''}>\n` +
        `<h2 class="cc-sub-title">${escapeHtml(heading)}</h2>\n` +
        `<div class="row">\n${members.join('\n')}\n</div>\n` +
        `<p><b>Note: </b> This is an indicative list of our guest faculty members and not an exhaustive list. We may change the faculty members at any point based on availability.</p>\n` +
        `</div>`
    );
}

/**
 * academia_panel → tbl_course_academia_panel (heading) + tbl_course_academia_panel_mapping
 * Note: tbl_industry_academia_master is not available; member details cannot be fetched.
 * We render the section heading only if the panel exists, with a placeholder list.
 */
function renderAcademiaPanel(sectionTypeId, courseId, ds) {
    const panel = ds.academiaPanelById.get(sectionTypeId);
    if (!panel) return '';
    if (String(panel.course_id ?? '').trim() !== courseId) return '';
    if (panel.status !== 'A') return '';

    const heading = cleanText(panel.course_academia_panel_name) || 'Industry Academia Panel';
    const id      = slugify(heading);

    // Get mapping rows for this panel — academia_panel_id refs a master we don't have,
    // so we render a placeholder entry for each mapping row.
    const mappingRows = (ds.academiaPanelMappingByPanelId.get(sectionTypeId) || [])
        .filter((m) => m.status === 'A')
        .sort((a, b) => {
            const pa = String(a.position ?? '').trim();
            const pb = String(b.position ?? '').trim();
            if (pa === 'NULL' || !pa) return 1;
            if (pb === 'NULL' || !pb) return -1;
            return Number(pa) - Number(pb);
        });

    if (!mappingRows.length) return '';

    // Attempt to render panel entries (without master details we show placeholder divs)
    const members = mappingRows.map((m) => {
        const apId = String(m.academia_panel_id ?? '').trim();
        return (
            `<div class="col-12 col-sm-6">\n` +
            `<div class="panelWrap">\n` +
            `<div class="panelImg"></div>\n` +
            `<div class="panelText"><span>Panel Member ${apId}</span>\n</div>\n` +
            `</div>\n</div>`
        );
    });

    return (
        `<div class="cc-subsection"${id ? ` id="${id}"` : ''}>\n` +
        `<h2 class="cc-sub-title">${escapeHtml(heading)}</h2>\n` +
        `<div class="row">\n${members.join('\n')}\n</div>\n` +
        `</div>`
    );
}

/**
 * syllabus → tbl_course_syllabus → tbl_syllabus_module → tbl_syllabus_chapter
 * Note: legacy renders with id="faq" (quirk preserved for sidebar link compatibility).
 */
function renderSyllabus(sectionTypeId, courseId, ds) {
    const syllabus = ds.courseSyllabusById.get(sectionTypeId);
    if (!syllabus) return '';
    if (String(syllabus.course_id ?? '').trim() !== courseId) return '';
    if (syllabus.status !== 'A') return '';

    const heading = cleanText(syllabus.course_syllabus_name) || 'Syllabus';

    const modules = (ds.syllabusModuleByCourseId.get(courseId) || [])
        .filter((m) => m.status === 'A');

    if (!modules.length) return '';

    let accIdx = 0;

    const moduleParts = modules.map((mod) => {
        accIdx++;
        const modName  = cleanText(mod.module_name);
        const moduleId = String(mod.id ?? '').trim();

        const chapters = (ds.syllabusChapterByModuleId.get(moduleId) || [])
            .filter((c) => c.status === 'A' && String(c.course_id ?? '').trim() === courseId)
            .map((c) => {
                const chapName = cleanText(c.chapter_name);
                const chapDesc = cleanText(c.chapter_description);
                if (!chapName) return '';
                const descHtml = chapDesc
                    ? `\n<div class="lession"><p>${chapDesc}</p></div>`
                    : '';
                return `<span class="chapter">${escapeHtml(chapName)}</span>${descHtml}`;
            })
            .filter(Boolean);

        return (
            `<div class="moduleWrap">\n` +
            `<section class="ac-container">\n` +
            `<div><input id="ac-${accIdx}" name="accordion-1" type="checkbox" />\n` +
            `<label for="ac-${accIdx}">${escapeHtml(modName.toUpperCase())}</label>\n` +
            `<article class="ac-small">${chapters.join('\n')}</article>\n` +
            `</div>\n</section>\n</div>`
        );
    });

    return (
        `<div class="cc-subsection cc-faq-wrap" id="faq">\n` +
        `<h2 class="cc-sub-title">${escapeHtml(heading)}</h2>\n` +
        `<div class="accordion" id="syllabus">\n` +
        `${moduleParts.join('\n')}\n` +
        `</div>\n</div>`
    );
}

/**
 * course_plan → tbl_course_plan_type_mapping JOIN tbl_course_plan_type_master
 * PHP: getCoursePlans — joins coursePlanMapModel with plan type master, ordered by course_plan_position.
 */
function renderCoursePlan(courseId, ds) {
    const plans = (ds.coursePlanTypeMappingByCourseId.get(courseId) || [])
        .filter((p) => p.status === 'A')
        .sort((a, b) => Number(a.course_plan_position || 0) - Number(b.course_plan_position || 0));

    if (!plans.length) return '';

    const planBoxes = plans.map((plan) => {
        const typeId   = String(plan.course_plan_type_id ?? '').trim();
        const master   = ds.coursePlanTypeMasterById.get(typeId);
        const typeName = cleanText(master && master.course_plan_type_name) || 'Plan';
        const price    = cleanText(plan.orginal_price) || '0';
        const promoPrice = cleanText(plan.promotional_price);
        const showPromo  = String(plan.show_promo_price ?? '').trim().toUpperCase() === 'Y' && promoPrice;
        const desc     = cleanText(plan.description);

        const cssClass = PLAN_CSS_CLASS[typeName.toLowerCase()] || slugify(typeName);

        const btnSignUp   = String(plan.btn_sign_up   ?? '').trim().toUpperCase() === 'Y';
        const btnEnrollNow = String(plan.btn_enroll_now ?? '').trim().toUpperCase() === 'Y';

        const descRows = desc
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => `<p>${line}</p>`)
            .join('\n');

        const priceDisplay = showPromo
            ? `<span>RS. ${escapeHtml(promoPrice)}</span> <del>RS. ${escapeHtml(price)}</del>`
            : `<span>RS. ${escapeHtml(price)}</span>`;

        const actionBtns = [
            btnSignUp    ? `<a class="cp-enroll-btn" href="#" id="join-waitlist-btn">Join the waitlist</a>` : '',
            btnEnrollNow ? `<a class="cp-enroll-btn" href="#" id="enroll-now-btn">Enroll now</a>` : '',
        ].filter(Boolean).join(' ');

        return (
            `<div class="planBox ${escapeHtml(cssClass)}">\n` +
            `<div>\n` +
            `<div class="planColor">\n` +
            `<div class="planWithBtn"><span>${escapeHtml(typeName)}&nbsp;</span></div>\n` +
            `<div class="planPrice" data-fees="${escapeHtml(price)}">${priceDisplay} incl. of all charges</div>\n` +
            `</div>\n` +
            `<div class="planDetails"><div class="ul">\n${descRows}\n</div></div>\n` +
            `</div>\n` +
            (actionBtns ? `<p>${actionBtns}</p>\n` : '') +
            `</div>`
        );
    });

    return (
        `<div class="cc-subsection" id="course-plan">\n` +
        `<h2 class="cc-sub-title">Course Plan</h2>\n` +
        `<p class="cc-para">Above prices are inclusive of all applicable taxes and charges.</p>\n` +
        `${planBoxes.join('\n')}\n` +
        `</div>`
    );
}

/** faq → tbl_course_faq + tbl_frequently_asked_question */
function renderFaq(sectionTypeId, courseId, ds) {
    const faqSection = ds.courseFaqById.get(sectionTypeId);
    if (!faqSection) return '';
    if (String(faqSection.course_id ?? '').trim() !== courseId) return '';
    if (faqSection.status !== 'A') return '';

    const heading = cleanText(faqSection.course_faq_name) || 'Frequently Asked Questions (FAQs)';
    const id      = slugify(heading);

    const questions = (ds.faqQuestionsByCourseId.get(courseId) || [])
        .filter((q) => q.status === 'A')
        .sort((a, b) => Number(a.faq_position || 0) - Number(b.faq_position || 0))
        .map((q) => {
            const question = cleanText(q.question);
            const answer   = cleanText(q.answer);
            if (!question) return '';
            return (
                `<div class="faq-item">\n` +
                `<h3 class="faq-question">${escapeHtml(question)}</h3>\n` +
                `<div class="faq-answer">${answer}</div>\n` +
                `</div>`
            );
        })
        .filter(Boolean);

    if (!questions.length) return '';

    return (
        `<div class="cc-subsection cc-faq-wrap"${id ? ` id="${id}"` : ''}>\n` +
        `<h2 class="cc-sub-title">${escapeHtml(heading)}</h2>\n` +
        `${questions.join('\n')}\n` +
        `</div>`
    );
}

/**
 * testimonials → tbl_course_testimonials (section header) + tbl_testimonials_master
 * PHP: getTestimonials — lookup section by id + course_id, then all master rows
 * for the course ordered by testimonials_position ASC.
 */
function renderTestimonials(sectionTypeId, courseId, ds) {
    const section = ds.courseTestimonialsById.get(sectionTypeId);
    if (!section) return '';
    if (String(section.course_id ?? '').trim() !== courseId) return '';
    if (section.status !== 'A') return '';

    const heading = cleanText(section.course_testimonial_name) || 'Testimonials';
    const id      = slugify(heading);

    const testimonials = (ds.testimonialsMasterByCourseId.get(courseId) || [])
        .filter((t) => t.status === 'A')
        .sort((a, b) => Number(a.testimonials_position || 0) - Number(b.testimonials_position || 0))
        .map((t) => {
            const reviewer    = cleanText(t.reviewer);
            const details     = cleanText(t.reviewer_details);
            const testimonial = cleanHtml(cleanText(t.testimonials));
            return (
                `<div class="testimonialWrap">\n` +
                `<div class="testimonialText"><p>${testimonial}</p></div>\n` +
                `<div class="testimonialAuthor"><span>${escapeHtml(reviewer)}</span><p>${escapeHtml(details)}</p></div>\n` +
                `</div>`
            );
        });

    if (!testimonials.length) return '';

    return (
        `<div class="cc-subsection"${id ? ` id="${id}"` : ''}>\n` +
        `<h2 class="cc-sub-title">${escapeHtml(heading)}</h2>\n` +
        `<div class="row">\n${testimonials.join('\n')}\n</div>\n` +
        `</div>`
    );
}

/**
 * video_testimonials → tbl_course_video_testimonials (section header with JSON selection)
 *                    + tbl_video_testimonials_master (actual video data)
 * PHP: getVideoTestimonials — lookup section by id + course_id, parse
 * testimonials_selected JSON to filter IDs, parse testimonials_order JSON for
 * ordering (falls back to vdo_testimonials_position ASC).
 */
function renderVideoTestimonials(sectionTypeId, courseId, ds) {
    const section = ds.courseVideoTestimonialsById.get(sectionTypeId);
    if (!section) return '';
    if (String(section.course_id ?? '').trim() !== courseId) return '';
    if (section.status !== 'A') return '';

    const heading = cleanText(section.course_video_testimonial_name) || 'Success Stories';
    const id      = slugify(heading);

    let videos = (ds.videoTestimonialsMasterByCourseId.get(courseId) || [])
        .filter((v) => v.status === 'A');

    // Filter by testimonials_selected JSON (array of IDs)
    const selectedRaw = cleanText(section.testimonials_selected);
    if (selectedRaw) {
        try {
            const selectedIds = new Set(JSON.parse(selectedRaw).map(String));
            videos = videos.filter((v) => selectedIds.has(String(v.id ?? '').trim()));
        } catch (_) { /* keep all */ }
    }

    // Order by testimonials_order JSON, else by vdo_testimonials_position
    const orderRaw = cleanText(section.testimonials_order);
    if (orderRaw) {
        try {
            const orderIds = JSON.parse(orderRaw).map(String);
            const orderMap = new Map(orderIds.map((vid, idx) => [vid, idx]));
            videos.sort((a, b) =>
                (orderMap.get(String(a.id ?? '').trim()) ?? 9999) -
                (orderMap.get(String(b.id ?? '').trim()) ?? 9999),
            );
        } catch (_) {
            videos.sort((a, b) => Number(a.vdo_testimonials_position || 0) - Number(b.vdo_testimonials_position || 0));
        }
    } else {
        videos.sort((a, b) => Number(a.vdo_testimonials_position || 0) - Number(b.vdo_testimonials_position || 0));
    }

    if (!videos.length) return '';

    const cards = videos.map((v) => {
        const reviewer = cleanText(v.reviewer);
        const videoUrl = cleanText(v.video_url);
        return (
            `<div class="videoTestimonialWrap">\n` +
            `<div class="videoUrl"><a href="${escapeHtml(videoUrl)}" target="_blank">${escapeHtml(reviewer)}</a></div>\n` +
            `</div>`
        );
    });

    return (
        `<div class="cc-subsection"${id ? ` id="${id}"` : ''}>\n` +
        `<h2 class="cc-sub-title">${escapeHtml(heading)}</h2>\n` +
        `<div class="row">\n${cards.join('\n')}\n</div>\n` +
        `</div>`
    );
}

/**
 * legal_expert → tbl_course_legal_expert + tbl_legal_expert
 * PHP: getLegalExports — course_specific=N uses course_id=13 (generic experts).
 */
function renderLegalExpert(sectionTypeId, courseId, ds) {
    const section = ds.courseLegalExpertById.get(sectionTypeId);
    if (!section) return '';
    if (String(section.course_id ?? '').trim() !== courseId) return '';
    if (section.status !== 'A') return '';

    const heading        = cleanText(section.course_legal_expert_name) || 'Legal Expert';
    const id             = slugify(heading);
    const courseSpecific = String(section.course_specific || '').trim().toUpperCase();
    const lookupId       = courseSpecific === 'N' ? '13' : courseId;

    const experts = (ds.legalExpertByCourseId.get(lookupId) || [])
        .filter((e) => e.status === 'A')
        .sort((a, b) =>
            courseSpecific === 'N'
                ? Number(b.id) - Number(a.id)
                : String(a.sequence_tag || '').localeCompare(String(b.sequence_tag || '')),
        )
        .map((e) => {
            const name        = cleanText(e.legal_expert_name);
            const designation = cleanText(e.legal_expert_designation);
            const img         = cleanText(e.image_name);
            const imgSrc      = img
                ? `${S3}/uploads/legal-expert/thumbs/${encodeURIComponent(img)}`
                : '';
            return (
                `<div class="col-12 col-sm-6">\n` +
                `<div class="panelWrap">\n` +
                `<div class="panelImg">${imgSrc ? `<img alt="${escapeHtml(name)}" loading="lazy" src="${imgSrc}" />` : ''}</div>\n` +
                `<div class="panelText"><span>${escapeHtml(name)}</span>\n<p>${escapeHtml(designation)}</p>\n</div>\n` +
                `</div>\n</div>`
            );
        })
        .filter(Boolean);

    if (!experts.length) return '';

    return (
        `<div class="cc-subsection"${id ? ` id="${id}"` : ''}>\n` +
        `<h2 class="cc-sub-title">${escapeHtml(heading)}</h2>\n` +
        `<div class="row">\n${experts.join('\n')}\n</div>\n` +
        `</div>`
    );
}

/**
 * industry → tbl_course_industry (section header) + tbl_course_industry_mapping
 * PHP: getIndustries — lookup section by id + course_id, then mapping rows by
 * course_industry_id + course_id + status='A'. Selects d.industry_name, d.image_name
 * from the industry master (not available as CSV — renders names not available).
 */
function renderIndustry(sectionTypeId, courseId, ds) {
    const section = ds.courseIndustryById.get(sectionTypeId);
    if (!section) return '';
    if (String(section.course_id ?? '').trim() !== courseId) return '';
    if (section.status !== 'A') return '';

    const heading = cleanText(section.course_industry_name) || 'Industries';
    const id      = slugify(heading);

    const mappingRows = (ds.courseIndustryMappingByIndustryId.get(sectionTypeId) || [])
        .filter((m) => m.status === 'A' && String(m.course_id ?? '').trim() === courseId);

    if (!mappingRows.length) return '';

    // industry master (tbl_industry_master) is not in CSV export; render industry IDs as placeholder tags
    const tags = mappingRows.map((m) => {
        const indId = cleanText(m.industries_id);
        return `<span class="industry-tag" data-id="${escapeHtml(indId)}">Industry #${escapeHtml(indId)}</span>`;
    });

    return (
        `<div class="cc-subsection"${id ? ` id="${id}"` : ''}>\n` +
        `<h2 class="cc-sub-title">${escapeHtml(heading)}</h2>\n` +
        `<div class="industry-tags">\n${tags.join('\n')}\n</div>\n` +
        `</div>`
    );
}

/**
 * forms (section_type = 'forms') → tbl_course_form only
 * PHP: getForms — looks up the course form row by sectionTypeId + courseId.
 * form_id from the row is used as the data-form-id attribute so the new
 * system can embed the correct form widget.
 */
function renderForm(sectionTypeId, courseId, ds) {
    const section = ds.courseFormById.get(sectionTypeId);
    if (!section) return '';
    if (String(section.course_id ?? '').trim() !== courseId) return '';
    if (section.status !== 'A') return '';

    const heading = cleanText(section.course_form_name) || 'Enquiry Form';
    const id      = slugify(heading);
    const formId  = cleanText(section.form_id);

    return (
        `<div class="cc-subsection"${id ? ` id="${id}"` : ''}>\n` +
        `<h2 class="cc-sub-title">${escapeHtml(heading)}</h2>\n` +
        `<div class="cc-form-wrap"${formId ? ` data-form-id="${escapeHtml(formId)}"` : ''}>\n` +
        `</div>\n` +
        `</div>`
    );
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function indexBy(rows, key) {
    const map = new Map();
    for (const row of rows) {
        const k = String(row[key] ?? '').trim();
        if (k) map.set(k, row);
    }
    return map;
}

function groupBy(rows, key) {
    const map = new Map();
    for (const row of rows) {
        const k = String(row[key] ?? '').trim();
        if (!k) continue;
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(row);
    }
    return map;
}

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function cleanText(value) {
    if (value === null || value === undefined) return '';
    const s = String(value);
    return s.toUpperCase() === 'NULL' ? '' : s.trim();
}

function cleanHtml(html) {
    if (!html) return '';
    // Remove empty p tags
    return html.replace(/<p>\s*<\/p>/gi, '').trim();
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function stripCssFromHtml(html) {
    if (!html) return '';

    return String(html)
        // remove embedded stylesheet blocks
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        // remove inline style attributes only (keep classes/HTML structure unchanged)
        .replace(/\sstyle="[^"]*"/gi, '')
        .replace(/\sstyle='[^']*'/gi, '');
}

module.exports = { loadSectionDatasets, buildSectionContentMap };
