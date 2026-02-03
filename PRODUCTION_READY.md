# 🚀 Production Ready Setup Guide

Your CRM is now configured for production with PostgreSQL!

## ✅ What's Been Done

1. **PostgreSQL Integration**: Fully migrated from SQLite to PostgreSQL
2. **Production Database Config**: Optimized connection pooling, SSL support
3. **Bulk Import Fixed**: Enhanced CSV/Excel import with better error handling
4. **Production Setup Script**: Automated setup verification

## 📋 Quick Setup (5 minutes)

### Step 1: Get Database Connection String

Choose one:

**Option A: Railway (Recommended - 3 min)**
1. Go to https://railway.app
2. Sign up → New → Database → Add PostgreSQL
3. Copy connection string from Connect tab

**Option B: Neon (3 min)**
1. Go to https://neon.tech
2. Sign up → Create project
3. Copy connection string

**Option C: Local PostgreSQL (5 min)**
1. Download: https://www.postgresql.org/download/windows/
2. Install (remember password)
3. Create database: `CREATE DATABASE crm;`
4. Connection: `postgresql://postgres:YOUR_PASSWORD@localhost:5432/crm`

### Step 2: Update Environment Variables

Edit `server/.env`:
```env
DATABASE_URL=your_connection_string_here
JWT_SECRET=your-secret-key-change-this-in-production
NODE_ENV=production
PORT=5001
```

### Step 3: Run Production Setup

```bash
cd server
npm run production-setup
```

This will:
- ✅ Check environment variables
- ✅ Test database connection
- ✅ Verify tables exist
- ✅ Check for missing columns

### Step 4: Initialize Database

If tables don't exist:
```bash
npm run init-db
```

If columns are missing:
```bash
npm run migrate-columns
```

### Step 5: Start Server

```bash
npm start
```

## ✅ Production Features

### Database
- ✅ PostgreSQL with connection pooling
- ✅ SSL support for cloud databases
- ✅ Transaction support for bulk operations
- ✅ Optimized query timeouts

### Bulk Import
- ✅ CSV and Excel file support
- ✅ Meta Ads format support
- ✅ Robust column matching
- ✅ Duplicate detection
- ✅ Transaction-based inserts
- ✅ Detailed error reporting

### Security
- ✅ JWT authentication
- ✅ Role-based access control
- ✅ Environment variable configuration
- ✅ SSL database connections

## 🔍 Verify Everything Works

### Test Database Connection
```bash
cd server
node scripts/productionSetup.js
```

### Test Bulk Import
1. Start server: `npm start`
2. Login to the app
3. Go to Bulk Import
4. Upload a CSV/Excel file
5. Check for success message

### Test API Health
```bash
curl http://localhost:5001/api/health
```

Should return:
```json
{
  "status": "ok",
  "database": "connected",
  "type": "PostgreSQL"
}
```

## 📝 Environment Variables

Required in `server/.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `NODE_ENV` - `production` or `development`
- `PORT` - Server port (default: 5001)

## 🚀 Deployment Checklist

- [ ] Database connection string configured
- [ ] JWT_SECRET set to a strong random value
- [ ] NODE_ENV set to `production`
- [ ] Database initialized (`npm run init-db`)
- [ ] Missing columns added (`npm run migrate-columns`)
- [ ] Production setup verified (`npm run production-setup`)
- [ ] Server starts successfully (`npm start`)
- [ ] Health check passes (`/api/health`)
- [ ] Bulk import tested
- [ ] Frontend configured with correct API URL

## 🐛 Troubleshooting

### Database Connection Fails
- Check `DATABASE_URL` is correct
- Verify database is accessible
- Check SSL settings (cloud databases need SSL)
- Test connection: `node scripts/productionSetup.js`

### Bulk Import Fails
- Check file format (CSV or Excel)
- Verify required columns: `name` (or `first_name` + `last_name`) and `phone` (or `phone_number`)
- Check server logs for detailed errors
- Ensure database has `source`, `ielts_score`, `follow_up_status` columns

### Missing Columns Error
```bash
npm run migrate-columns
```

### Tables Don't Exist
```bash
npm run init-db
```

## 📊 Database Schema

All tables are created automatically:
- `users` - User accounts and roles
- `leads` - Lead management
- `clients` - Client records
- `comments` - Lead comments
- `attendance` - Staff attendance
- `notifications` - System notifications
- `email_templates` - Email templates
- `email_logs` - Email history

## 🎯 Next Steps

1. **Deploy Backend**: Deploy to Vercel, Railway, or your preferred host
2. **Deploy Frontend**: Deploy React app to Vercel, Netlify, etc.
3. **Configure Environment**: Set environment variables in hosting platform
4. **Test Everything**: Verify all features work in production
5. **Monitor**: Set up logging and monitoring

## 💡 Tips

- Use connection pooler for cloud databases (better performance)
- Set strong JWT_SECRET in production
- Enable SSL for all database connections
- Monitor database connection pool usage
- Set up database backups
- Use environment variables for all secrets

---

**Your CRM is production-ready! 🎉**
