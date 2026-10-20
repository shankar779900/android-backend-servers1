# Upward Investments Backend

This folder contains the Node.js/Express backend for the Upward Investments application.

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the example environment file and update values:
   ```bash
   cp .env.example .env.local
   ```
3. Start the server:
   ```bash
   npm start
   ```

## Notes

- The backend expects a MySQL database configured via the `DATABASE_URL` environment variable.
- Prisma migrations should be applied from this folder when the database is ready.

## Deploying to Render

This backend is self-contained inside the `backend/` folder.
When you deploy with Render, use the `render.yaml` file at the repository root.

Steps:
1. Push this repo to your Git provider.
2. Create a new Render Web Service and connect your repo.
3. Use the `render.yaml` service definition or set:
   - Root: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add the required environment variables in Render:
   - `DATABASE_URL`
   - `BREVO_API_KEY` (Brevo API v3 key; keep it secret)
   - `EMAIL_FROM`
   - `EMAIL_FROM_NAME` (optional; defaults to `GrowUP Investments`)
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `ADMIN_CREATION_KEY` (optional)
   - `REDIS_URL` (optional)
   - `UPSTASH_REDIS_REST_URL` (optional)
   - `UPSTASH_REDIS_REST_TOKEN` (optional)

If you want Render to run the backend from the `backend` folder, the `render.yaml` file already points to that folder.

OTP emails use Brevo's HTTPS API at `https://api.brevo.com/v3/smtp/email`, so SMTP host, port, and password variables are not used. Verify the sender address in Brevo before deploying.

## Referral download links and APK updates

- The app shares links in the form `https://smartgrowup.com/download/REFERRAL_CODE`.
- The download page offers the current APK at `/app.apk` and an `upwardinvestments://signup?ref=REFERRAL_CODE` link for opening an already-installed app with the referral code.
- The app's signup screen reads that deep link and pre-fills the referral code. If a recipient installs the APK first, they should return to the link and tap **Open app**, or enter the displayed code manually.
- APK files are not stored in Git or on Render's ephemeral filesystem. Attach a **persistent disk** to the Render web service, mounted at `/var/data`. The backend defaults to `APP_APK_PATH=/var/data/current-app.apk`; override this environment variable only if the disk uses a different mount path. Persistent disks require a paid Render service plan.
- After deploying the backend and attaching the disk, sign in to `https://smartgrowup.com/overgearred/admin/`, open **App Download**, and upload a signed APK. Each successful upload atomically replaces the previous APK, so all referral links automatically download the latest file.
- The admin UI path defaults to `/overgearred/admin`; set `ADMIN_PANEL_PATH` in Render only if you need a different path. This non-obvious path reduces casual discovery but is not a substitute for admin authentication and strong credentials.
- Alternatively, run `node scripts/upload_app_apk.js /path/to/signed-app.apk` from the `backend` directory. The script asks for an admin session token without echoing it. APK replacement requires an authenticated admin session.
- The `/download/REFERRAL_CODE` page displays the code and starts the download. Its **Open app** action passes the code into signup when the app is already installed. A recipient who installs first can return to the page and tap **Open app** or enter the code manually.

## Auto-push backend changes to GitHub

You can run a small watcher that will automatically commit and push any changes in this folder to a target GitHub repository.

1. Install dependencies (adds `chokidar`):

```bash
cd backend
npm install
```

2. Run the watcher (defaults to pushing to `git@github.com:garpsan9090/android-backend-server.git` on branch `main`):

```bash
cd backend
npm run auto-push
```

3. Optional environment variables:

- `REMOTE_URL` — remote repository URL to push to (default: `git@github.com:garpsan9090/android-backend-server.git`).
- `REMOTE_NAME` — git remote name to use/add (default: `garpsan`).
- `BRANCH` — branch to push to (default: `main`).
- `WATCH_PATH` — path under `backend/` to watch (default: `.`).

Notes:
- The script will add a remote named as configured if it does not exist. Ensure your machine has appropriate Git credentials (SSH key or credential helper) for pushing.
- The watcher ignores `.git`, `node_modules`, `.env*`, `uploads`, and `build` directories.

