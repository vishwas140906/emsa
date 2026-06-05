const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('./db/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Set static assets folder
app.use(express.static(path.join(__dirname, 'public')));

// Setup view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'ems_session_secret_9988112233',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24, // 24 Hours session
    secure: false // Set to true if running HTTPS
  }
}));

// Global user local variable for EJS templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.error = null;
  res.locals.success = null;
  next();
});

// Authentication Middleware
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      // User is authenticated but lacks the specific role
      // Redirect to root, which will bounce them to their correct dashboard
      return res.redirect('/?error=' + encodeURIComponent('Access Denied. Insufficient permissions.'));
    }
    next();
  };
};

// Helper: Format a Date object to local YYYY-MM-DD string
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper: Save Base64 captured frame to disk
function saveBase64Image(base64Str, userId) {
  const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid photo format');
  }
  
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `punch_${userId}_${Date.now()}.jpg`;
  const uploadDir = path.join(__dirname, 'public', 'uploads', 'punches');
  
  // Create directories if they do not exist
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  fs.writeFileSync(path.join(uploadDir, filename), buffer);
  return filename;
}

// Helper: Calculate streak (skips Sundays, breaks on past unpunched days / absent days)
async function calculateStreak(userId) {
  try {
    const userRows = await db.query("SELECT TO_CHAR(onboarding_date, 'YYYY-MM-DD') AS ob_date_str FROM users WHERE id = ?", [userId]);
    const onboardingDateStr = userRows.length > 0 ? userRows[0].ob_date_str : null;

    const records = await db.query(
      "SELECT TO_CHAR(work_date, 'YYYY-MM-DD') AS work_date_str, status FROM attendance WHERE user_id = ? ORDER BY work_date DESC",
      [userId]
    );

    const statusMap = {};
    records.forEach(r => {
      statusMap[r.work_date_str] = r.status;
    });

    let streak = 0;
    let dateCursor = new Date(); // Start today
    let active = true;

    for (let i = 0; i < 60; i++) {
      const cursorStr = formatLocalDate(dateCursor);
      
      if (onboardingDateStr && cursorStr < onboardingDateStr) {
        break; // Stop counting streak before onboarding date
      }

      const dayOfWeek = dateCursor.getDay(); // 0 is Sunday

      // Skip Sunday (doesn't break the streak, doesn't increment count)
      if (dayOfWeek === 0) {
        dateCursor.setDate(dateCursor.getDate() - 1);
        continue;
      }

      const status = statusMap[cursorStr];

      if (status === 'present') {
        streak++;
      } else if (status === 'pending_punchout' && cursorStr === formatLocalDate(new Date())) {
        // Punched in today but not checked out - streak is still active
      } else {
        // If they have not punched in today, check if yesterday was present.
        if (cursorStr === formatLocalDate(new Date())) {
          dateCursor.setDate(dateCursor.getDate() - 1);
          continue;
        }
        active = false;
        break;
      }

      dateCursor.setDate(dateCursor.getDate() - 1);
    }
    return streak;
  } catch (err) {
    console.error('Streak calc error:', err);
    return 0;
  }
}

// Helper: Build Month Calendar Cells
async function getCalendarDays(userId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const numDays = lastDayOfMonth.getDate();
  // day of week of 1st day (0 = Sunday, 1 = Monday ... 6 = Saturday)
  // Shift Sunday to the end of our columns: Mon(0), Tue(1)... Sat(5), Sun(6)
  let firstDayIndex = firstDayOfMonth.getDay(); 
  firstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Align Mon-Sun

  const userRows = await db.query("SELECT TO_CHAR(onboarding_date, 'YYYY-MM-DD') AS ob_date_str FROM users WHERE id = ?", [userId]);
  const onboardingDateStr = userRows.length > 0 ? userRows[0].ob_date_str : null;

  // Query records for the current month with formatted dates
  const records = await db.query(
    `SELECT *, TO_CHAR(work_date, 'YYYY-MM-DD') AS work_date_str FROM attendance 
     WHERE user_id = ? 
     AND EXTRACT(YEAR FROM work_date) = ? 
     AND EXTRACT(MONTH FROM work_date) = ?`,
    [userId, year, month + 1]
  );

  const attendanceMap = {};
  records.forEach(r => {
    attendanceMap[r.work_date_str] = r;
  });

  const cells = [];

  // 1. Add empty padding cells for the grid offset
  for (let i = 0; i < firstDayIndex; i++) {
    cells.push({ type: 'empty' });
  }

  // 2. Add days of the month
  const todayStr = formatLocalDate(now);

  for (let d = 1; d <= numDays; d++) {
    const cellDate = new Date(year, month, d);
    const cellDateStr = formatLocalDate(cellDate);
    const dayOfWeek = cellDate.getDay(); // 0 is Sunday

    const record = attendanceMap[cellDateStr];

    let cellType = 'future';
    if (onboardingDateStr && cellDateStr < onboardingDateStr) {
      cellType = 'blocked';
    } else if (dayOfWeek === 0 || dayOfWeek === 6) {
      cellType = 'holiday'; // Weekend rest
    } else if (cellDateStr > todayStr) {
      cellType = 'future';
    } else if (record) {
      cellType = 'attendance';
    } else if (cellDateStr === todayStr) {
      cellType = 'pending_punchin'; // Not punched today yet
    } else {
      cellType = 'unpunched_past'; // Missed punch-in past workday
    }

    cells.push({
      type: cellType,
      dayNum: d,
      date: cellDateStr,
      record: record || null
    });
  }

  return cells;
}


// --- ROUTES ---

// Core Landing Router
app.get('/', requireAuth, (req, res) => {
  if (['founder', 'tl'].includes(req.session.user.role)) {
    return res.redirect('/tl/dashboard');
  }
  res.redirect('/dashboard');
});

// Authentication Pages
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: req.query.error || null, success: req.query.success || null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render('login', { error: 'Please enter all fields.', success: null });
  }

  try {
    const users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.render('login', { error: 'Invalid email or password.', success: null });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.render('login', { error: 'Invalid email or password.', success: null });
    }

    // Set Session
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Server error during login.', success: null });
  }
});


app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/reset-password', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('reset-password', { error: null });
});

app.post('/reset-password', async (req, res) => {
  const { email, dob, new_password } = req.body;
  
  if (!email || !dob || !new_password) {
    return res.render('reset-password', { error: 'Please provide all details.' });
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = ? AND dob = ?', [email, dob]);
    
    if (existing.length === 0) {
      return res.render('reset-password', { error: 'Invalid email or date of birth.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(new_password, salt);

    await db.query('UPDATE users SET password_hash = ? WHERE email = ?', [passwordHash, email]);

    res.redirect('/login?success=' + encodeURIComponent('Password successfully reset! Please log in.'));
  } catch (err) {
    console.error(err);
    res.render('reset-password', { error: 'Server error during password reset.' });
  }
});


app.get('/dashboard', requireAuth, requireRole(['intern']), async (req, res) => {
  const userId = req.session.user.id;
  const todayStr = formatLocalDate(new Date());

  try {
    // 1. Fetch today's attendance log
    const logs = await db.query(
      'SELECT * FROM attendance WHERE user_id = ? AND work_date = ?',
      [userId, todayStr]
    );
    const attendanceToday = logs.length > 0 ? logs[0] : null;

    // Determine state
    let punchState = 'punch_in';
    if (attendanceToday) {
      if (attendanceToday.punch_out_time === null) {
        punchState = 'punch_out';
      } else {
        punchState = 'completed';
      }
    }

    // 2. Fetch today's tasks
    const tasksToday = await db.query(
      'SELECT * FROM tasks WHERE assigned_to = ? AND assigned_date = ?',
      [userId, todayStr]
    );

    // 3. Compute Streak metrics
    const currentStreak = await calculateStreak(userId);

    // 4. Generate Calendar Days
    const calendarDays = await getCalendarDays(userId);

    // 5. Fetch leave requests for this user
    const leaveRequests = await db.query(
      `SELECT lr.*, TO_CHAR(lr.leave_date, 'YYYY-MM-DD') AS leave_date_str,
              u.name AS reviewer_name
       FROM leave_requests lr
       LEFT JOIN users u ON lr.reviewed_by = u.id
       WHERE lr.user_id = ?
       ORDER BY lr.leave_date DESC
       LIMIT 10`,
      [userId]
    );

    // 6. Stats for quick glance
    const pendingTasksCount = tasksToday.filter(t => t.status === 'pending').length;
    const completedTasksCount = tasksToday.filter(t => t.status === 'completed').length;

    res.render('dashboard-intern', {
      punchState,
      attendanceToday,
      tasksToday,
      currentStreak,
      calendarDays,
      leaveRequests,
      pendingTasksCount,
      completedTasksCount,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error on Intern Dashboard');
  }
});

// Employee Punch In Action
app.post('/punch-in', requireAuth, requireRole(['intern']), async (req, res) => {
  const { photo, latitude, longitude } = req.body;
  const userId = req.session.user.id;
  const todayStr = formatLocalDate(new Date());

  if (!photo || !latitude || !longitude) {
    return res.redirect('/dashboard?error=' + encodeURIComponent('Missing validation details (photo or coordinates).'));
  }

  try {
    const existing = await db.query(
      'SELECT id FROM attendance WHERE user_id = ? AND work_date = ?',
      [userId, todayStr]
    );
    if (existing.length > 0) {
      return res.redirect('/dashboard?error=' + encodeURIComponent('You have already punched in for today.'));
    }

    const photoFilename = saveBase64Image(photo, userId);

    await db.query(
      `INSERT INTO attendance 
       (user_id, work_date, punch_in_time, punch_in_photo, punch_in_latitude, punch_in_longitude, status) 
       VALUES (?, ?, NOW(), ?, ?, ?, 'pending_punchout')`,
      [userId, todayStr, photoFilename, latitude, longitude]
    );

    res.redirect('/dashboard?success=' + encodeURIComponent('Punched in successfully!'));
  } catch (err) {
    console.error('Punch in error:', err);
    res.redirect('/dashboard?error=' + encodeURIComponent('Failed to complete punch in process.'));
  }
});

// Employee Punch Out Action
app.post('/punch-out', requireAuth, requireRole(['intern']), async (req, res) => {
  const userId = req.session.user.id;
  const todayStr = formatLocalDate(new Date());
  
  let completedTaskIds = req.body['completed_tasks[]'] || req.body.completed_tasks || [];
  if (!Array.isArray(completedTaskIds)) {
    completedTaskIds = [completedTaskIds];
  }
  completedTaskIds = completedTaskIds.map(id => parseInt(id, 10));

  try {
    const logs = await db.query(
      "SELECT id, punch_in_time FROM attendance WHERE user_id = ? AND work_date = ? AND status = 'pending_punchout'",
      [userId, todayStr]
    );
    if (logs.length === 0) {
      return res.redirect('/dashboard?error=' + encodeURIComponent('No active punch-in session found for today.'));
    }
    const attendanceId = logs[0].id;

    const tasks = await db.query(
      'SELECT id FROM tasks WHERE assigned_to = ? AND assigned_date = ?',
      [userId, todayStr]
    );

    const incompleteTasks = tasks.filter(t => !completedTaskIds.includes(t.id));
    let incompleteReason = null;

    if (incompleteTasks.length > 0) {
      incompleteReason = req.body.incomplete_reason;
      if (!incompleteReason || incompleteReason.trim() === '') {
        return res.redirect('/dashboard?error=' + encodeURIComponent('Reason is required when leaving tasks incomplete.'));
      }
    }

    for (const task of tasks) {
      const isCompleted = completedTaskIds.includes(task.id);
      await db.query('UPDATE tasks SET status = ? WHERE id = ?', [isCompleted ? 'completed' : 'pending', task.id]);
      await db.query(
        `INSERT INTO task_completions (attendance_id, task_id, is_completed) 
         VALUES (?, ?, ?) ON CONFLICT (attendance_id, task_id) DO UPDATE SET is_completed = EXCLUDED.is_completed`,
        [attendanceId, task.id, isCompleted ? 1 : 0]
      );
    }

    const punchInTime = new Date(logs[0].punch_in_time);
    const punchOutTime = new Date();
    const hoursWorked = (punchOutTime - punchInTime) / (1000 * 60 * 60);
    
    let finalStatus = 'present';
    if (hoursWorked < 4) {
      finalStatus = 'leave';
    } else if (hoursWorked >= 4 && hoursWorked < 8) {
      finalStatus = 'half_day';
    }

    await db.query(
      `UPDATE attendance SET punch_out_time = ?, incomplete_reason = ?, status = ?, hours_worked = ? WHERE id = ?`,
      [punchOutTime, incompleteReason, finalStatus, hoursWorked, attendanceId]
    );

    res.redirect('/dashboard?success=' + encodeURIComponent('Punched out successfully. Work logged!'));
  } catch (err) {
    console.error('Punch out error:', err);
    res.redirect('/dashboard?error=' + encodeURIComponent('Failed to log punch out details.'));
  }
});

// Employee: Apply for Leave
app.post('/apply-leave', requireAuth, requireRole(['intern']), async (req, res) => {
  const { leave_date, reason } = req.body;
  const userId = req.session.user.id;

  if (!leave_date || !reason || reason.trim() === '') {
    return res.redirect('/dashboard?error=' + encodeURIComponent('Leave date and reason are required.'));
  }

  try {
    // Check if already applied for that date
    const existing = await db.query(
      'SELECT id FROM leave_requests WHERE user_id = ? AND leave_date = ?',
      [userId, leave_date]
    );
    if (existing.length > 0) {
      return res.redirect('/dashboard?error=' + encodeURIComponent('You have already applied for leave on this date.'));
    }

    await db.query(
      `INSERT INTO leave_requests (user_id, leave_date, reason, status) VALUES (?, ?, ?, 'pending')`,
      [userId, leave_date, reason.trim()]
    );

    res.redirect('/dashboard?success=' + encodeURIComponent('Leave application submitted to your Team Lead for approval.'));
  } catch (err) {
    console.error('Leave apply error:', err);
    res.redirect('/dashboard?error=' + encodeURIComponent('Failed to submit leave application.'));
  }
});


// --- TL / FOUNDER DASHBOARD ---

app.get('/tl/dashboard', requireAuth, requireRole(['founder', 'tl']), async (req, res) => {
  const activeTab = req.query.tab || 'presence';
  
  try {
    // 1. Fetch all interns (employees) for sidebar/multiselect/selectors/team tab
    const interns = await db.query("SELECT id, name, email, dob, onboarding_date, created_at FROM users WHERE role = 'intern' ORDER BY name ASC");

    // 2. Tab-specific data fetching
    let activities = [];
    let employeeTasks = {};
    let tasksList = [];
    let selectedInternId = null;
    let selectedInternCalendar = [];
    let selectedInternStreak = 0;
    let missedPunches = [];
    let activeSessions = [];
    let roadblocks = [];
    let pendingLeaves = [];

    if (activeTab === 'presence') {
      // Fetch today's presence tracker for all interns
      activities = await db.query(
        `SELECT a.id AS attendance_id, u.id AS user_id, u.name, u.email, 
                a.punch_in_time, a.punch_in_photo, a.punch_in_latitude, a.punch_in_longitude,
                a.punch_out_time, a.incomplete_reason, a.status, a.admin_notes
         FROM users u
         LEFT JOIN attendance a ON u.id = a.user_id AND a.work_date = CURRENT_DATE
         WHERE u.role = 'intern'
         ORDER BY a.punch_in_time DESC, u.name ASC`
      );

      // Fetch today's assigned tasks
      const tasksToday = await db.query(
        'SELECT id, assigned_to, task_description, status FROM tasks WHERE assigned_date = CURRENT_DATE'
      );

      // Group tasks by employee user_id
      interns.forEach(intern => {
        employeeTasks[intern.id] = [];
      });
      tasksToday.forEach(task => {
        if (employeeTasks[task.assigned_to]) {
          employeeTasks[task.assigned_to].push(task);
        }
      });
    } else if (activeTab === 'tasks') {
      // Fetch entire history of assigned tasks
      tasksList = await db.query(
        `SELECT t.id, t.task_description, t.assigned_date, t.status, 
                u.name AS assignee_name, u.email AS assignee_email,
                b.name AS assigner_name
         FROM tasks t
         INNER JOIN users u ON t.assigned_to = u.id
         INNER JOIN users b ON t.assigned_by = b.id
         ORDER BY t.assigned_date DESC, t.id DESC`
      );
    } else if (activeTab === 'streaks') {
      // Fetch calendar and streak of the selected employee
      selectedInternId = parseInt(req.query.intern_id || (interns.length > 0 ? interns[0].id : null), 10);
      if (selectedInternId) {
        selectedInternCalendar = await getCalendarDays(selectedInternId);
        selectedInternStreak = await calculateStreak(selectedInternId);
      }
    } else if (activeTab === 'reminders') {
      // Fetch missed punch-ins today
      missedPunches = await db.query(
        `SELECT id, name, email FROM users 
         WHERE role = 'intern' 
         AND id NOT IN (
           SELECT user_id FROM attendance WHERE work_date = CURRENT_DATE
         )
         ORDER BY name ASC`
      );

      // Fetch active sessions
      activeSessions = await db.query(
        `SELECT a.id AS attendance_id, u.name, u.email, a.punch_in_time 
         FROM attendance a
         INNER JOIN users u ON a.user_id = u.id
         WHERE a.work_date = CURRENT_DATE AND a.status = 'pending_punchout'
         ORDER BY a.punch_in_time DESC`
      );

      // Fetch roadblocks list
      roadblocks = await db.query(
        `SELECT a.id AS attendance_id, u.name, u.email, a.incomplete_reason, a.punch_out_time, a.work_date 
         FROM attendance a
         INNER JOIN users u ON a.user_id = u.id
         WHERE a.incomplete_reason IS NOT NULL AND a.incomplete_reason <> ''
         ORDER BY a.work_date DESC, a.punch_out_time DESC`
      );
    }

    // Fetch pending leave requests for ALL tabs (shown as badge/notification)
    pendingLeaves = await db.query(
      `SELECT lr.id, lr.leave_date, lr.reason, lr.status, lr.created_at,
              u.name AS employee_name, u.email AS employee_email
       FROM leave_requests lr
       INNER JOIN users u ON lr.user_id = u.id
       ORDER BY lr.status = 'pending' DESC, lr.leave_date DESC
       LIMIT 20`
    );

    res.render('dashboard-tl', {
      interns,
      activeTab,
      activities,
      employeeTasks,
      tasksList,
      selectedInternId,
      selectedInternCalendar,
      selectedInternStreak,
      missedPunches,
      activeSessions,
      roadblocks,
      pendingLeaves,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error on TL Dashboard');
  }
});

// TL: Assign Task to Interns
app.post('/tl/assign-task', requireAuth, requireRole(['founder', 'tl']), async (req, res) => {
  const { task_description, assigned_date } = req.body;
  const assignees = req.body['assignees[]'] || req.body.assignees || [];
  const senderId = req.session.user.id;

  if (!task_description || !assigned_date || assignees.length === 0) {
    return res.redirect('/tl/dashboard?error=' + encodeURIComponent('Missing task information or selected assignees.'));
  }

  // Format array
  const assigneeIds = Array.isArray(assignees) ? assignees : [assignees];

  try {
    for (const assigneeId of assigneeIds) {
      await db.query(
        `INSERT INTO tasks (assigned_to, assigned_by, task_description, assigned_date, status) 
         VALUES (?, ?, ?, ?, 'pending')`,
        [assigneeId, senderId, task_description, assigned_date]
      );
    }
    res.redirect('/tl/dashboard?success=' + encodeURIComponent('Task successfully assigned to employees.'));
  } catch (err) {
    console.error(err);
    res.redirect('/tl/dashboard?error=' + encodeURIComponent('Failed to assign task.'));
  }
});

// TL: Delete Assigned Task
app.post('/tl/delete-task', requireAuth, requireRole(['founder', 'tl']), async (req, res) => {
  const { task_id } = req.body;
  if (!task_id) {
    return res.redirect('/tl/dashboard?tab=tasks&error=' + encodeURIComponent('Missing task identifier.'));
  }

  try {
    await db.query('DELETE FROM tasks WHERE id = ?', [task_id]);
    res.redirect('/tl/dashboard?tab=tasks&success=' + encodeURIComponent('Task successfully deleted.'));
  } catch (err) {
    console.error(err);
    res.redirect('/tl/dashboard?tab=tasks&error=' + encodeURIComponent('Failed to delete task.'));
  }
});

// TL: Update Attendance Status (Override to Absent)
app.post('/tl/update-attendance', requireAuth, requireRole(['founder', 'tl']), async (req, res) => {
  const { attendance_id, admin_notes } = req.body;

  if (!attendance_id || !admin_notes) {
    return res.redirect('/tl/dashboard?error=' + encodeURIComponent('Validation details or notes missing.'));
  }

  try {
    await db.query(
      `UPDATE attendance 
       SET status = 'absent', admin_notes = ? 
       WHERE id = ?`,
      [admin_notes, attendance_id]
    );
    res.redirect('/tl/dashboard?success=' + encodeURIComponent('Attendance successfully overridden to ABSENT.'));
  } catch (err) {
    console.error(err);
    res.redirect('/tl/dashboard?error=' + encodeURIComponent('Failed to update attendance status.'));
  }
});

// TL: Approve or Reject Leave Request
// TL: API to get pending leaves for real-time dashboard updates
app.get('/tl/api/leaves', requireAuth, requireRole(['founder', 'tl']), async (req, res) => {
  try {
    const pendingLeaves = await db.query(
      `SELECT lr.id, lr.leave_date, lr.reason, lr.status, lr.created_at,
              u.name AS employee_name, u.email AS employee_email
       FROM leave_requests lr
       INNER JOIN users u ON lr.user_id = u.id
       WHERE lr.status = 'pending'
       ORDER BY lr.leave_date ASC`
    );
    res.json({ success: true, pendingLeaves });
  } catch (err) {
    console.error('API Error fetching leaves:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch leaves' });
  }
});

app.post('/tl/review-leave', requireAuth, requireRole(['founder', 'tl']), async (req, res) => {
  const { leave_id, action, review_notes } = req.body;
  const reviewerId = req.session.user.id;

  if (!leave_id || !action || !['approved', 'rejected'].includes(action)) {
    return res.redirect('/tl/dashboard?tab=reminders&error=' + encodeURIComponent('Invalid leave review action.'));
  }

  try {
    await db.query(
      `UPDATE leave_requests SET status = ?, reviewed_by = ?, review_notes = ? WHERE id = ?`,
      [action, reviewerId, review_notes || null, leave_id]
    );
    res.redirect('/tl/dashboard?tab=reminders&success=' + encodeURIComponent(`Leave request ${action} successfully.`));
  } catch (err) {
    console.error(err);
    res.redirect('/tl/dashboard?tab=reminders&error=' + encodeURIComponent('Failed to process leave request.'));
  }
});

// TL: Add Employee
app.post('/tl/add-employee', requireAuth, requireRole(['founder', 'tl']), async (req, res) => {
  const { name, email, password, dob, onboarding_date } = req.body;
  
  if (!name || !email || !password || !dob || !onboarding_date) {
    return res.redirect('/tl/dashboard?tab=team&error=' + encodeURIComponent('Please provide all employee details.'));
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.redirect('/tl/dashboard?tab=team&error=' + encodeURIComponent('Email is already registered.'));
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await db.query(
      'INSERT INTO users (name, email, password_hash, dob, onboarding_date, role) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, passwordHash, dob, onboarding_date, 'intern']
    );

    res.redirect('/tl/dashboard?tab=team&success=' + encodeURIComponent('Employee successfully added.'));
  } catch (err) {
    console.error(err);
    res.redirect('/tl/dashboard?tab=team&error=' + encodeURIComponent('Server error while adding employee.'));
  }
});

// TL: Remove Employee
app.post('/tl/remove-employee', requireAuth, requireRole(['founder', 'tl']), async (req, res) => {
  const { employee_id } = req.body;

  if (!employee_id) {
    return res.redirect('/tl/dashboard?tab=team&error=' + encodeURIComponent('Employee ID is missing.'));
  }

  try {
    await db.query('DELETE FROM users WHERE id = ? AND role = ?', [employee_id, 'intern']);
    res.redirect('/tl/dashboard?tab=team&success=' + encodeURIComponent('Employee successfully removed.'));
  } catch (err) {
    console.error(err);
    res.redirect('/tl/dashboard?tab=team&error=' + encodeURIComponent('Failed to remove employee.'));
  }
});

// TL: Export Attendance to Excel
app.get('/tl/export-attendance', requireAuth, requireRole(['founder', 'tl']), async (req, res) => {
  try {
    const exceljs = require('exceljs');
    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Records');

    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Employee Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Punch In', key: 'punch_in', width: 20 },
      { header: 'Punch Out', key: 'punch_out', width: 20 },
      { header: 'Hours Worked', key: 'hours', width: 15 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Incomplete Reason', key: 'reason', width: 35 },
      { header: 'Admin Notes', key: 'notes', width: 35 }
    ];

    const records = await db.query(
      `SELECT a.*, u.name, u.email 
       FROM attendance a 
       INNER JOIN users u ON a.user_id = u.id 
       ORDER BY a.work_date DESC, u.name ASC`
    );

    records.forEach(r => {
      worksheet.addRow({
        date: new Date(r.work_date).toLocaleDateString(),
        name: r.name,
        email: r.email,
        punch_in: r.punch_in_time ? new Date(r.punch_in_time).toLocaleString() : 'N/A',
        punch_out: r.punch_out_time ? new Date(r.punch_out_time).toLocaleString() : 'N/A',
        hours: r.hours_worked ? parseFloat(r.hours_worked).toFixed(2) : '',
        status: (r.status || '').toUpperCase(),
        reason: r.incomplete_reason || '',
        notes: r.admin_notes || ''
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=' + 'EMS_Attendance_Report.xlsx');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export Error:', err);
    res.redirect('/tl/dashboard?error=' + encodeURIComponent('Failed to generate Excel report.'));
  }
});

const cron = require('node-cron');

// Auto-Leave Cron Job (Runs every day at 16:00 / 4:00 PM)
cron.schedule('0 16 * * *', async () => {
  console.log('[Cron] Running 4:00 PM auto-leave check...');
  const now = new Date();
  const dayOfWeek = now.getDay();
  
  // Skip weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log('[Cron] Weekend detected. Skipping auto-leave.');
    return;
  }

  try {
    const todayStr = formatLocalDate(now);
    
    const missingPunches = await db.query(
      `SELECT id FROM users 
       WHERE role = 'intern' 
       AND id NOT IN (SELECT user_id FROM attendance WHERE work_date = ?)`,
      [todayStr]
    );

    for (const user of missingPunches) {
      await db.query(
        `INSERT INTO attendance (user_id, work_date, status, admin_notes) 
         VALUES (?, ?, 'leave', 'Auto-marked leave (No punch-in by 4:00 PM)')`,
        [user.id, todayStr]
      );
    }
    
    console.log(`[Cron] Marked ${missingPunches.length} employees on leave.`);
  } catch (err) {
    console.error('[Cron Error]', err);
  }
});

// Boot Database and Web Server
db.getPool().then(() => {
  app.listen(PORT, () => {
    console.log(`EMS application server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Fatal Database initialization failure. Stopping server start.', err);
});
