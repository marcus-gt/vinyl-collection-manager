# Backend Settings Sync Implementation

## Overview
User settings (column order and visibility) are now stored in the backend database and synced across all devices. This ensures a consistent experience whether you're using desktop, mobile, or switching between devices.

## What Was Implemented

### 1. Database Table (`user_settings`)
- **Location**: `supabase/migrations/20250129000000_add_user_settings.sql`
- **Structure**:
  - `id`: UUID primary key
  - `user_id`: Foreign key to auth.users
  - `setting_key`: Text key (e.g., 'table-column-order')
  - `setting_value`: JSONB value (stores any JSON data)
  - `created_at`, `updated_at`: Timestamps
- **Security**: Row Level Security (RLS) policies ensure users can only access their own settings
- **Index**: Optimized for fast lookups by user_id + setting_key

### 2. Backend API Routes
- **Location**: `barcode_scanner/server.py` (lines 901-961)
- **Endpoints**:
  - `GET /api/settings` - Get all settings for current user
  - `GET /api/settings/<key>` - Get specific setting
  - `POST /api/settings` - Create or update setting (uses upsert)
- **Authentication**: All routes require user authentication via session

### 3. Frontend API Service
- **Location**: `frontend/src/services/api.ts` (lines 726-769)
- **Interface**: `UserSetting` type with proper TypeScript typing
- **Methods**:
  - `userSettings.get(key)` - Fetch single setting
  - `userSettings.set(key, value)` - Save setting
  - `userSettings.getAll()` - Fetch all settings

### 4. React Hook (`useBackendSettings`)
- **Location**: `frontend/src/hooks/useBackendSettings.ts`
- **Features**:
  - **Seamless sync**: Automatically loads from backend on mount
  - **LocalStorage fallback**: If backend fails, uses localStorage
  - **Debounced saves**: Waits 500ms before saving to backend to avoid excessive API calls
  - **Immediate UI updates**: Updates localStorage instantly for responsive UX
  - **Type-safe**: Full TypeScript generics support
- **Usage**: `const [value, setValue, loading] = useBackendSettings('key', defaultValue)`

### 5. Collection Component Integration
- **Location**: `frontend/src/pages/Collection.tsx`
- **Changes**:
  - Replaced `useLocalStorage` with `useBackendSettings` for:
    - `columnOrder` (line 2075)
    - `columnVisibility` (line 2076)
  - **Auto-sync new columns**: When custom columns are created, they're automatically added to the end of `columnOrder` (lines 2280-2293)
  - **Auto-clean deleted columns**: When columns are deleted, they're removed from both `columnOrder` and `columnVisibility` (lines 3129-3137)

## User Experience

### For Users:
1. **Seamless**: Settings load automatically, no manual sync required
2. **Fast**: LocalStorage provides instant feedback, backend syncs in background
3. **Reliable**: If backend is unavailable, localStorage serves as fallback
4. **Cross-device**: Open the app on any device and see the same column order/visibility

### For New Custom Columns:
- When you create a custom column, it automatically appears at the **rightmost position** in the table
- This order is immediately saved to the backend
- Opening the app on another device will show the new column in the same position

### For Column Deletion:
- Deleting a column removes it from the table order
- The change syncs immediately across all open tabs/devices

## Technical Details

### Data Flow:
1. **Initial Load**:
   - Hook tries to fetch from backend
   - If successful, updates state and caches in localStorage
   - If fails, falls back to localStorage
   - If localStorage is empty, uses default value

2. **User Updates** (e.g., reordering columns):
   - State updates immediately (instant UI feedback)
   - localStorage updates immediately (fast reload)
   - Backend update is debounced (500ms delay)
   - If backend save fails, data persists in localStorage

3. **Auto-sync** (new/deleted columns):
   - `loadCustomColumns()` checks for new columns
   - Adds new column IDs to end of `columnOrder`
   - Updates are saved via `useBackendSettings` (debounced)

### Performance Optimizations:
- **Debouncing**: Prevents API spam when user rapidly reorders columns
- **Upsert**: Database uses ON CONFLICT to efficiently update existing settings
- **Caching**: LocalStorage provides instant reads without network calls
- **Lazy loading**: Settings only load once on component mount

## Migration Notes

### For Existing Users:
- On first load with new code, the hook will:
  1. Check backend (no data yet)
  2. Load from localStorage (existing data)
  3. Save localStorage data to backend
- Future loads will use backend as source of truth

### Database Migration:
Run the migration with Supabase CLI:
```bash
cd vinyl-collection-manager
supabase db push
```

Or apply manually via Supabase dashboard.

## Future Enhancements

Potential additions using the same `user_settings` infrastructure:
- Sort preferences (which column, asc/desc)
- Page size preference
- Filter presets
- Default view (grid vs list)
- Theme preferences
- Recently viewed records
- Saved searches

All can use the same `userSettings` API and `useBackendSettings` hook!

