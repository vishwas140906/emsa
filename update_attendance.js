const db = require('./db/db');

async function markPresent() {
  const updates = [
    { namePattern: '%mois%', date: '2026-06-11' },
    { namePattern: '%mois%', date: '2026-06-12' },
    { namePattern: '%vinay%g%', date: '2026-06-12' }
  ];

  try {
    for (const update of updates) {
      const sql = `
        INSERT INTO attendance (
          user_id, work_date, punch_in_time, punch_out_time, 
          status, hours_worked
        )
        SELECT 
          id, 
          $1, 
          $2, 
          $3, 
          'present', 
          9.0
        FROM users 
        WHERE name ILIKE $4 OR email ILIKE $4
        ON CONFLICT (user_id, work_date) 
        DO UPDATE SET 
          punch_in_time = EXCLUDED.punch_in_time, 
          punch_out_time = EXCLUDED.punch_out_time, 
          status = EXCLUDED.status, 
          hours_worked = EXCLUDED.hours_worked;
      `;
      
      console.log(`Marking ${update.namePattern} present for ${update.date}...`);
      await db.query(sql, [
        update.date, 
        `${update.date} 09:00:00`, 
        `${update.date} 18:00:00`, 
        update.namePattern
      ]);
    }
    
    console.log("Successfully updated attendance.");
    process.exit(0);
  } catch (err) {
    console.error("Error updating attendance:", err);
    process.exit(1);
  }
}

markPresent();
