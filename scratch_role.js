const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function update() {
  try {
    const res1 = await pool.query(
      `UPDATE users SET role = 'founder' WHERE name ILIKE '%abhijeet%' RETURNING id, name, role`
    );
    console.log('Updated Abhijeet:', res1.rows);
    
    const res2 = await pool.query(
      `UPDATE users SET role = 'founder' WHERE name ILIKE '%vishwas%' RETURNING id, name, role`
    );
    console.log('Updated Vishwas:', res2.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

update();
