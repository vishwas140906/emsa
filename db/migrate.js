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
    await connection.query("ALTER TABLE attendance MODIFY COLUMN status ENUM('present', 'absent', 'pending_punchout', 'half_day', 'leave') DEFAULT 'pending_punchout'");
    console.log("Updated status enum");
    await connection.query("ALTER TABLE attendance ADD COLUMN hours_worked DECIMAL(5,2) NULL");
    console.log("Added hours_worked column");
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log("Column already exists, skipping.");
    } else {
      console.error(err);
    }
  }
  
  await connection.end();
}

run();
