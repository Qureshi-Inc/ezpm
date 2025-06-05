# Rent Payment Application

A modern rent payment platform that allows tenants to pay rent online and property managers to track payments. Built with Next.js, Supabase, and Stripe.

## Features

### Tenant Features
- Secure login and registration
- Add payment methods (ACH, Debit, Credit cards via Stripe)
- Make one-time rent payments
- Set up automatic payments
- View payment history
- View assigned property details

### Admin Features
- Create and manage tenants
- Assign tenants to properties
- View all payment transactions
- Track monthly revenue
- See pending payments

## Tech Stack

- **Frontend**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Custom implementation with session cookies
- **Payment Processing**: Stripe
- **Hosting**: Deployable to Vercel (free tier)

## Prerequisites

Before you begin, you'll need:

1. Node.js 18+ installed
2. A Supabase account (free tier available)
3. A Stripe account (test mode is fine for development)

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd rent-payment-app
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema from `supabase/schema.sql`
3. Get your project URL and keys from Settings > API

### 3. Set Up Stripe

1. Create an account at [stripe.com](https://stripe.com)
2. Get your publishable and secret keys from the Dashboard
3. For webhooks (optional), add endpoint URL: `https://your-domain.com/api/stripe/webhook`

### 4. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Create an Admin User

Run the following SQL in Supabase SQL Editor to create an admin user:

```sql
-- Create admin user (password: admin123)
INSERT INTO users (email, password_hash, role) VALUES 
('admin@example.com', '$2a$10$PJvF3H5Z2X3LoUVHVZ.hXelSIxG7iF8y5H.OKfcJqZdQvKz.cBkH2', 'admin');
```

Note: Change the password after first login!

### 6. Run the Application

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Deployment

### Deploy to Vercel (Recommended)

1. Push your code to GitHub
2. Import your repository on [Vercel](https://vercel.com)
3. Add all environment variables
4. Deploy!

### Deploy to Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Add environment variables
6. Deploy!

## Project Structure

```
rent-payment-app/
├── app/                    # Next.js app router pages
│   ├── admin/             # Admin dashboard pages
│   ├── tenant/            # Tenant dashboard pages
│   ├── auth/              # Authentication pages
│   └── api/               # API routes
├── components/            # React components
│   ├── ui/               # Reusable UI components
│   └── layout/           # Layout components
├── lib/                   # Utility libraries
├── types/                 # TypeScript type definitions
├── utils/                 # Helper functions
└── supabase/             # Database schema
```

## Security Notes

- Always use HTTPS in production
- Keep your environment variables secret
- Regularly update dependencies
- Use Stripe in test mode during development
- Implement rate limiting for production

## License

MIT

## Support

For issues and questions, please open a GitHub issue.
