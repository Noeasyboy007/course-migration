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
            content: path.join(ROOT_DIR, 'csv', 'tbl_course_content.csv'),
            courseType: path.join(ROOT_DIR, 'csv', 'tbl_course_type.csv'),
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
