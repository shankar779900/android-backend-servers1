# Web app

The customer app shares its React Native screens and backend with the Android and iOS apps, and can also run in a desktop or mobile browser.

## Run locally

Install the project dependencies, then run `npm run web`. Expo starts the browser app and prints its local URL. The browser app uses the same production API as the mobile app, so login, signup, wallet, and portfolio features use the existing backend.

## Deploy on the existing Render service

Run `node scripts/build-web.js`. It exports the static app to `dist/` and copies it to `backend/public-web/`. The backend serves that directory at the site root, so the same domain can host the customer app at `/`, the admin panel at `/overgearred/admin`, and the API at `/api/...`. Keep the custom domain attached only to the existing backend service; do not attach it to a second Render Static Site.

Commit and push the updated customer app files to the app repository, and the backend route plus generated `backend/public-web/` files to the repository/branch connected to the existing Render service. Once Render finishes deploying, the app and admin/API routes will share the same HTTPS domain.

Serve the deployed site over HTTPS. On Android, open it in Chrome and choose **Install app** or **Add to Home screen** from the browser menu. On iPhone, open it in Safari, tap **Share**, then **Add to Home Screen**. The installed PWA opens in its own window but still needs an internet connection for app and account services.

The web app uses same-origin `/api/...` requests when served by this backend, avoiding browser cross-origin requests. Existing `/overgearred/admin`, `/api/...`, `/uploads`, `/download/:referralCode`, and `/app.apk` routes remain on the same service.

## Browser differences

- Payment proof uploads use the browser's file picker and submit the selected image as a normal multipart upload.
- Device biometric unlock is only used by the native apps; browser sessions use the account login and optional two-factor verification.
- The browser stores session data in browser storage. Users should sign out on shared devices.
