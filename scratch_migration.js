const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  try {
    console.log('Dropping old role check constraint...');
    await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
    
    console.log('Adding new role check constraint...');
    await pool.query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('founder', 'tl', 'intern', 'admin'))");
    
    console.log('Adding employee_id column...');
    // We add it without UNIQUE constraint first, so we can backfill
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50)');
    
    console.log('Backfilling employee_id for existing users...');
    await pool.query("UPDATE users SET employee_id = 'EMP-' || id WHERE employee_id IS NULL");
    
    console.log('Applying UNIQUE constraint to employee_id...');
    await pool.query('ALTER TABLE users ADD CONSTRAINT users_employee_id_unique UNIQUE (employee_id)');
    
    console.log('Defaulting missing/invalid roles to intern...');
    await pool.query("UPDATE users SET role = 'intern' WHERE role NOT IN ('founder', 'tl', 'admin')");

    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    pool.end();
  }
}

migrate();
