# All Menus

A restaurant finder web app that lets users search for restaurants nearby, view details, and save favorites.

## Features

- Search restaurants by name, cuisine, or dish (e.g. "pizza", "sushi", "McDonald's")
- Search by address, city, or zip code — or use your current location via GPS
- Adjustable search radius (5–50 miles)
- Restaurant detail pages with photos, hours, contact info, and links to menus
- User accounts (sign up / log in) powered by Supabase
- Save favorite restaurants; favorites are synced to your account
- Pending favorite flow: if you click a heart while logged out, you're redirected to login and the favorite is automatically saved once you sign in
- Progressive Web App (PWA) — installable on mobile and desktop devices
- Deployed on Netlify with serverless API functions

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML, CSS, JavaScript (no framework) |
| Auth & Database | Supabase (email/password auth, Postgres with RLS) |
| Restaurant Data | Google Places API (New) |
| Geocoding | Nominatim (OpenStreetMap) |
| Local Backend | Node.js + Express (dev only) |
| Production API | Netlify Functions (serverless) |
| Hosting | Netlify |

## Project Structure

```
menu app/
├── frontend/               # Static site (published to Netlify)
│   ├── index.html          # Home / search page
│   ├── menu-selection.html # Restaurant list results
│   ├── restaurant-detail.html
│   ├── login.html
│   ├── signup.html
│   ├── favorites.html
│   ├── style.css
│   ├── auth.js             # Supabase auth + favorites manager (loaded on every page)
│   ├── function.js         # Search, results rendering
│   ├── detail.js           # Restaurant detail page logic
│   ├── favorites.js        # Favorites page logic
│   ├── sw.js               # Service worker (PWA caching)
│   └── favicon/
│       └── site.webmanifest
├── backend/                # Local dev server only
│   ├── server.js
│   └── routes/
│       └── menus.js
├── netlify/
│   └── functions/
│       └── api.js          # Self-contained Netlify Function (all API routes)
├── netlify.toml
└── package.json            # Root-level deps for Netlify Functions (axios, dotenv)
```

## Local Development

### Prerequisites

- Node.js 18+
- A [Google Places API key](https://developers.google.com/maps/documentation/places/web-service/overview) (New API, not legacy)
- A [Supabase](https://supabase.com) project

### Setup

1. Clone the repo and install backend dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Create `backend/.env` from the example:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Then fill in your values:
   ```
   GOOGLE_PLACES_API_KEY=your_key_here
   PORT=3001
   ```

3. Add your Supabase credentials to `frontend/auth.js` (the `SUPABASE_URL` and `SUPABASE_ANON_KEY` constants at the top of the file).

4. Start the backend (also serves the frontend at `http://localhost:3001`):
   ```bash
   cd backend
   npm run dev
   ```

5. Open `http://localhost:3001` in your browser.

> The frontend must be served over HTTP (not opened as a `file://` URL) for the service worker and PWA features to work.

## Deploying to Netlify

1. Push the project to a GitHub repository.

2. Connect the repo in the [Netlify dashboard](https://app.netlify.com). Netlify will automatically detect `netlify.toml` and use these settings:
   - **Publish directory:** `frontend/`
   - **Functions directory:** `netlify/functions/`

3. In **Site settings → Environment variables**, add:
   ```
   GOOGLE_PLACES_API_KEY=your_key_here
   ```

4. Deploy. All `/api/*` requests are redirected to `/.netlify/functions/api` via the redirect rule in `netlify.toml`.

## Supabase Setup

Create a `favorites` table with the following columns:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key, default `gen_random_uuid()` |
| `user_id` | `uuid` | References `auth.users` |
| `place_id` | `text` | Google Place ID |
| `name` | `text` | |
| `address` | `text` | |
| `cuisine` | `text` | |
| `rating` | `numeric` | Nullable |
| `price` | `text` | |
| `maps_url` | `text` | |
| `created_at` | `timestamptz` | Default `now()` |

Add a unique constraint on `(user_id, place_id)` and enable Row Level Security with policies so users can only read and write their own rows.
