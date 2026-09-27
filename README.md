# MedTracker

A private, family-use web app for tracking medication inventory, prescriptions, multi-times-per-day
dosage schedules, and missed doses — built to be hosted for free on GitHub Pages.

See **[CLAUDE.md](./CLAUDE.md)** for the full architecture, data model, and design system reference.

## Status

The app is fully built (UI, routing, Firestore-backed data layer, dose scheduling/missed-dose logic,
PWA install support). Sign-in only works once the one-time Firebase setup below is complete —
in particular, every caregiver needs an `allowlist` entry (step 5), or they'll be signed straight
back out with a "not authorized" message.

## One-time setup (do this before first use)

1. Create a free Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication** → Sign-in method → enable **Email/Password** only (no other providers).
3. **Firestore Database** → create the **`(default)`** database in **production mode**, then go to
   Firestore Database → **Rules**, replace everything with the contents of
   [`firestore.rules`](./firestore.rules), and click **Publish**. (The production-mode default rules
   deny every read, so skipping this means every login gets signed out.)
4. **Authentication** → Users → manually add one account per caregiver (there is no public sign-up).
5. For each account, add an allowlist entry — **this is what grants access**:
   1. Authentication → Users → copy the account's **User UID**.
   2. Firestore Database → Data → **+ Start collection** (or open the existing one) named exactly
      `allowlist` (all lowercase), in the `(default)` database.
   3. **Document ID** = the UID, pasted exactly. Do **not** click Auto-ID — the rules check the
      document's *ID*, not a field inside it.
   4. Add fields `email` (string), `displayName` (string), `addedAt` (timestamp) for your own
      bookkeeping, then **Save**.
6. **Project settings** → register a Web App → copy the `firebaseConfig` values into
   [`js/firebase-config.js`](./js/firebase-config.js) (replacing the `REPLACE_WITH_...` placeholders).
   This file is safe to commit — see CLAUDE.md for why.
7. Repo **Settings → Pages** → Source: **GitHub Actions**. The included `.github/workflows/deploy.yml`
   handles the rest — just push to `main`. The deploy job uses the `github-pages` environment
   (required by `actions/deploy-pages`); GitHub creates it automatically, but if a deploy is rejected
   by environment protection rules, check **Settings → Environments → github-pages → Deployment
   branches** allows `main`.
8. **Authentication → Settings → Authorized domains** → add your `*.github.io` domain, or sign-in will
   fail from the deployed site.
9. Optional: on a phone, open the deployed site and "Add to Home Screen" to install it as a PWA.

## Troubleshooting sign-in

- **"This account is not authorized for MedTracker. Ask your administrator to add allowlist/&lt;UID&gt;…"**
  — the password was correct, but Firestore rejected the first data read. Create the document named
  in the message (step 5). If it already exists, check: the document ID matches the UID exactly (no
  Auto-ID, no spaces), the collection is spelled `allowlist` in lowercase, it's in the `(default)`
  database, and the rules from step 3 have been **published**.
- **"Incorrect email or password."** — reset the password in Authentication → Users.
- **Sign-in fails only on the deployed site** — add the `*.github.io` domain to Authorized domains (step 8).
- **Old version still showing after a deploy** — the service worker serves cached files first; reload
  once more (or close and reopen the installed PWA) to pick up the update.

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
