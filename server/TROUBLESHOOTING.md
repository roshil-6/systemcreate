# Server Troubleshooting Guide

## Common Server Errors

### 1. Database Connection Error

**Error:** `ECONNREFUSED` or `Connection refused`

**Solution:**
1. Ensure PostgreSQL is installed and running
2. Check if PostgreSQL service is running:
   - Windows: Open Services (services.msc) and look for "postgresql"
   - Or check Task Manager for postgres processes
3. Verify database exists:
   ```sql
   -- Connect to PostgreSQL and run:
   CREATE DATABASE tonio_senora_crm;
   ```
4. Update `server/.env` with correct credentials:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=tonio_senora_crm
   DB_USER=postgres
   DB_PASSWORD=your_password_here
   ```

### 2. Module Not Found Error

**Error:** `Cannot find module 'xxx'`

**Solution:**
```bash
cd server
npm install
```

### 3. Port Already in Use

**Error:** `EADDRINUSE: address already in use :::5001`

**Solution:**
- Find and kill the process using port 5001:
  ```powershell
  netstat -ano | findstr :5001
  taskkill /PID <PID_NUMBER> /F
  ```
- Or change the port in `server/.env`:
  ```
  PORT=5002
  ```

### 4. JWT Secret Error

**Error:** JWT authentication failures

**Solution:**
- Ensure `JWT_SECRET` is set in `server/.env`
- The secret should be a long, random string

### 5. Table Does Not Exist

**Error:** `relation "users" does not exist`

**Solution:**
Initialize the database:
```bash
cd server
npm run init-db
```

## Quick Diagnostic Steps

1. **Check if .env exists:**
   ```bash
   Test-Path server\.env
   ```

2. **Test database connection:**
   ```bash
   psql -U postgres -d tonio_senora_crm -c "SELECT 1;"
   ```

3. **Check server logs:**
   - Look for error messages in the console
   - Check for database connection errors
   - Verify all routes are loading

4. **Verify dependencies:**
   ```bash
   cd server
   npm list --depth=0
   ```

## Server Startup Checklist

- [ ] PostgreSQL is installed and running
- [ ] Database `tonio_senora_crm` exists
- [ ] `server/.env` file exists with correct credentials
- [ ] Dependencies installed (`npm install` in server directory)
- [ ] Database initialized (`npm run init-db`)
- [ ] Port 5001 is available
- [ ] No firewall blocking port 5001

## Getting Help

If you're still experiencing issues:

1. Check the server console output for specific error messages
2. Verify PostgreSQL is accessible:
   ```bash
   psql -U postgres
   ```
3. Test the health endpoint:
   ```bash
   curl http://localhost:5001/api/health
   ```
