# 📊 Data Storage Information

## Current Storage System

### Location
- **Database File**: `server/data/crm.json`
- **Backups**: `server/data/backups/` (auto-created)

### What's Stored
All your critical business data is stored in the JSON file:
- ✅ **Users** - All staff accounts and permissions
- ✅ **Leads** - All lead information and status
- ✅ **Clients** - All client details, payment info, processing status
- ✅ **Comments** - All lead/client comments
- ✅ **Attendance** - Staff attendance records
- ✅ **Notifications** - System notifications
- ✅ **Activity Logs** - System activity history

## Safety Features

### 1. **Auto-Save Every 2 Seconds**
- Changes are automatically saved every 2 seconds
- No manual save required

### 2. **Automatic Backups**
- Hourly backups are created automatically
- Last 24 hourly backups are kept (1 day of backups)
- Backups stored in `server/data/backups/`

### 3. **Atomic Writes**
- Data is written to a temporary file first
- Then renamed to the main file (prevents corruption if server crashes mid-write)

### 4. **Data Validation**
- JSON is validated before saving
- Prevents corrupted data from being written

### 5. **Crash Protection**
- Saves automatically when server shuts down
- Handles unexpected crashes gracefully

### 6. **Data Loss Prevention**
- Checks for data loss before saving
- Restores from file if memory data is corrupted

## Backup & Restore

### Manual Backup
```bash
cd server
npm run backup
```

### Restore from Backup
```bash
cd server
npm run restore
```
Then select which backup to restore from the list.

### Backup Location
- Backups are stored in: `server/data/backups/`
- Format: `crm_backup_YYYY-MM-DD_HH-MM.json`

## Important Notes

### ⚠️ Current Limitations
1. **JSON File Storage**: While reliable, JSON files have size limits
2. **Single File**: All data in one file (backup the entire file)
3. **No Real-time Replication**: Single point of storage

### ✅ Recommended Practices
1. **Regular Backups**: Run `npm run backup` daily or weekly
2. **File System Backup**: Copy `server/data/` folder regularly
3. **Cloud Backup**: Consider backing up to cloud storage (Google Drive, Dropbox, etc.)
4. **Version Control**: Don't commit `crm.json` to Git (it's in `.gitignore`)

### 🔄 Future Migration Options
If you need more robust storage in the future:
- **SQLite**: Lightweight database, easy migration
- **PostgreSQL/MySQL**: Full-featured database for larger scale
- **MongoDB**: Document-based database (similar structure to JSON)

## Data Integrity Checks

The system automatically:
- ✅ Validates JSON before saving
- ✅ Checks for data loss
- ✅ Creates backups before major operations
- ✅ Restores from backups if corruption detected

## File Size Monitoring

As your business grows:
- Monitor `crm.json` file size
- If it exceeds 10-50 MB, consider migrating to a database
- Current system handles up to ~1000-5000 records efficiently

## Emergency Recovery

If data is lost or corrupted:
1. Check `server/data/backups/` for recent backups
2. Run `npm run restore` to restore from backup
3. If backups are missing, check if you have any manual copies
4. Contact support if critical data is lost

---

**Last Updated**: System automatically maintains backups and data integrity.
