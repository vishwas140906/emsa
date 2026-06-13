const db = require('./db/db');

async function test() {
  try {
    const logs = await db.query(
      "SELECT id, punch_in_time FROM attendance WHERE status = 'pending_punchout' LIMIT 1"
    );
    if (logs.length === 0) {
      console.log('No pending punchout found');
      return;
    }
    const attendanceId = logs[0].id;
    const punchInTime = new Date(logs[0].punch_in_time);
    const punchOutTime = new Date();
    const hoursWorked = (punchOutTime - punchInTime) / (1000 * 60 * 60);
    let finalStatus = 'present';

    let incompleteReason = null;

    console.log('Running query...', [punchOutTime, incompleteReason, finalStatus, hoursWorked, attendanceId]);

    await db.query(
      `UPDATE attendance SET punch_out_time = ?, incomplete_reason = ?, status = ?, hours_worked = ? WHERE id = ?`,
      [punchOutTime, incompleteReason, finalStatus, hoursWorked, attendanceId]
    );

    console.log('Query successful');
  } catch(e) {
    console.error('Error:', e);
  } finally {
    process.exit();
  }
}

test();
