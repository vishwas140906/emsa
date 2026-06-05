require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db.js');

async function run() {
  try {
    console.log("Seeding Admin & TL accounts into PostgreSQL...");

    // Admin
    const adminEmail = 'navandarabhijeet@gmail.com';
    const adminPassword = 'GS@0306#';
    const adminSalt = await bcrypt.genSalt(10);
    const adminHash = await bcrypt.hash(adminPassword, adminSalt);
    const adminDob = '1996-03-17';
    
    // Check if exists
    const adminExist = await db.query("SELECT id FROM users WHERE email = ?", [adminEmail]);
    if (adminExist.length > 0) {
      await db.query(
        "UPDATE users SET name = 'Abhijeet Navandar', password_hash = ?, dob = ?, role = 'founder' WHERE email = ?",
        [adminHash, adminDob, adminEmail]
      );
      console.log("Admin account updated.");
    } else {
      await db.query(
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
    const tlExist = await db.query("SELECT id FROM users WHERE email = ?", [tlEmail]);
    if (tlExist.length > 0) {
      await db.query(
        "UPDATE users SET name = 'Vishwas Gupta', password_hash = ?, dob = ?, role = 'tl' WHERE email = ?",
        [tlHash, tlDob, tlEmail]
      );
      console.log("TL account updated.");
    } else {
      await db.query(
        "INSERT INTO users (name, email, password_hash, dob, role) VALUES ('Vishwas Gupta', ?, ?, ?, 'tl')",
        [tlEmail, tlHash, tlDob]
      );
      console.log("TL account inserted.");
    }

    console.log("Seeding completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
