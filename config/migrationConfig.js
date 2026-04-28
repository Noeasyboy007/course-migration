const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const ROOT_DIR = process.cwd();

function getRequiredEnv(name) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

function getMigrationConfig() {
    return {
        rootDir: ROOT_DIR,
        csv: {
            course: path.join(ROOT_DIR, 'csv', 'tbl_course.csv'),
            banner: path.join(ROOT_DIR, 'csv', 'tbl_course_banner.csv'),
            content: path.join(ROOT_DIR, 'content-csv', 'tbl_course_content.csv'),
            courseType: path.join(ROOT_DIR, 'csv', 'tbl_course_type.csv'),
        },
        contentCsv: {
            // course section mapping
            sectionMapping:          path.join(ROOT_DIR, 'content-csv', 'tbl_course_section_type_mapping.csv'),
            // course program overview
            programOverview:         path.join(ROOT_DIR, 'content-csv', 'tbl_course_program_overview.csv'),
            // course promotional video
            promoVideo:              path.join(ROOT_DIR, 'content-csv', 'tbl_course_promo_video_section.csv'),
            // course academia panel
            academiaPanel:           path.join(ROOT_DIR, 'content-csv', 'tbl_course_academia_panel.csv'),
            academiaPanelMapping:    path.join(ROOT_DIR, 'content-csv', 'tbl_course_academia_panel_mapping.csv'),
            // faculty: tbl_course_faculty_mapping has course_id + faculty_id directly; tbl_faculty_master for details
            facultyMapping:          path.join(ROOT_DIR, 'content-csv', 'tbl_course_faculty_mapping.csv'),
            facultyMaster:           path.join(ROOT_DIR, 'content-csv', 'tbl_faculty_master.csv'),
            // faq
            courseFaq:               path.join(ROOT_DIR, 'content-csv', 'tbl_course_faq.csv'),
            faqQuestions:            path.join(ROOT_DIR, 'content-csv', 'tbl_frequently_asked_question.csv'),
            // course syllabus
            courseSyllabus:          path.join(ROOT_DIR, 'content-csv', 'tbl_course_syllabus.csv'),
            syllabusModule:          path.join(ROOT_DIR, 'content-csv', 'tbl_syllabus_module.csv'),
            syllabusChapter:         path.join(ROOT_DIR, 'content-csv', 'tbl_syllabus_chapter.csv'),
            // course quick overview
            quickOverview:           path.join(ROOT_DIR, 'content-csv', 'tbl_course_quick_overview.csv'),
            // course special section
            specialSection:          path.join(ROOT_DIR, 'content-csv', 'tbl_course_special_section.csv'),
            // course legal expert
            courseLegalExpert:       path.join(ROOT_DIR, 'content-csv', 'tbl_course_legal_expert.csv'),
            legalExpert:             path.join(ROOT_DIR, 'content-csv', 'tbl_legal_expert.csv'),
            // course testimonials
            courseTestimonials:      path.join(ROOT_DIR, 'content-csv', 'tbl_course_testimonials.csv'),
            testimonialsMaster:      path.join(ROOT_DIR, 'content-csv', 'tbl_testimonials_master.csv'),
            // course video testimonials
            courseVideoTestimonials: path.join(ROOT_DIR, 'content-csv', 'tbl_course_video_testimonials.csv'),
            videoTestimonialsMaster: path.join(ROOT_DIR, 'content-csv', 'tbl_video_testimonials_master.csv'),
            // course industry
            courseIndustry:          path.join(ROOT_DIR, 'content-csv', 'tbl_course_industry.csv'),
            courseIndustryMapping:   path.join(ROOT_DIR, 'content-csv', 'tbl_course_industry_mapping.csv'),
            // forms
            courseForm:              path.join(ROOT_DIR, 'content-csv', 'tbl_course_form.csv'),
            // course plan type
            coursePlanTypeMapping:   path.join(ROOT_DIR, 'content-csv', 'tbl_course_plan_type_mapping.csv'),
            coursePlanTypeMaster:    path.join(ROOT_DIR, 'content-csv', 'tbl_course_plan_type_master.csv'),
        },
        mappingFile: path.join(ROOT_DIR, 'newSystemApi', 'courseMap.json'),
        target: {
            baseUrl: getRequiredEnv('BASE_URL'),
            token: getRequiredEnv('TOKEN'),
        },
    };
}

module.exports = {
    getMigrationConfig,
};
