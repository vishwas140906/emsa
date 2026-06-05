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
      SET hours_worked = TIMESTAMPDIFF(MINUTE, punch_in_time, punch_out_time) / 60 
      WHERE punch_in_time IS NOT NULL AND punch_out_time IS NOT NULL AND hours_worked IS NULL
    `);
    console.log("Updated records:", result.affectedRows);
  } catch (err) {
    console.error(err);
  }
  
  await connection.end();
}

run();
