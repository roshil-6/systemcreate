# 🚨 Database Setup Required

## The Problem
Your server can't start because `DATABASE_URL` is not set in `server/.env`.

## Quick Fix

### Step 1: Create `server/.env` file

Create a file named `.env` in the `server` directory with this content:

```env
DATABASE_URL=postgresql://username:password@host:5432/dbname
JWT_SECRET=your-secret-key-change-this
NODE_ENV=development
PORT=5001
```

### Step 2: Get Your PostgreSQL Connection String

You need a PostgreSQL database. Options:

**Option A: Use a Free Hosted Database**
- **Supabase**: https://supabase.com (Free tier available)
- **Railway**: https://railway.app (Free tier available)
- **Neon**: https://neon.tech (Free tier available)
- **Vercel Postgres**: https://vercel.com/docs/storage/vercel-postgres

**Option B: Local PostgreSQL**
- Install PostgreSQL locally
- Create a database
- Use: `postgresql://postgres:password@localhost:5432/crm`

**Example Connection String Format:**
```
postgresql://username:password@host:5432/database_name
```

### Step 3: Initialize Database Schema

Once you have `DATABASE_URL` set:

```bash
cd server
npm run init-db
```

This creates all tables, sequences, and indexes.

### Step 4: Add Missing Columns (if needed)

If you already ran `init-db` before, add missing columns:

```bash
npm run migrate-columns
```

### Step 5: Start Server

```bash
npm start
```

---

## Need Help?

If you don't have a PostgreSQL database yet:

1. **Sign up for Supabase** (easiest):
   - Go to https://supabase.com
   - Create a project
   - Go to Settings → Database
   - Copy the connection string
   - Replace `[YOUR-PASSWORD]` with your database password

2. **Or use Railway**:
   - Go to https://railway.app
   - Create a PostgreSQL database
   - Copy the connection string from the database settings

3. **Update your `.env` file** with the connection string

4. **Run the setup commands above**

---

## Testing Connection

After setting `DATABASE_URL`, test it:

```bash
cd server
node -e "require('dotenv').config(); console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET')"
```

If it shows "SET", you're ready to start the server!
