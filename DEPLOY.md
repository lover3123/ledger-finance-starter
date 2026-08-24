# Deploy Ledger to the Cloud (Free)

This guide deploys Ledger using free tiers on three platforms:

- **MongoDB Atlas** — free M0 database (512MB)
- **Render** — free API backend (Node.js)
- **Vercel** — free frontend (React + Vite)

---

## Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial Ledger Pay commit"
git remote add origin https://github.com/YOUR_USERNAME/ledger-pay.git
git push -u origin main
```

---

## Step 2: Create MongoDB Atlas Database (Free)

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Sign up (free) → Create a **Free (M0) Shared Cluster**
3. Choose any cloud provider + region
4. Under **Database Access** → Add a new database user:
   - Username: `ledger`
   - Password: (copy this — you'll need it)
5. Under **Network Access** → Add IP Address → **Allow Access from Anywhere** (`0.0.0.0/0`)
6. Go to **Database** → Click **Connect** → **Drivers**
7. Copy the connection string:
   ```
   mongodb+srv://ledger:<password>@cluster0.xxxxx.mongodb.net/ledger?retryWrites=true&w=majority
   ```
8. Replace `<password>` with the password you set

Save this — you'll need it in Step 3.

---

## Step 3: Deploy API to Render (Free)

1. Go to [render.com](https://render.com) → Sign up (free)
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Fill in:
   - **Name:** `ledger-api`
   - **Root Directory:** leave blank (repository root)
   - **Runtime:** `Node`
   - **Build Command:** `npm ci --include=dev && npm run build -w packages/shared && npm run build -w apps/api`
   - **Start Command:** `node apps/api/dist/server.js`
   - **Plan:** Free
5. Under **Environment Variables**, add:
   ```
   NODE_ENV = production
   MONGODB_URI = (paste your Atlas connection string)
   JWT_SECRET = (click Generate)
   CLIENT_ORIGIN = (leave empty for now — update after deploying frontend)
   APP_BASE_URL = (leave empty for now — update after deploying frontend)
   PAYMENT_PROVIDER = sandbox
   PORT = 10000
   UPLOAD_STORAGE = /tmp/uploads
   ```
6. Click **Create Web Service**
7. Wait for deployment to finish (2-3 minutes)
8. Note your API URL: `https://ledger-api.onrender.com`

### Seed demo data:

Go to Render dashboard → your service → **Shell** tab:

```bash
npx tsx src/db/seed.ts
```

---

## Step 4: Deploy Frontend to Vercel (Free)

1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub (free)
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. Configure:
   - **Framework Preset:** Vite
   - **Root Directory:** leave blank (repository root)
   - **Install Command:** `npm ci --include=dev`
   - **Build Command:** `npm run build -w packages/shared && npm run build -w apps/web`
   - **Output Directory:** `apps/web/dist`
5. Under **Environment Variables**, add:
   ```
   VITE_API_URL = https://ledger-api.onrender.com
   ```
6. Click **Deploy**
7. Wait for deployment (1-2 minutes)
8. Note your frontend URL: `https://ledger-pay.vercel.app`

---

## Step 5: Connect Frontend ↔ Backend

1. Go back to **Render** → your API service → **Environment**
2. Update these variables:
   ```
   CLIENT_ORIGIN = https://ledger-pay.vercel.app
   APP_BASE_URL = https://ledger-pay.vercel.app
   ```
3. Click **Save Changes** → Render will auto-redeploy

---

## Step 6: Verify Everything Works

1. Open your Vercel URL: `https://ledger-pay.vercel.app`
2. You should see the Ledger login screen
3. Log in with:
   - Email: `demo@ledger.local`
   - Password: `Demo@12345`
4. Test the flow:
   - Dashboard loads ✅
   - People page shows friends ✅
   - Click a person → relationship detail ✅
   - Create payment request ✅
   - View requests ✅

---

## Free Tier Limits

| Platform      | Free Tier Limit                                     |
| ------------- | --------------------------------------------------- |
| MongoDB Atlas | 512MB storage, shared RAM                           |
| Render        | 750 hours/month, spins down after 15 min inactivity |
| Vercel        | 100GB bandwidth, unlimited static deploys           |

### Render Sleep Warning

The free Render service **spines down after 15 minutes of inactivity**. The first request after sleep takes ~30 seconds to wake up. This is normal for free tier.

---

## Updating After Changes

Any push to `main` automatically redeploys both Vercel and Render.

```bash
git add .
git commit -m "Feature update"
git push
```

---

## Environment Variables Summary

### MongoDB Atlas

- `MONGODB_URI` — connection string from Atlas dashboard

### Render (API)

| Variable           | Value                         | When to set           |
| ------------------ | ----------------------------- | --------------------- |
| `NODE_ENV`         | `production`                  | At creation           |
| `MONGODB_URI`      | `mongodb+srv://...`           | At creation           |
| `JWT_SECRET`       | (auto-generated)              | At creation           |
| `CLIENT_ORIGIN`    | `https://your-app.vercel.app` | After frontend deploy |
| `APP_BASE_URL`     | `https://your-app.vercel.app` | After frontend deploy |
| `PAYMENT_PROVIDER` | `sandbox`                     | At creation           |
| `PORT`             | `10000`                       | At creation           |
| `UPLOAD_STORAGE`   | `/tmp/uploads`                | At creation           |

### Vercel (Frontend)

| Variable       | Value                             | When to set |
| -------------- | --------------------------------- | ----------- |
| `VITE_API_URL` | `https://ledger-api.onrender.com` | At creation |

---

## Troubleshooting

### "Cannot connect to API"

- Check `VITE_API_URL` in Vercel environment variables
- Ensure it starts with `https://`
- Check Render logs for errors

### "Invalid token" after login

- The JWT_SECRET changed on Render
- Users need to re-login

### Render deployment fails

- Check build logs in Render dashboard
- Ensure `Root Directory` is blank so the workspace package `@ledger/shared` is available
- Ensure the build command includes `npm ci --include=dev` so TypeScript type packages are installed
- Node.js 20+ is required

### MongoDB connection fails

- Ensure `0.0.0.0/0` is in Atlas Network Access
- Check the password in the connection string (no special chars without URL encoding)
- Ensure the database user was created in Atlas

### CORS errors in browser console

- `CLIENT_ORIGIN` must exactly match your Vercel URL (including `https://`)
