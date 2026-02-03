import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import API_BASE_URL from '../config/api';
import './Notifications.css';
import { FiBell, FiX } from 'react-icons/fi';

const Notifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      fetchUnreadCount();
      
      // Poll for new notifications every 30 seconds
      const interval = setInterval(() => {
        fetchNotifications();
        fetchUnreadCount();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/notifications`);
      setNotifications(response.data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setNotifications([]);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/notifications/unread/count`);
      setUnreadCount(response.data?.count || 0);
    } catch (error) {
      console.error('Error fetching unread count:', error);
      setUnreadCount(0);
    }
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      await axios.put(`${API_BASE_URL}/api/notifications/${notificationId}/read`);
      fetchNotifications();
      fetchUnreadCount();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await axios.put(`${API_BASE_URL}/api/notifications/read-all`);
      fetchNotifications();
      fetchUnreadCount();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      handleMarkAsRead(notification.id);
    }
  };

  const unreadNotifications = notifications.filter(n => !n.read);
  const readNotifications = notifications.filter(n => n.read);

  return (
    <div className="notifications-container" ref={dropdownRef}>
      <button
        className="notifications-bell"
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
      >
        <FiBell />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notifications-dropdown">
          <div className="notifications-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button
                className="mark-all-read-btn"
                onClick={handleMarkAllAsRead}
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="notifications-list">
            {notifications.length === 0 ? (
              <div className="no-notifications">No notifications</div>
            ) : (
              <>
                {unreadNotifications.length > 0 && (
                  <div className="notifications-section">
                    <div className="section-header">New</div>
                    {unreadNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        className="notification-item unread"
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="notification-content">
                          <div className="notification-message">{notification.message}</div>
                          <div className="notification-time">
                            {new Date(notification.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="notification-dot"></div>
                      </div>
                    ))}
                  </div>
                )}

                {readNotifications.length > 0 && (
                  <div className="notifications-section">
                    <div className="section-header">Earlier</div>
                    {readNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        className="notification-item read"
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="notification-content">
                          <div className="notification-message">{notification.message}</div>
                          <div className="notification-time">
                            {new Date(notification.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
