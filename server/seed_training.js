// Copyright © 2026 Trier OS. All Rights Reserved.
const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'trier_logistics.db');
const Database = require('better-sqlite3');
const db = new Database(dbPath);

console.log('Seeding training records into trier_logistics.db ...');

try {
    const courses = db.prepare('SELECT id, code, title, validity_days FROM training_courses').all();
    if (courses.length === 0) {
        console.log('No courses found! Ensure server booted once to seed courses.');
        process.exit(1);
    }

    const insertRecord = db.prepare(`
        INSERT INTO training_records (user_id, user_name, department, plant_id, course_id, course_code, course_title, completed_date, expires_date, score, passed, trainer)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let plantsArr = ['Plant_1', 'Plant_2', 'Corporate_Office', 'examples'];

    const departments = ['Maintenance', 'Production', 'Logistics', 'Quality', 'Engineering'];
    const names = ['John Doe', 'Jane Smith', 'Mike Johnson', 'Emily Davis', 'Bill Thompson', 'Sarah Adams', 'Tom Wilson', 'Lisa Taylor'];
    const instructors = ['Safety Officer Dan', 'HR Manager Bob', 'External Consultant'];

    let recordsCreated = 0;
    const now = new Date();

    db.exec('BEGIN TRANSACTION;');

    for (const plant of plantsArr) {
        // Create ~15 simulated employees per plant
        for (let i = 1; i <= 15; i++) {
            const userName = names[Math.floor(Math.random() * names.length)] + ' ' + i;
            const userId = 'USR-' + plant.substring(0,3).toUpperCase() + '-' + (i * 10).toString().padStart(4, '0');
            const dept = departments[Math.floor(Math.random() * departments.length)];

            // Give each employee 3 to 8 courses
            const numCourses = Math.floor(Math.random() * 6) + 3;
            for (let c = 0; c < numCourses; c++) {
                const course = courses[Math.floor(Math.random() * courses.length)];
                
                // Random completion date between 2 years ago and now
                const daysAgo = Math.floor(Math.random() * 700);
                const compDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
                
                let expDate = null;
                if (course.validity_days) {
                    expDate = new Date(compDate.getTime() + (course.validity_days * 24 * 60 * 60 * 1000));
                }

                const score = 80 + Math.floor(Math.random() * 20); // 80-100
                const passed = 1;
                const instructor = instructors[Math.floor(Math.random() * instructors.length)];

                insertRecord.run(
                    userId,
                    userName,
                    dept,
                    plant,
                    course.id,
                    course.code,
                    course.title,
                    compDate.toISOString().split('T')[0],
                    expDate ? expDate.toISOString().split('T')[0] : null,
                    score,
                    passed,
                    instructor
                );
                recordsCreated++;
            }
        }
    }

    db.exec('COMMIT;');
    console.log(`✅ Successfully seeded ${recordsCreated} training certification records across ${plantsArr.length} plants.`);

} catch (e) {
    console.error('An error occurred:', e);
} finally {
    db.close();
}
