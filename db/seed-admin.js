require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  try {
    console.log("Adding dob column if not exists...");
    try {
      await connection.query("ALTER TABLE users ADD COLUMN dob DATE AFTER password_hash");
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log("dob column already exists, skipping...");
      } else {
        throw e;
      }
    }
    
    console.log("Seeding Admin & TL accounts...");

    // Admin
    const adminEmail = 'navandarabhijeet@gmail.com';
    const adminPassword = 'GS@0306#';
    const adminSalt = await bcrypt.genSalt(10);
    const adminHash = await bcrypt.hash(adminPassword, adminSalt);
    const adminDob = '1996-03-17';
    
    // Check if exists
    const [adminExist] = await connection.query("SELECT id FROM users WHERE email = ?", [adminEmail]);
    if (adminExist.length > 0) {
      await connection.query(
        "UPDATE users SET name = 'Abhijeet Navandar', password_hash = ?, dob = ?, role = 'founder' WHERE email = ?",
        [adminHash, adminDob, adminEmail]
      );
      console.log("Admin account updated.");
    } else {
      await connection.query(
        "INSERT INTO users (name, email, password_hash, dob, role) VALUES ('Abhijeet Navandar', ?, ?, ?, 'founder')",
        [adminEmail, adminHash, adminDob]
      );
      console.log("Admin account inserted.");
    }

    // TL
    const tlEmail = 'kakkirenivishwas@gmail.com';
    const tlPassword = 'Nani@1409';
    const tlSalt = await bcrypt.genSalt(10);
    const tlHash = await bcrypt.hash(tlPassword, tlSalt);
    const tlDob = '2006-09-14';

    // Check if exists
    const [tlExist] = await connection.query("SELECT id FROM users WHERE email = ?", [tlEmail]);
    if (tlExist.length > 0) {
      await connection.query(
        "UPDATE users SET name = 'Vishwas Gupta', password_hash = ?, dob = ?, role = 'tl' WHERE email = ?",
        [tlHash, tlDob, tlEmail]
      );
      console.log("TL account updated.");
    } else {
      await connection.query(
        "INSERT INTO users (name, email, password_hash, dob, role) VALUES ('Vishwas Gupta', ?, ?, ?, 'tl')",
        [tlEmail, tlHash, tlDob]
      );
      console.log("TL account inserted.");
    }

    console.log("Seeding completed successfully.");
  } catch (err) {
    console.error(err);
  }
  
  await connection.end();
}

run();
