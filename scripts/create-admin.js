const bcrypt = require('bcryptjs');

// Get email and password from command line arguments
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log('Usage: node scripts/create-admin.js <email> <password>');
  process.exit(1);
}

// Hash the password
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);

console.log('\nRun this SQL in your Supabase SQL Editor:\n');
console.log(`INSERT INTO users (email, password_hash, role) VALUES ('${email}', '${hash}', 'admin');`);
console.log('\nAdmin user created successfully!');
console.log(`Email: ${email}`);
console.log(`Password: ${password}`); 