const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { authenticate, requireHrOrAdmin } = require('../middleware/auth');

const router = express.Router();

// --- File Upload Configuration ---
const uploadDir = path.join(__dirname, '../uploads/staff_docs');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Save as: userId_slotNumber_timestamp_originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, req.params.id + '_' + req.params.slot + '_' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// --- Routes ---

// Get all staff (for HR list)
router.get('/staff', authenticate, requireHrOrAdmin, async (req, res) => {
    try {
        // Fetch all users
        const allUsers = await db.getUsers();
        // Filter for roles that are considered "Staff" generally (or just return everyone except maybe customers if any?)
        // Requirement says "List all staff". We'll return everyone for now as the system seems to be internal.
        // Or filter out 'ADMIN' if they shouldn't be managed? usually admins manage admins too.
        // Let's return all users for simplicity as per "List ALL staffs".

        // Maybe exclude the current user? No, HR might need to see themselves?

        const staffList = allUsers.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            team: u.team,
            phone_number: u.phone_number,
            office_number: u.office_number,
            dob: u.dob,
            profile_photo: sanitizeProfilePhotoForList(u)
        }));

        res.json(staffList);
    } catch (error) {
        console.error('HR Staff List Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get specific staff details
router.get('/staff/:id', authenticate, requireHrOrAdmin, async (req, res) => {
    try {
        const users = await db.getUsers({ id: req.params.id });
        if (users.length === 0) {
            return res.status(404).json({ error: 'Staff not found' });
        }
        const user = users[0];
        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            team: user.team,
            phone_number: user.phone_number,
            office_number: user.office_number,
            dob: user.dob
        });
    } catch (error) {
        console.error('HR Get Staff Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get documents for specific staff
router.get('/staff/:id/documents', authenticate, requireHrOrAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const docs = await db.getStaffDocuments(userId);
        res.json(docs);
    } catch (error) {
        console.error('HR Get Docs Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Upload document to specific slot
router.post('/staff/:id/documents/:slot', authenticate, requireHrOrAdmin, upload.single('document'), async (req, res) => {
    try {
        const userId = req.params.id;
        const slotNumber = parseInt(req.params.slot);

        if (slotNumber < 1 || slotNumber > 10) {
            return res.status(400).json({ error: 'Invalid slot number (1-10)' });
        }

        if (!req.file) {
            console.warn(`Upload failed for user ${userId} slot ${slotNumber}: No file in request`);
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log(`Uploading document for user ${userId} slot ${slotNumber}:`, {
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            path: req.file.path,
            destination: req.file.destination
        });

        // Verify file exists on disk
        if (!fs.existsSync(req.file.path)) {
            console.error(`CRITICAL: File not saved to disk at ${req.file.path}`);
            return res.status(500).json({ error: 'File upload failed - file not saved to disk' });
        }

        // Save to DB
        const docData = {
            user_id: userId,
            slot_number: slotNumber,
            file_path: req.file.filename, // Store filename relative to uploadDir
            file_name: req.file.originalname,
            uploaded_by: req.user.id
        };

        const savedDoc = await db.saveStaffDocument(docData);
        console.log(`Document saved to DB:`, savedDoc);

        res.json(savedDoc);
    } catch (error) {
        console.error('HR Upload Error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// Delete document
router.delete('/documents/:id', authenticate, requireHrOrAdmin, async (req, res) => {
    try {
        const docId = req.params.id;
        const deletedDoc = await db.deleteStaffDocument(docId);

        if (deletedDoc) {
            // Remove file from FS
            const filePath = path.join(uploadDir, deletedDoc.file_path);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            res.json({ message: 'Document deleted' });
        } else {
            res.status(404).json({ error: 'Document not found' });
        }
    } catch (error) {
        console.error('HR Delete Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Serve document (View/Download)
router.get('/documents/:id/view', authenticate, requireHrOrAdmin, async (req, res) => {
    try {
        const docId = req.params.id;
        
        // Fetch document from database
        const doc = await db.getStaffDocumentById(docId);

        if (!doc) {
            console.warn(`Document ID ${docId} not found in database`);
            return res.status(404).send('Document not found');
        }

        // Construct full file path
        const filePath = path.join(uploadDir, doc.file_path);
        
        // Check if file exists on disk
        if (!fs.existsSync(filePath)) {
            console.error(`File not found on disk: ${filePath}. DB ref: ${doc.file_path}. Upload dir: ${uploadDir}`);
            return res.status(404).send('File not found on server');
        }

        // Get file extension to determine MIME type
        const ext = path.extname(doc.file_name).toLowerCase();
        let mimeType = 'application/octet-stream';
        
        // Common MIME types
        const mimeMap = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.txt': 'text/plain',
            '.zip': 'application/zip',
            '.rar': 'application/x-rar-compressed',
            '.csv': 'text/csv'
        };
        
        if (mimeMap[ext]) {
            mimeType = mimeMap[ext];
        }
        
        // Set response headers for file download
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        
        // Send the file
        res.sendFile(filePath);
        console.log(`Document served: ${doc.file_name}`);
    } catch (error) {
        console.error('HR View Doc Error:', error);
        if (!res.headersSent) {
            res.status(500).send('Server error: ' + error.message);
        }
    }
});

// --- Profile Photo ---

const profilePhotoDir = path.join(__dirname, '../uploads/profile_photos');
if (!fs.existsSync(profilePhotoDir)) fs.mkdirSync(profilePhotoDir, { recursive: true });

/** Max stored size for base64 in DB (~350KB raw image) — works on Render without persistent disk */
const MAX_PROFILE_PHOTO_CHARS = 500000;

const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 }, // 4MB before base64
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files allowed'));
    }
});

function sanitizeProfilePhotoForList(u) {
    if (!u.profile_photo) return null;
    if (String(u.profile_photo).startsWith('data:')) return 'inline';
    return u.profile_photo;
}

// Upload profile photo — stored in DB as data URL (survives ephemeral cloud filesystems)
router.post('/staff/:id/photo', authenticate, requireHrOrAdmin, photoUpload.single('photo'), async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'No image uploaded' });
        const mime = req.file.mimetype || 'image/jpeg';
        const b64 = req.file.buffer.toString('base64');
        const dataUrl = `data:${mime};base64,${b64}`;
        if (dataUrl.length > MAX_PROFILE_PHOTO_CHARS) {
            return res.status(400).json({ error: 'Image too large. Please use a smaller image (under ~350KB).' });
        }
        const photoUrl = `/api/hr/staff/${req.params.id}/photo`;
        await db.updateUser(parseInt(req.params.id, 10), { profile_photo: dataUrl });
        res.json({ photo_url: photoUrl, storage: 'database' });
    } catch (error) {
        console.error('Profile photo upload error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Serve profile photo (from DB data URL or legacy disk file)
router.get('/staff/:id/photo', authenticate, async (req, res) => {
    try {
        const users = await db.getUsers({ id: req.params.id });
        if (!users.length || !users[0].profile_photo) {
            return res.status(404).json({ error: 'No photo' });
        }
        const raw = users[0].profile_photo;
        if (String(raw).startsWith('data:')) {
            const m = /^data:([^;]+);base64,(.+)$/s.exec(raw);
            if (!m) return res.status(500).json({ error: 'Invalid stored photo' });
            const buf = Buffer.from(m[2], 'base64');
            res.setHeader('Content-Type', m[1]);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            return res.send(buf);
        }
        const filePath = path.join(profilePhotoDir, raw);
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).json({ error: 'Photo file not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete profile photo
// Get upcoming birthdays (next 30 days)
router.get('/birthdays/upcoming', authenticate, requireHrOrAdmin, async (req, res) => {
    try {
        // We'll fetch all users with DOB and filter in JS for simplicity/reliability across timezones
        const users = await db.getUsers();
        const staffWithDob = users.filter(u => u.dob);

        const today = new Date();
        const next30Days = new Date();
        next30Days.setDate(today.getDate() + 30);

        const upcomingBirthdays = staffWithDob.filter(u => {
            const dob = new Date(u.dob);
            const birthdayThisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
            const birthdayNextYear = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());

            // Check if birthday falls between today and next 30 days
            return (birthdayThisYear >= today && birthdayThisYear <= next30Days) ||
                (birthdayNextYear >= today && birthdayNextYear <= next30Days);
        }).map(u => ({
            id: u.id,
            name: u.name,
            dob: u.dob,
            profile_photo: sanitizeProfilePhotoForList(u),
            role: u.role
        }));

        // Sort by date (ignoring year)
        upcomingBirthdays.sort((a, b) => {
            const dateA = new Date(a.dob);
            const dateB = new Date(b.dob);
            const monthDiff = dateA.getMonth() - dateB.getMonth();
            if (monthDiff !== 0) return monthDiff;
            return dateA.getDate() - dateB.getDate();
        });

        res.json(upcomingBirthdays);
    } catch (error) {
        console.error('Upcoming Birthdays Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/staff/:id/photo', authenticate, requireHrOrAdmin, async (req, res) => {
    try {
        const users = await db.getUsers({ id: req.params.id });
        if (users.length && users[0].profile_photo) {
            const p = users[0].profile_photo;
            if (typeof p === 'string' && !p.startsWith('data:')) {
                const filePath = path.join(profilePhotoDir, p);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
            await db.updateUser(parseInt(req.params.id, 10), { profile_photo: null });
        }
        res.json({ message: 'Photo removed' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
