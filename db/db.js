const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let dbConfig;
if (process.env.DATABASE_URL) {
  dbConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  };
} else {
  dbConfig = {
    host: process.env.PGHOST || process.env.DB_HOST || '127.0.0.1',
    user: process.env.PGUSER || process.env.DB_USER || 'postgres',
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.PGDATABASE || process.env.DB_NAME || 'ems_db',
    port: process.env.PGPORT || process.env.DB_PORT || 5432,
  };
  
  // Basic check for Supabase / Cloud hosted DBs which usually require SSL
  if (dbConfig.host.includes('supabase') || dbConfig.host.includes('aws') || dbConfig.host.includes('render')) {
    dbConfig.ssl = { rejectUnauthorized: false };
  }
}

let pool;

async function getPool() {
  if (!pool) {
    try {
      pool = new Pool(dbConfig);
      
      // Load and execute the schema script
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      
      await pool.query(schemaSql);
      
      // Auto-migrate to add missing columns
      try {
        await pool.query("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS hours_worked DECIMAL(5,2) NULL");
      } catch (err) {
        console.error("Migration warning (hours_worked):", err.message);
      }
      
      console.log('PostgreSQL database connection pool and schema initialized.');
    } catch (error) {
      console.error('Database connection or initialization failed:', error);
      throw error;
    }
  }
  return pool;
}

module.exports = {
  getPool,
  query: async (sql, params = []) => {
    const activePool = await getPool();
    
    // Automatically convert MySQL ? placeholders to PostgreSQL $1, $2 placeholders
    let index = 1;
    const pgSql = sql.replace(/\?/g, () => `$${index++}`);
    
    const { rows } = await activePool.query(pgSql, params);
    return rows;
  }
};
