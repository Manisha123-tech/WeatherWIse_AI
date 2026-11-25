# Deploying WeatherWise AI

This repository is split into a **React + Vite frontend** (`frontend/`) and a **Flask + SQLite backend** (`backend/`).

---

## 1. Deploy the Backend (Render or Railway)

### Option A: Render (Blueprint)
1. Push this repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com/), click **New +** -> **Blueprint** and select `Manisha123-tech/WeatherWIse_AI`.
3. Render automatically reads `render.yaml` at the repo root and deploys the `weatherwise-ai-backend` web service.
4. Note your deployed backend URL (e.g., `https://weatherwise-ai-backend.onrender.com`) and verify `https://<backend-url>/api/health` returns `{"status": "ok", ...}`.

> **Note on SQLite persistence:** On Render's free tier, the filesystem resets on redeploy/restart. For persistent user accounts, saved locations, and community reports, attach a Persistent Disk (e.g., `/var/data`) and set `DATABASE_PATH=/var/data/weatherwise.db`.

### Option B: Railway
1. In [Railway](https://railway.app/), create a **New Project** -> **Deploy from GitHub repo** and select `Manisha123-tech/WeatherWIse_AI`.
2. In service **Settings**, set **Root Directory** to `backend`. Railway reads `backend/railway.toml` and `backend/Procfile`.
3. Set environment variables:
   - `FLASK_DEBUG=false`
   - `SECRET_KEY=<generate a long random string>`
   - `CORS_ORIGINS=*` (update to your frontend URL after deploying the frontend)
4. Generate a public domain in **Settings -> Networking** and verify `/api/health`.

---

## 2. Deploy the Frontend (Vercel or Netlify)

### Option A: Vercel
1. In [Vercel](https://vercel.com/new), import `Manisha123-tech/WeatherWIse_AI`.
2. Set **Root Directory** to `frontend` (Framework Preset: **Vite**).
3. Add the environment variable:
   - `VITE_API_BASE_URL` = `https://<your-backend-url>` (no trailing slash needed)
4. Deploy. `frontend/vercel.json` handles client-side React Router routes.

### Option B: Netlify
1. In [Netlify](https://app.netlify.com/), **Add new site** -> **Import an existing project** from GitHub (`Manisha123-tech/WeatherWIse_AI`).
2. Set **Base directory** to `frontend`, **Build command** to `npm run build`, and **Publish directory** to `frontend/dist` (automatically configured by `frontend/netlify.toml`).
3. Add environment variable:
   - `VITE_API_BASE_URL` = `https://<your-backend-url>`
4. Deploy.

---

## 3. Lock Down CORS
Once your frontend URL is live (e.g., `https://weatherwise-ai.vercel.app`), update `CORS_ORIGINS` in your Render or Railway backend environment variables to that exact URL and redeploy/restart the backend.
