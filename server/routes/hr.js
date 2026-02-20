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
            team: u.team
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
            team: user.team
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
            return res.status(400).json({ error: 'No file uploaded' });
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

        // Log activity? (Optional but good)

        res.json(savedDoc);
    } catch (error) {
        console.error('HR Upload Error:', error);
        res.status(500).json({ error: 'Server error' });
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
        // We need to fetch the document details to get the filename
        // Since we don't have a direct getDocumentById, we'll implement a quick lookup
        // Ideally this should be in database.js, but for now we can rely on the fact that we can query the table.
        // Wait, we can't query directly here.
        // Let's use the DB helper we added? No, we didn't add one for single doc.
        // We'll iterate the user's docs. It's inefficient but works for now.
        // Actually, let's fix this properly. I'll add `getStaffDocumentById` to database.js in the next step.
        // For now, I will optimistically implement this assuming the DB helper exists, 
        // OR I will just use `db.getStaffDocuments` for the user if I knew the user ID. I don't.

        // HACK: For now, I will LIST ALL docs (if I could) or I will trust the client to send the path? NO.
        // I HAVE TO add `getDocumentById` to database.js. 

        // Let's assume I will add `db.getStaffDocumentById(docId)` in the next tool call.
        const doc = await db.getStaffDocumentById(docId);

        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const filePath = path.join(uploadDir, doc.file_path);
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).json({ error: 'File not found on server' });
        }
    } catch (error) {
        console.error('HR View Doc Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Profile Photo ---

const profilePhotoDir = path.join(__dirname, '../uploads/profile_photos');
if (!fs.existsSync(profilePhotoDir)) fs.mkdirSync(profilePhotoDir, { recursive: true });

const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, profilePhotoDir),
    filename: (req, file, cb) => cb(null, `profile_${req.params.id}${path.extname(file.originalname)}`),
});
const photoUpload = multer({
    storage: photoStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files allowed'));
    }
});

// Upload profile photo
router.post('/staff/:id/photo', authenticate, requireHrOrAdmin, photoUpload.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
        const photoUrl = `/api/hr/staff/${req.params.id}/photo`;
        await db.updateUser(parseInt(req.params.id), { profile_photo: req.file.filename });
        res.json({ photo_url: photoUrl, filename: req.file.filename });
    } catch (error) {
        console.error('Profile photo upload error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Serve profile photo
router.get('/staff/:id/photo', authenticate, async (req, res) => {
    try {
        const users = await db.getUsers({ id: req.params.id });
        if (!users.length || !users[0].profile_photo) {
            return res.status(404).json({ error: 'No photo' });
        }
        const filePath = path.join(profilePhotoDir, users[0].profile_photo);
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
            profile_photo: u.profile_photo,
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
            const filePath = path.join(profilePhotoDir, users[0].profile_photo);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            await db.updateUser(parseInt(req.params.id), { profile_photo: null });
        }
        res.json({ message: 'Photo removed' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
