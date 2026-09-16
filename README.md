# Crumbz — near-expiry food marketplace

A working full-stack build of the Crumbz demo: Express + SQLite backend with
real signup/login (bcrypt-hashed passwords, JWT sessions), and the original
frontend wired up to a REST API instead of mock/local storage.

## What's real now

- **Accounts**: sign up / sign in with a real password (hashed with bcrypt),
  stored in a persistent server-side database. Sessions use a JWT saved in
  the browser and sent as a cookie + `Authorization` header.
- **Listings**: creating a listing requires being signed in and writes to the
  database. Everyone who opens the site sees the same live listings.
- **Photos**: you can attach a photo when listing an item. It's resized in
  the browser, uploaded, saved server-side under `public/uploads/`, and shown
  on the item's card and detail view. No photo → falls back to the original
  category icon.
- **Claims**: claiming/buying an item requires being signed in. The server
  enforces that an item can only be claimed once (a second attempt gets a
  clear "already claimed" error, even under a race).
- **Pricing**: the expiry-based discount suggestion is computed server-side
  when a listing is created (or you can type in your own price).

## What's still a stand-in (by design — no real payments were requested)

- No real payment processing — "Buy" just marks the item claimed.
- No real delivery-partner dispatch — it's a note about the outlet's radius.
- Outlets and categories are fixed reference data in the frontend, not a DB table.

## Run it

Requires Node.js 18+.

```bash
npm install
npm start
```

Then open **http://localhost:3000**. A `data/db.json` file is created
automatically on first run and seeded with a few sample listings; uploaded
photos are saved under `public/uploads/`.

To reset all data, stop the server and delete `data/db.json` (and optionally
`public/uploads/` to clear photos too).

## Environment variables (optional)

- `PORT` — port to listen on (default `3000`)
- `JWT_SECRET` — secret used to sign session tokens. If not set, a random one
  is generated at startup — fine for local/demo use, but for a real deploy
  set this explicitly so sessions survive a server restart.

## Project layout

```
server.js       Express app: auth, listings, claims API + serves the frontend
db.js           Tiny dependency-free JSON-file datastore (data/db.json)
public/index.html   The Crumbz UI (unchanged design, now calls the API)
public/uploads/ Uploaded item photos (created on first upload)
data/db.json    Persisted data (created on first run, not checked in)
```

## API summary

| Method | Path                        | Auth | Description                  |
|--------|-----------------------------|------|-------------------------------|
| POST   | /api/auth/signup             | —    | Create account                |
| POST   | /api/auth/login              | —    | Sign in                       |
| POST   | /api/auth/logout             | —    | Clear session cookie          |
| GET    | /api/auth/me                 | ✓    | Current user                  |
| GET    | /api/listings                | —    | All listings                  |
| POST   | /api/listings                | ✓    | Create a listing              |
| POST   | /api/listings/:id/claim      | ✓    | Claim/buy a listing           |
| GET    | /api/claims                  | ✓    | Your claim history            |
| GET    | /api/stats                   | —    | Marketplace stats             |
