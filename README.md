# Vinyl Collection Manager

A full-stack web application for managing your vinyl record collection with barcode scanning, Discogs integration, Spotify playlists, and custom metadata tracking.

## Features

### Core Functionality
- 📷 **Barcode scanning** using device camera
- 🎵 **Discogs integration** for detailed record information (artist, album, year, label, genres, styles, musicians)
- 🎶 **Spotify integration** for playlist management and auto-sync
- 📊 **Advanced table view** with sorting, filtering, and column customization
- 🏷️ **Custom columns** for personal metadata (condition, location, purchase date, etc.)
- 🔍 **Multiple search methods**: barcode, Discogs URL, artist/album lookup
- 📱 **Responsive design** that works on mobile and desktop
- 🔐 **User authentication** with secure session management
- 💾 **Auto-save** custom field values with debouncing

## Setup

1. Clone the repository:
```bash
git clone [your-repo-url]
cd vinyl-barcode-scanner
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Create a `.env` file in the root directory with your Discogs API token:
```
DISCOGS_TOKEN=your_token_here
```

4. Run the development server:
```bash
cd barcode-scanner
python server.py
```

5. Open `http://localhost:3000` in your browser

## Development

The project structure:
```
vinyl-barcode-scanner/
├── barcode-scanner/
│   ├── app.js          # Frontend JavaScript
│   ├── index.html      # Main HTML file
│   ├── server.py       # Flask server
│   └── styles.css      # CSS styles
├── discogs_lookup.py   # Discogs API interaction
├── discogs_data.py     # Data processing
├── requirements.txt    # Python dependencies
└── render.yaml         # Render deployment config
```

## Deployment

The application is configured for deployment on Render.com. Required environment variables:
- `DISCOGS_TOKEN`: Your Discogs API token
- `FLASK_ENV`: Set to 'production' for deployment

## Tech Stack

### Frontend
- **React** with TypeScript
- **Mantine UI** for components
- **TanStack Table** for advanced table functionality
- **Vite** for build tooling
- **Axios** for API calls

### Backend
- **Flask** (Python) with Gunicorn
- **Supabase** (PostgreSQL) for database and auth
- **Discogs API** for vinyl metadata
- **Spotify API** for playlist integration

## Future Improvements

### High Priority (Recommended)

#### 1. Code Splitting & Bundle Optimization
**Impact**: ~40% faster initial load time (1047 KB → ~400 KB initial bundle)  
**Time**: 2-3 hours

Currently, the entire application bundle is 1047 KB (314 KB gzipped), which can slow down initial page load. Implementing lazy loading for routes will significantly improve performance.

**Implementation:**
```typescript
// In main.tsx or router config
const Collection = lazy(() => import('./pages/Collection'));
const Scanner = lazy(() => import('./pages/Scanner'));
const Login = lazy(() => import('./pages/Login'));

// Wrap routes with Suspense
<Suspense fallback={<LoadingSpinner />}>
  <Routes>
    <Route path="/collection" element={<Collection />} />
    {/* ... */}
  </Routes>
</Suspense>
```

**Benefits:**
- Faster time to first paint
- Reduced initial JavaScript parsing time
- Better mobile experience

#### 2. Discogs API Rate Limiting
**Impact**: Fewer failed lookups, better UX  
**Time**: 1 hour

Add rate limiting to prevent hitting Discogs API limits (60 requests/minute for authenticated users).

**Implementation:**
```python
# In discogs_lookup.py
from time import sleep, time

class RateLimiter:
    def __init__(self, min_interval=1.0):
        self.min_interval = min_interval
        self.last_request = 0
    
    def wait(self):
        elapsed = time() - self.last_request
        if elapsed < self.min_interval:
            sleep(self.min_interval - elapsed)
        self.last_request = time()

rate_limiter = RateLimiter(min_interval=1.0)

# Use before each Discogs API call
rate_limiter.wait()
```

**Benefits:**
- Prevents API rate limit errors
- More reliable lookups
- Better user experience

#### 3. Better Error Handling for Failed Lookups
**Impact**: Improved UX when Discogs data is unavailable  
**Time**: 30 minutes

Currently, errors like "404: That release does not exist" are shown in logs but could be handled more gracefully in the UI.

**Implementation:**
- Add user-friendly error messages
- Provide retry button for failed requests
- Show alternative search methods when lookup fails
- Cache failed lookups to avoid repeated attempts

### Medium Priority (Optional)

#### 4. Virtual Scrolling for Large Collections
**When**: Only if you have 1000+ records  
**Time**: 3-4 hours

The current pagination works well for most collections. Virtual scrolling would only be beneficial for very large datasets.

**Note**: TanStack Table already provides good performance with pagination. Monitor actual performance before implementing this.

#### 5. Improved Caching Strategy
**When**: If you notice slow load times  
**Time**: 2-3 hours

Implement client-side caching for:
- Discogs metadata (reduce API calls for re-scanned items)
- Custom column configurations
- User preferences

**Note**: Supabase already handles server-side caching well. This would only optimize client-side performance.

### Low Priority (Skip for Now)

The following were considered but are **not recommended** at this time:

- ❌ **React.memo() everywhere**: Table already uses proper memoization; premature optimization
- ❌ **Complex state management**: Current React Context works fine for this app size
- ❌ **Additional tests**: Nice to have, but not blocking any features
- ❌ **Microservices architecture**: Overkill for this application

## Performance Notes

Current bundle analysis (production build):
```
dist/assets/index-DHaTUcmb.css    203.66 kB │ gzip:  29.86 kB
dist/assets/index-DKXwiJpS.js   1,047.36 kB │ gzip: 314.95 kB
```

Main contributors to bundle size:
- Mantine UI components (~400 KB)
- TanStack Table (~150 KB)
- React and dependencies (~300 KB)

**Recommendation**: Implement code splitting (Priority #1) to load these libraries on-demand.

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you'd like to change.

### Development Workflow

See [RUNNING.md](RUNNING.md) for detailed instructions on:
- Setting up the local development environment
- Running backend and frontend servers
- Troubleshooting common issues

## License

MIT 
