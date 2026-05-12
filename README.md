<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Sez Simulation

## Local setup

1. Run `npm install`
2. Copy `.env.example` to `.env.local`
3. Fill the Firebase web app values for the project that stores your app data:
   `VITE_FIREBASE_API_KEY`
   `VITE_FIREBASE_AUTH_DOMAIN`
   `VITE_FIREBASE_PROJECT_ID`
   `VITE_FIREBASE_STORAGE_BUCKET`
   `VITE_FIREBASE_MESSAGING_SENDER_ID`
   `VITE_FIREBASE_APP_ID`
4. Add `GEMINI_API_KEY` only if you use AI generation
5. Run `npm run dev`

## Firebase Hosting deploy

The frontend now supports two config sources:

1. Build-time `VITE_FIREBASE_*` variables
2. Runtime config in `public/runtime-config.js`

If your hosting project is different from your paid Firebase data project, keep hosting on the free project and put the paid project's web config inside `public/runtime-config.js` before building and deploying.

Deploy flow:

1. Update `public/runtime-config.js` or your build env vars
2. Run `npm run build`
3. Deploy `dist` to Firebase Hosting
4. Hard refresh once so the latest service worker and runtime config load

## Render backend

If you deploy `server.ts` to Render, set these environment variables:

- `FIREBASE_SERVICE_ACCOUNT`
- `FIREBASE_STORAGE_BUCKET`
- `PORT` is supplied by Render
