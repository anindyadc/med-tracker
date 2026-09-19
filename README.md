# MedTracker

A private, family-use web app for tracking medication inventory, prescriptions, multi-times-per-day
dosage schedules, and missed doses — built to be hosted for free on GitHub Pages.

See **[CLAUDE.md](./CLAUDE.md)** for the full architecture, data model, and design system reference.

## Status

The app is fully built (UI, routing, Firestore-backed data layer, dose scheduling/missed-dose logic,
PWA install support). It will not work yet until you complete the one-time Firebase setup below —
until then, the login page will show a "Firebase is not configured" message.

## One-time setup (do this before first use)

1. Create a free Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication** → Sign-in method → enable **Email/Password** only (no other providers).
3. **Firestore Database** → create in **production mode**, then paste in the contents of
   [`firestore.rules`](./firestore.rules) (Firestore Database → Rules) immediately.
4. **Authentication** → Users → manually add one account per caregiver (there is no public sign-up).
5. For each account, copy its UID and create a matching document at `allowlist/{uid}` in Firestore
   with fields `email`, `displayName`, `addedAt`.
6. **Project settings** → register a Web App → copy the `firebaseConfig` values into
   [`js/firebase-config.js`](./js/firebase-config.js) (replacing the `REPLACE_WITH_...` placeholders).
   This file is safe to commit — see CLAUDE.md for why.
7. Repo **Settings → Pages** → Source: **GitHub Actions** (the included `.github/workflows/deploy.yml`
   handles the rest — just push to `main`).
8. **Authentication → Settings → Authorized domains** → add your `*.github.io` domain, or sign-in will
   fail from the deployed site.
9. Optional: on a phone, open the deployed site and "Add to Home Screen" to install it as a PWA.

## Local development

No build step or dependencies — it's static HTML/CSS/JS. Serve the folder with any static file server, e.g.:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

## Known limitations

- **Reminders only fire while the app is open** (foreground or installed PWA). GitHub Pages has no
  server, so true push notifications when the app is fully closed aren't possible without adding a
  backend (see CLAUDE.md's "Reminders" section for the Phase 2 option).
- **No password reset UI** — an admin resets a caregiver's password via the Firebase console.
- **No public sign-up** — this is intentional; it's a closed, invite-only app.
# med-tracker
