# Tonio & Senora CRM System

A comprehensive Customer Relationship Management system built with Node.js, Express, React, and PostgreSQL.

## 🌐 Live Demo

**Frontend:** [https://roshil-6.github.io/crm-testfinal/](https://roshil-6.github.io/crm-testfinal/)

**Backend API:** Deploy to Railway (see setup below)

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- PostgreSQL database (Railway, Supabase, or local)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/roshil-6/crm-testfinal.git
   cd crm-testfinal
   ```

2. **Install dependencies**
   ```bash
   # Backend
   cd server
   npm install
   
   # Frontend
   cd ../client
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Copy the example file
   cd ../server
   cp .env.example .env
   
   # Edit .env and add your:
   # - DATABASE_URL (PostgreSQL connection string)
   # - JWT_SECRET (a strong random string)
   # - PORT (default: 5002)
   ```

4. **Initialize the database**
   ```bash
   cd server
   npm run init-db
   npm run create-all-users
   ```

5. **Start the application**
   ```bash
   # Option 1: Use the batch file (Windows)
   # Double-click: START_EVERYTHING.bat
   
   # Option 2: Manual start
   # Terminal 1 - Backend
   cd server
   node index.js
   
   # Terminal 2 - Frontend
   cd client
   npm start
   ```

6. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5002

## 📋 Features

- **Lead Management**: Create, update, and track leads
- **Bulk Import**: Import leads from CSV/Excel files (including Meta Ads format)
- **Client Management**: Convert leads to clients and manage client information
- **User Management**: Role-based access control with multiple user roles
- **Dashboard**: Comprehensive analytics and performance tracking
- **Attendance Tracking**: Monitor staff check-in/check-out times
- **Notifications**: Real-time notifications for lead assignments and updates
- **Email Templates**: Manage and schedule follow-up emails

## 👥 User Roles

- **ADMIN**: Full system access
- **SALES_TEAM_HEAD**: Manage team and view team performance
- **SALES_TEAM**: Manage assigned leads
- **PROCESSING**: Handle processing tasks

## 🔒 Security

- Passwords are hashed using bcrypt
- JWT-based authentication
- Role-based access control (RBAC)
- Environment variables for sensitive data
- SQL injection protection via parameterized queries

## 📁 Project Structure

```
CRM/
├── client/          # React frontend
├── server/          # Node.js/Express backend
│   ├── config/      # Database configuration
│   ├── routes/      # API routes
│   ├── middleware/  # Authentication middleware
│   ├── scripts/     # Utility scripts
│   └── services/    # Business logic services
└── README.md
```

## 🛠️ Available Scripts

### Backend (server/)
- `npm start` - Start the server
- `npm run init-db` - Initialize PostgreSQL database schema
- `npm run create-all-users` - Create all default users
- `npm run migrate-columns` - Add missing columns to existing database

### Frontend (client/)
- `npm start` - Start development server
- `npm build` - Build for production

## 📝 API Documentation

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Leads
- `GET /api/leads` - Get all leads (filtered by role)
- `POST /api/leads` - Create new lead
- `PUT /api/leads/:id` - Update lead
- `POST /api/leads/bulk-import` - Bulk import leads from CSV/Excel
- `POST /api/leads/bulk-assign` - Bulk assign leads to staff

### Dashboard
- `GET /api/dashboard` - Get dashboard data (role-based)
- `GET /api/dashboard/staff/:id` - Get staff performance data

## 🚀 Deployment

### GitHub Pages (Frontend)
1. Go to repository Settings → Pages
2. Source: GitHub Actions
3. Add secret: `REACT_APP_API_URL` (your backend URL)
4. Push to main branch (auto-deploys)

### Railway (Backend)
1. Go to: https://railway.app/project/prj_GQc4tWas2Lu4FHN56EUceFKFRR4a
2. Add service from GitHub repo
3. Root Directory: `server`
4. Start Command: `node index.js`
5. Add environment variables (see server/.env.example)

## 🔧 Configuration

### Database
The application uses PostgreSQL. Set up your database connection in `server/.env`:

```env
DATABASE_URL=postgresql://user:password@host:port/database
```

### Ports
- Backend: 5002 (configurable via `PORT` in `.env`)
- Frontend: 3000 (React default)

## 🐛 Troubleshooting

### Server won't start
1. Check that PostgreSQL database is accessible
2. Verify `DATABASE_URL` in `server/.env` is correct
3. Ensure port 5002 is not in use
4. Check server logs for error messages

### Login fails
1. Verify users exist in database: `npm run create-all-users`
2. Check backend is running on correct port
3. Verify JWT_SECRET is set in `.env`

### Database connection errors
1. Verify DATABASE_URL format is correct
2. Check database server is running
3. Verify network connectivity
4. Check SSL settings if using cloud database

## 📄 License

This project is proprietary software for Tonio & Senora.

## 👨‍💻 Development

For development setup and contribution guidelines, see the development documentation.

---

**Note**: Never commit `.env` files or sensitive credentials to version control.
