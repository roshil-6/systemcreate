# Deployment Guide for Vercel and Netlify

## Important Notes

This is a **full-stack application** with:
- **Frontend**: React app (in `client/` folder)
- **Backend**: Node.js/Express API (in `server/` folder)

## Deployment Options

### Option 1: Deploy Frontend Only (Recommended for Now)

Since the backend uses a JSON file database that requires file system access, you have two options:

#### A. Deploy Frontend to Vercel/Netlify
- Deploy only the `client/` folder
- Point API to a separate backend deployment (Heroku, Railway, Render, etc.)

#### B. Deploy Full Stack
- Backend needs a platform that supports file system (not Vercel/Netlify serverless)
- Consider: Heroku, Railway, Render, DigitalOcean

---

## Vercel Deployment (Frontend Only)

### Step 1: Deploy Frontend
1. Go to [Vercel](https://vercel.com)
2. Import your GitHub repository
3. **Root Directory**: Set to `client`
4. **Build Command**: `npm run build`
5. **Output Directory**: `build`
6. **Install Command**: `npm install`

### Step 2: Environment Variables
Add these in Vercel dashboard:
```
REACT_APP_API_URL=https://your-backend-url.herokuapp.com
```

### Step 3: Update API Config
The API URL in `client/src/config/api.js` will use the environment variable.

---

## Netlify Deployment (Frontend Only)

### Step 1: Deploy Frontend
1. Go to [Netlify](https://netlify.com)
2. Import your GitHub repository
3. **Base directory**: `client`
4. **Build command**: `npm run build`
5. **Publish directory**: `client/build`

### Step 2: Environment Variables
Add these in Netlify dashboard:
```
REACT_APP_API_URL=https://your-backend-url.herokuapp.com
```

### Step 3: SPA Routing
The `netlify.toml` file already includes redirects for React Router.

---

## Backend Deployment (Separate)

### Recommended Platforms:
1. **Heroku** - Easy deployment
2. **Railway** - Modern alternative
3. **Render** - Free tier available
4. **DigitalOcean App Platform**

### Backend Environment Variables Needed:
```
PORT=5001
JWT_SECRET=your-secret-key-here
NODE_ENV=production
```

---

## Current Repository Structure

```
CRM/
├── client/          # React Frontend (deploy this to Vercel/Netlify)
│   ├── src/
│   ├── public/
│   └── package.json
├── server/          # Node.js Backend (deploy separately)
│   ├── routes/
│   ├── config/
│   └── package.json
├── vercel.json      # Vercel config
└── netlify.toml     # Netlify config
```

---

## Quick Fix for 404 Errors

If you're getting 404 errors:

1. **Check Root Directory**: Make sure Vercel/Netlify is pointing to `client/` folder
2. **Check Build Output**: Should be `build/` directory
3. **Check Environment Variables**: `REACT_APP_API_URL` must be set
4. **Check Routing**: SPA redirects should be configured (already in config files)

---

## Testing Locally Before Deployment

```bash
# Terminal 1 - Backend
cd server
npm install
npm start

# Terminal 2 - Frontend
cd client
npm install
npm start
```

Visit: http://localhost:3000

---

## After Deployment

1. Update `REACT_APP_API_URL` to your backend URL
2. Redeploy frontend
3. Test the application

---

**Note**: The backend cannot run on Vercel/Netlify serverless functions because it uses a JSON file database that requires persistent file system access. You need a traditional server platform for the backend.
