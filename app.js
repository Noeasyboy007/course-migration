const express = require('express');
const colors = require('colors');
const dotenv = require('dotenv');
const cors = require('cors');
const courseMigrationRoutes = require('./routes/courseMigrationRoutes');
const app = express();

app.use(cors());

dotenv.config();

const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use('/api/course-migration', courseMigrationRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Course migration service is running.',
    });
});

app.listen(PORT, async () => {
    console.log(`Server Started at Port ${PORT}`.bgGreen);
})
