const db = require('./db/db');

async function run() {
  try {
    await db.query("ALTER TABLE attendance ALTER COLUMN punch_in_time TYPE TIMESTAMPTZ USING punch_in_time AT TIME ZONE 'UTC'");
    await db.query("ALTER TABLE attendance ALTER COLUMN punch_out_time TYPE TIMESTAMPTZ USING punch_out_time AT TIME ZONE 'UTC'");
    console.log('Database updated successfully.');
  } catch(e) {
    console.error('Error updating db:', e);
  } finally {
    process.exit();
  }
}

run();
