const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function update() {
  try {
    const res = await pool.query(
      `UPDATE attendance SET status = 'present', admin_notes = 'Manually updated to present by Admin' WHERE user_id = 5 AND work_date = '2026-06-06' RETURNING *`
    );
    console.log('Updated:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

update();
