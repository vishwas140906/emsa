-- 1. Users Table (Handles roles: Founder, TL, Intern)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  dob DATE,
  onboarding_date DATE,
  employee_id VARCHAR(50) UNIQUE,
  role VARCHAR(50) NOT NULL DEFAULT 'intern' CHECK (role IN ('founder', 'tl', 'intern', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tasks Table (Assigned by TL/Founder to interns/employees)
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  assigned_to INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_description TEXT NOT NULL,
  assigned_date DATE NOT NULL,    -- The date the task needs to be completed
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Attendance & Punching Table
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  
  -- Punch In Details
  punch_in_time TIMESTAMP NULL,
  punch_in_photo TEXT NULL,
  punch_in_latitude DECIMAL(9,6) NULL,
  punch_in_longitude DECIMAL(9,6) NULL,
  
  -- Punch Out Details
  punch_out_time TIMESTAMP NULL,
  incomplete_reason TEXT NULL,
  hours_worked DECIMAL(5,2) NULL,
  
  -- Status Override (For Admin/TL to override)
  status VARCHAR(50) DEFAULT 'pending_punchout',
  admin_notes VARCHAR(255) NULL,
  
  UNIQUE (user_id, work_date)
);

-- 4. Tasks Completed Mapping (Tracks which task was completed during which attendance session)
CREATE TABLE IF NOT EXISTS task_completions (
  attendance_id INT NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  is_completed BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (attendance_id, task_id)
);

-- 5. Leave Requests (Intern applies, TL/Founder approves/rejects)
CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by INT NULL REFERENCES users(id) ON DELETE SET NULL,
  review_notes VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
