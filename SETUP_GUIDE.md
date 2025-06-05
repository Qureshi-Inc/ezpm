# Quick Setup Guide - Fix Login Issues

## Current Issue
Your Supabase API keys are invalid, preventing login and registration.

## Steps to Fix:

### 1. Get Supabase Credentials
1. Go to [supabase.com](https://supabase.com) and log in
2. Select your project (or create a new one)
3. Go to **Settings → API**
4. Copy these values:
   - **Project URL**: `https://YOUR-PROJECT-ID.supabase.co`
   - **anon public**: `eyJ...` (long string)
   - **service_role**: Click "Reveal" first, then copy `eyJ...` (long string)

### 2. Update .env.local
Replace the values in your `.env.local` file with the actual ones from Supabase.

### 3. Create Database Tables
1. In Supabase dashboard, go to **SQL Editor**
2. Click **New query**
3. Copy ALL contents from `supabase/schema.sql`
4. Paste and click **Run**

### 4. Create Admin User
In the same SQL Editor, run:
```sql
INSERT INTO users (email, password_hash, role) VALUES 
('admin@example.com', '$2a$10$PJvF3H5Z2X3LoUVHVZ.hXelSIxG7iF8y5H.OKfcJqZdQvKz.cBkH2', 'admin');
```

### 5. Restart the App
```bash
npm run dev
```

### 6. Login
- URL: http://localhost:3000
- Email: admin@example.com
- Password: admin123

## Admin vs Tenant
- **Admin login**: Use the credentials above
- **Tenant registration**: Click "Sign up" on the login page to create a tenant account

## Still Having Issues?
1. Make sure all Supabase keys are copied correctly (no extra spaces)
2. Ensure you ran the ENTIRE schema.sql file
3. Check that the admin user SQL was executed successfully
4. Try clearing your browser cookies for localhost:3000 