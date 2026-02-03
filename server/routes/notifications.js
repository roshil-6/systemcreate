const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get all notifications for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await db.getNotifications({ user_id: userId });
    
    // Add lead name if available
    const notificationsWithDetails = await Promise.all(notifications.map(async notification => {
      const notificationData = { ...notification };
      if (notification.lead_id) {
        const leads = await db.getLeads({ id: notification.lead_id });
        const lead = leads[0];
        if (lead) {
          notificationData.lead_name = lead.name;
        }
      }
      return notificationData;
    }));
    
    res.json(notificationsWithDetails);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get unread notifications count
router.get('/unread/count', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const unreadNotifications = await db.getNotifications({ user_id: userId, read: false });
    res.json({ count: unreadNotifications.length });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Mark notification as read
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = parseInt(req.params.id);
    
    const notifications = await db.getNotifications({ id: notificationId });
    const notification = notifications[0];
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    // Verify the notification belongs to the user
    if (notification.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updatedNotification = await db.markNotificationAsRead(notificationId);
    res.json(updatedNotification);
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Mark all notifications as read
router.put('/read-all', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const updatedNotifications = await db.markAllNotificationsAsRead(userId);
    res.json({ message: 'All notifications marked as read', count: updatedNotifications.length });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

module.exports = router;
