const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Environment check:');
console.log('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
console.log('SERVICE_KEY:', supabaseServiceKey ? 'Set (length: ' + supabaseServiceKey.length + ')' : 'Missing');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkDatabase() {
  try {
    console.log('\n=== Database Connection Test ===');

    // Test connection
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, role, created_at, updated_at')
      .limit(10);

    if (error) {
      console.error('Database error:', error);
      return;
    }

    console.log(`Found ${users.length} users:`);
    users.forEach((user, i) => {
      console.log(`${i + 1}. ${user.email} (${user.role}) - Created: ${user.created_at}`);
    });

    // Check specific admin user
    console.log('\n=== Admin User Check ===');
    const { data: adminUser, error: adminError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'admin@qureshi.io')
      .single();

    if (adminError) {
      console.log('Admin user not found:', adminError.message);

      // Create admin user
      console.log('\n=== Creating Admin User ===');
      const passwordHash = bcrypt.hashSync('password123', 10);

      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          email: 'admin@qureshi.io',
          password_hash: passwordHash,
          first_name: 'Admin',
          last_name: 'User',
          phone: '+1234567890',
          role: 'admin',
          is_active: true
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating admin user:', createError);
      } else {
        console.log('Admin user created successfully:', newUser);
      }
    } else {
      console.log('Admin user found:', {
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        hasPassword: !!adminUser.password_hash,
        passwordHashLength: adminUser.password_hash?.length || 0
      });

      // Test password verification
      console.log('\n=== Password Test ===');
      const testPassword = 'password123';
      const isValid = bcrypt.compareSync(testPassword, adminUser.password_hash);
      console.log(`Password '${testPassword}' is valid:`, isValid);
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkDatabase().then(() => {
  console.log('\nDatabase check complete');
  process.exit(0);
}).catch(error => {
  console.error('Script error:', error);
  process.exit(1);
});