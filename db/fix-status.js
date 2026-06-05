require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  try {
    const [result] = await connection.query(`
      UPDATE attendance 
      SET status = CASE 
        WHEN hours_worked < 4 THEN 'leave'
        WHEN hours_worked >= 4 AND hours_worked < 8 THEN 'half_day'
        ELSE 'present'
      END
      WHERE hours_worked IS NOT NULL AND admin_notes IS NULL
    `);
    console.log("Updated statuses:", result.affectedRows);
  } catch (err) {
    console.error(err);
  }
  
  await connection.end();
}

run();
