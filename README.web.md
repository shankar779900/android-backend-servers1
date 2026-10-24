# Web app

The customer app shares its React Native screens and backend with the Android and iOS apps, and can also run in a desktop or mobile browser.

## Run locally

Install the project dependencies, then run `npm run web`. Expo starts the browser app and prints its local URL. The browser app uses the same production API as the mobile app, so login, signup, wallet, and portfolio features use the existing backend.

## Build for hosting

Run `npx expo export --platform web`. Expo writes the static website to `dist/`. Deploy the contents of that folder to a static web host such as Vercel, Netlify, or Render Static Sites. Configure SPA fallback/rewrite requests to `index.html` if the host requires it.

The backend must remain reachable over HTTPS from the deployed website. Its CORS configuration currently allows browser origins; if that policy is tightened, add the deployed website's origin to the backend allowlist.

## Browser differences

- Payment proof uploads use the browser's file picker and submit the selected image as a normal multipart upload.
- Device biometric unlock is only used by the native apps; browser sessions use the account login and optional two-factor verification.
- The browser stores session data in browser storage. Users should sign out on shared devices.
