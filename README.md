# Thames Pub Crawl — Setup Guide

A live tracker web app for a pub crawl along the Thames path. Participants can see the current pub, live location on a map, ETAs to the next stop, and rate each pub.

---

## What you'll need

- [Node.js](https://nodejs.org) v18 or later
- A free [Supabase](https://supabase.com) account (database + realtime)
- A free [Vercel](https://vercel.com) account (hosting, production only)

---

## 1. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for it to provision (takes ~1 minute)
3. Go to **SQL Editor** in the left sidebar
4. Paste the entire contents of `supabase-schema.sql` (in this repo root) and click **Run**
5. Go to **Settings → API** and note down:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon public** key (long `eyJ...` string)
   - **service_role** key (another long `eyJ...` string — keep this secret)

---

## 2. Configure environment variables

Open `.env.local` in the project root and fill in your values:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your anon key...
SUPABASE_SERVICE_ROLE_KEY=eyJ...your service role key...
ADMIN_SECRET=choose-a-strong-password
```

`ADMIN_SECRET` is the password you'll use to log in to the admin panel. Choose anything you like.

---

## 3. Run locally

Install dependencies (only needed once):

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The admin panel is at [http://localhost:3000/admin](http://localhost:3000/admin).

### Testing on your phone (same WiFi)

```bash
npm run dev -- --hostname 0.0.0.0
```

Find your Mac's local IP address:

```bash
ipconfig getifaddr en0
```

Then open `http://[your-ip]:3000` on your phone.

---

## 4. Using the app

### Before the crawl

1. Go to `/admin` and log in with your `ADMIN_SECRET` password
2. Click **Create crawl** — set the name and date
3. Add your pubs in order using the **Add pub** form:
   - Name and address are required
   - Latitude/longitude enable the map — find these by right-clicking a location in Google Maps and copying the coordinates
   - Set the planned dwell time (how long you'll spend at each pub)
4. Click **Join QR** to generate the QR code / invite link to share with your group

### On the day

1. Open `/admin` and click **Start crawl**
2. Click **Share GPS** — this uses your phone's GPS to show the group's live location on the map (keep the admin panel open)
3. When you arrive at a pub, tap **Arrived** next to it
4. When you leave, tap **Departed** — ETAs for all remaining pubs will recalculate automatically
5. Repeat for each pub

### For participants

- Scan the QR code or open the invite link — this sets a cookie that lets them rate pubs
- They'll see the map, current pub, and ETA to the next stop
- Once you mark **Arrived** at a pub, they can rate it (1–5 stars + optional comment)

### For spectators

- Anyone visiting the site without the invite link gets a read-only view
- They can see everything except the rating form

---

## 5. Deploy to production (Vercel)

### First time setup

1. Create a free account at [vercel.com](https://vercel.com)
2. Install the Vercel CLI:
   ```bash
   npm install -g vercel
   ```
3. Deploy:
   ```bash
   vercel
   ```
   Follow the prompts — link to your Vercel account and create a new project.

4. Add your environment variables in the Vercel dashboard:
   - Go to your project → **Settings → Environment Variables**
   - Add the same four variables from your `.env.local`:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `ADMIN_SECRET`

5. Redeploy to pick up the env vars:
   ```bash
   vercel --prod
   ```

### Subsequent deploys

```bash
vercel --prod
```

### Custom domain (optional)

In the Vercel dashboard → your project → **Settings → Domains** — add any domain you own for free.

---

## Cost

| Service | Free tier limit | Expected usage (30 people, 10 pubs) |
|---|---|---|
| Vercel | Unlimited hobby deployments | Well within free |
| Supabase Realtime | 200 concurrent connections, 2M messages/month | ~90 connections, ~200k messages |
| Supabase Database | 500MB storage | < 1MB |
| OpenStreetMap | Unlimited | Free, no API key needed |

**Total cost: £0**

---

## Troubleshooting

**Map not showing** — Check that your pubs have lat/lng values. Right-click any location in Google Maps and select "What's here?" to copy coordinates.

**Ratings not working** — Participants must have joined via the QR/invite link in the same browser they're using. Incognito tabs won't work as they don't persist the cookie.

**GPS not updating** — The admin must keep the admin panel open with "Share GPS" active. iOS may pause background tabs — keep the screen on.

**ETAs not recalculating** — Make sure pubs have lat/lng set. ETAs require coordinates to calculate walking distances.

**Rejoining after closing the app** — The participant cookie lasts 2 days, so closing and reopening the browser keeps them joined. If someone switches to a different browser, they'll need to re-scan the QR code.
