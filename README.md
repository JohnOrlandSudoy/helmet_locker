# Helmet Locker Admin Dashboard

A complete, production-ready mobile-first admin dashboard for managing the Helmet Locker IoT system. Built with React 18, TypeScript, Tailwind CSS, and Supabase.

## Features

### Authentication
- Secure email/password login via Supabase Auth
- Protected routes with automatic redirect
- Session management with real-time auth state updates

### Dashboard Pages

#### 1. Dashboard Home
- Total users count
- Access attempts today counter
- Recent activity log (last 5 entries)
- Quick unlock button for remote access
- Real-time updates via Supabase subscriptions

#### 2. Add/Register New User
- User name input
- Three enrollment methods:
  - **RFID Card**: Request RFID scan from ESP32 device
  - **Fingerprint**: Request fingerprint enrollment with auto-assigned ID
  - **Face Recognition**: Capture face using device camera with face-api.js
- Live enrollment status feedback
- Preview of enrolled data before saving
- Validation for at least one authentication method

#### 3. Users List
- Searchable table of all registered users
- Display RFID UID, Fingerprint ID, and Face status
- Responsive table with mobile-optimized layout
- Delete user functionality with confirmation
- Real-time updates when users are added/removed

#### 4. Access Logs
- Complete history of all access attempts
- Filter by status (All, Success, Failed)
- Shows user name, method, status, and timestamp
- Responsive table layout
- Real-time updates as new logs arrive

### Design Features
- Dark theme optimized for IoT dashboards
- Fully responsive (mobile, tablet, desktop, laptop)
- Mobile-first approach with collapsible sidebar
- Beautiful gradient cards and hover effects
- Toast notifications for all actions
- Loading states and error handling
- PWA support for installation on mobile devices

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS (dark theme)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Face Recognition**: face-api.js
- **Notifications**: Sonner
- **Icons**: Lucide React
- **PWA**: Service Worker + Web Manifest

## Database Schema

### Tables

1. **users**
   - `id` (uuid, primary key)
   - `name` (text, required)
   - `rfid_uid` (text, nullable, unique)
   - `fingerprint_id` (integer, nullable, unique)
   - `face_descriptor` (jsonb, nullable)
   - `created_at`, `updated_at` (timestamps)

2. **access_logs**
   - `id` (uuid, primary key)
   - `user_id` (uuid, references users)
   - `user_name` (text)
   - `method` ('rfid' | 'fingerprint' | 'face')
   - `status` ('success' | 'failed')
   - `created_at` (timestamp)

3. **enroll_requests**
   - `id` (uuid, primary key)
   - `type` ('rfid' | 'fingerprint')
   - `user_name` (text)
   - `fingerprint_id` (integer, nullable)
   - `processed` (boolean)
   - `rfid_uid` (text, nullable)
   - `created_at` (timestamp)

4. **unlock_requests**
   - `id` (uuid, primary key)
   - `user_id` (uuid, references users)
   - `method` ('admin' | 'face')
   - `processed` (boolean)
   - `created_at` (timestamp)

All tables have Row Level Security (RLS) enabled with policies for authenticated users.

## Setup Instructions

### Prerequisites
- Node.js 18+ installed
- Supabase account (database already configured)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Download face-api.js models:
   - Visit: https://github.com/justadudewhohacks/face-api.js/tree/master/weights
   - Download these files into `/public/models/`:
     - `tiny_face_detector_model-weights_manifest.json`
     - `tiny_face_detector_model-shard1`
     - `face_landmark_68_model-weights_manifest.json`
     - `face_landmark_68_model-shard1`
     - `face_recognition_model-weights_manifest.json`
     - `face_recognition_model-shard1`
     - `face_recognition_model-shard2`

3. Create an admin user in Supabase:
   - Go to Supabase Dashboard > Authentication > Users
   - Click "Add user" > "Create new user"
   - Enter email and password
   - Use these credentials to log in

4. (Optional) Add PWA icons:
   - Create `icon-192.png` and `icon-512.png` in `/public/`
   - Use a lock or helmet design with blue theme (#2563eb)

### Development

Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Production Build

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── Layout.tsx           # Main layout with responsive sidebar
│   └── ProtectedRoute.tsx   # Auth guard component
├── contexts/
│   └── AuthContext.tsx      # Authentication context provider
├── lib/
│   └── supabase.ts          # Supabase client and types
├── pages/
│   ├── AccessLogs.tsx       # Access logs page
│   ├── AddUser.tsx          # User registration page
│   ├── Dashboard.tsx        # Dashboard home page
│   ├── Login.tsx            # Login page
│   └── Users.tsx            # Users list page
├── App.tsx                  # Main app component
└── main.tsx                 # App entry point

public/
├── models/                  # face-api.js model files
├── manifest.json            # PWA manifest
└── sw.js                    # Service worker
```

## ESP32 Integration

The dashboard communicates with ESP32 devices through Supabase real-time subscriptions:

### Enrollment Flow
1. Admin creates enrollment request in `enroll_requests` table
2. ESP32 subscribes to this table and processes new requests
3. ESP32 updates the request with captured data (RFID UID or confirms fingerprint)
4. Dashboard receives update and shows success to admin

### Unlock Flow
1. Admin clicks "Quick Unlock" or triggers face unlock
2. Record inserted into `unlock_requests` table
3. ESP32 receives notification and unlocks the locker
4. ESP32 marks request as processed

### Access Logging
1. When user authenticates on ESP32 (RFID/Fingerprint/Face)
2. ESP32 inserts record into `access_logs` table
3. Dashboard receives real-time update and displays in UI

## Responsive Breakpoints

- **Mobile**: < 640px (single column, hamburger menu)
- **Tablet**: 640px - 1024px (optimized cards, collapsible sidebar)
- **Desktop**: > 1024px (full sidebar, multi-column layout)

## Security Features

- Row Level Security (RLS) on all tables
- Authentication required for all API calls
- Secure session management
- HTTPS enforced (in production)
- No sensitive data in client-side code

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## PWA Features

- Installable on mobile home screen
- Offline-capable with service worker caching
- App-like experience with no browser chrome
- Fast loading with cached assets

## License

MIT License - See LICENSE file for details

## Support

For issues or questions, please refer to the project documentation or contact the development team.
