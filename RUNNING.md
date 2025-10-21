# Running the Vinyl Collection Manager Locally

## Quick Start

### 1. Start the Backend Server

```bash
./start_server.sh
```

The server will start on **port 3000** in development mode.

### 2. Run the Frontend (Choose ONE option)

#### Option A: Development Mode (Recommended for local testing)

```bash
cd frontend
npm run dev
```

This starts the Vite dev server on **port 5173** with hot reload. The dev server is configured to proxy API requests to the backend on port 3000.

**Access the app at: `http://localhost:5173`**

#### Option B: Production Build

If you've already built the frontend with `npm run build`, the backend serves the static files from `frontend/dist`.

**Access the app at: `http://localhost:3000`**

⚠️ **Note**: The production build is configured to connect to the production server URL. To test locally with the production build, you need to build with development settings (see below).

## Detailed Setup

### Backend

1. **Environment Setup**
   - Ensure you have a `.env` file in the project root with:
     ```
     FLASK_SECRET_KEY=your-secret-key
     SUPABASE_URL=your-supabase-url
     SUPABASE_KEY=your-supabase-anon-key
     SPOTIFY_CLIENT_ID=your-spotify-client-id
     SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
     SPOTIFY_REDIRECT_URI=http://localhost:3000/api/spotify/callback
     DISCOGS_TOKEN=your-discogs-token
     ```

2. **Install Dependencies**
   ```bash
   poetry install
   ```

3. **Run the Server**
   ```bash
   ./start_server.sh
   ```

The backend will:
- Run on port 3000 (development) or 10000 (production)
- Use relaxed session cookie settings for HTTP (development)
- Serve the frontend static files from `frontend/dist` (if available)

### Frontend

#### Development Mode (Hot Reload)

```bash
cd frontend
npm install  # First time only
npm run dev
```

- Vite dev server runs on port 5173
- API requests are proxied to `http://localhost:3000`
- Hot reload enabled
- Uses `http://localhost:3000` as the API base URL

#### Production Build for Local Testing

If you want to test the production build locally:

1. **Set environment to development during build:**
   ```bash
   cd frontend
   NODE_ENV=development npm run build
   ```

2. **Or modify `api.ts` temporarily** to always use localhost:
   ```typescript
   const API_URL = 'http://localhost:3000';
   ```

3. **Then build:**
   ```bash
   npm run build
   ```

4. **Access at:** `http://localhost:3000`

## Troubleshooting

### "Network Error" when logging in

**Symptoms**: 
- Browser console shows CORS errors
- Requests go to `https://vinyl-collection-manager.onrender.com` instead of `localhost`

**Solution**: You're using a production build. Use **Option A** (dev mode) instead:
```bash
cd frontend
npm run dev
```

### Session cookies not being set

**Symptoms**: 401 errors, "User not authenticated"

**Solution**: Make sure you're using `http://localhost:3000` (or `http://localhost:5173` for dev mode), not `localhost:10000`.

### Port already in use

**Symptoms**: `Address already in use` error

**Solution**:
```bash
# Find and kill the process using port 3000
lsof -ti:3000 | xargs kill -9
```

### Import errors when starting backend

**Symptoms**: `ImportError: attempted relative import with no known parent package`

**Solution**: Make sure you're running the server with `./start_server.sh`, not directly with `python barcode_scanner/server.py`.

## Development Workflow

For active development:

1. **Terminal 1**: Run backend
   ```bash
   ./start_server.sh
   ```

2. **Terminal 2**: Run frontend dev server
   ```bash
   cd frontend
   npm run dev
   ```

3. **Open browser**: `http://localhost:5173`

4. Make changes to frontend code - they'll hot reload automatically
5. Make changes to backend code - Flask will auto-reload

## Production Deployment

The app is configured for Render.com:

- Backend runs with Gunicorn on port 10000
- Frontend is built and served as static files
- Uses strict HTTPS-only session cookies
- Environment is set to `production` via `FLASK_ENV` variable

No changes to the code are needed for production - the environment-based configuration handles it automatically.
