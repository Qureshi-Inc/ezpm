const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

console.log('Testing Supabase connection...')
console.log('URL exists:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('Anon key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
console.log('Service key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌ Missing environment variables!')
  console.error('Please ensure your .env.local file contains:')
  console.error('- NEXT_PUBLIC_SUPABASE_URL')
  console.error('- NEXT_PUBLIC_SUPABASE_ANON_KEY')
  console.error('- SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function testConnection() {
  try {
    // Test if tables exist
    const { data, error, count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('\n❌ Database error:', JSON.stringify(error, null, 2))
      console.error('\nError details:')
      console.error('- Code:', error.code)
      console.error('- Message:', error.message)
      console.error('- Hint:', error.hint)
      console.error('- Details:', error.details)
      
      console.error('\nPossible issues:')
      if (error.code === '42P01' || (error.message && error.message.includes('does not exist'))) {
        console.error('❗ The "users" table does not exist!')
        console.error('→ Run the schema.sql file in Supabase SQL Editor')
      } else if (error.message && error.message.includes('Invalid API key')) {
        console.error('❗ Your Supabase API keys are invalid!')
        console.error('→ Update your .env.local with correct keys from Supabase dashboard')
      } else {
        console.error('1. Have you run the schema.sql in Supabase SQL Editor?')
        console.error('2. Are your Supabase credentials correct?')
        console.error('3. Is your Supabase project active?')
      }
    } else {
      console.log('\n✅ Successfully connected to Supabase!')
      console.log('✅ Users table exists! Count:', count)
      
      // Check if admin user exists
      const { data: adminUser } = await supabase
        .from('users')
        .select('email, role')
        .eq('email', 'admin@qureshi.io')
        .single()
      
      if (adminUser) {
        console.log('✅ Admin user exists:', adminUser.email, '(role:', adminUser.role + ')')
        console.log('\n🎉 Everything is set up correctly!')
        console.log('\nYou can now login at http://localhost:3000 with:')
        console.log('Email: admin@qureshi.io')
        console.log('Password: Mq210057EZPM')
      } else {
        console.log('\n⚠️  Admin user not found!')
        console.log('Did you run the INSERT SQL in Supabase?')
      }
    }
  } catch (err) {
    console.error('\n❌ Connection test failed:', err.message)
    console.error('Full error:', err)
  }
}

testConnection()