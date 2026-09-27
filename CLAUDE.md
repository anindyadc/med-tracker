# CLAUDE.md

Guidance for Claude Code (or any future contributor) working in this repository.

## Project

**MedTracker** — a private, family-use web app for managing one person's (the maintainer's mother's)
medication care: inventory of pills/doses on hand, prescription details, multi-times-per-day dosage
schedules, dose reminders, and stock that is automatically drawn down as doses are assumed taken daily. Built for a small
number of family caregivers, not the general public.

Hosted as a static site on **GitHub Pages**. There is no application server or build step — everything
in this repo is served as-is.

## Architecture at a glance

- **Static frontend only**: plain HTML/CSS/JS, native ES modules (`<script type="module">`), no bundler,
  no `node_modules`, no npm build. Deploy = push to `main`; `.github/workflows/deploy.yml` uploads the
  repo root to GitHub Pages via GitHub Actions. Don't introduce a build step without updating that workflow.
- **Backend-as-a-service**: **Firebase** (free "Spark" plan) — Authentication (email/password) +
  Firestore, called directly from client JS via pinned-version CDN ESM imports
  (`https://www.gstatic.com/firebasejs/<exact-version>/firebase-app.js`, etc. — always pin an exact
  version, never `latest`, so a Firebase release can't silently break the app).
- **Why Firebase and not just localStorage**: GitHub Pages can't run a server, so real login and
  cross-device sync (laptop + phone) require a backend. The Firebase web config (`js/firebase-config.js`)
  is **not a secret** and is safe to commit — the actual security boundary is Firestore Security Rules
  (see below), not hiding the config.
- **No public sign-up**: there is no sign-up form anywhere in the app. Caregiver accounts are provisioned
  manually via the Firebase console (see "One-time setup"). This is intentional — it's a closed family
  app, not a multi-tenant product.
- **PWA**: `manifest.json` + `service-worker.js` make the app installable ("Add to Home Screen"),
  which also makes local notifications more visible and gives an app-like feel on mobile.

## File layout

```
index.html            login page (entry point; no signup link)
app.html               authenticated app shell, hash-routed (#dashboard/#medications/#inventory/#history/#settings)
manifest.json
service-worker.js
firestore.rules        Firestore Security Rules (source of truth, see below)
firebase.json           points the Firebase CLI at firestore.rules (optional, for `firebase deploy --only firestore:rules`)

css/
  tokens.css          palette / spacing / shadow / type-scale custom properties (dark-first, light override via data-theme)
  base.css            resets, layout primitives
  components.css      glass cards, buttons, inputs, badges, .tilt-card utility
  pages/*.css         one file per view

js/
  firebase-config.js  firebaseConfig + initializeApp/getAuth/getFirestore (safe to commit, see above)
  auth.js             sign-in/out, onAuthStateChanged guard, permission-denied -> forced sign-out
  router.js           hash-based view switcher
  db.js               Firestore CRUD wrappers
  scheduler.js        today's dose occurrences (upcoming / assumed-taken / due-now reminder window)
  inventory.js        derived stock: remaining = baseline − scheduled doses since, low-stock / days-remaining (core domain logic)
  notifications.js    Notification permission + interval-based due-dose checks
  date-utils.js       local date-key / time formatting helpers
  tilt.js             pointer/touch 3D tilt effect for .tilt-card elements
  ui/*.js             one renderer per view, wired to router.js

icons/
  icon.svg, favicon.svg           hand-authored SVG pill/capsule mark (not a downloaded image — avoids license ambiguity)
  icon-192.png, icon-512.png, maskable-icon-512.png   rasterized from icon.svg for the PWA manifest
```

Two HTML entry points (`index.html` vs `app.html`) are deliberate: unauthenticated visitors never load
app markup or query Firestore, so there's no "flash of protected content" to guard against in JS.

UI icons (pill, calendar, bell, clipboard, etc.) come from **Lucide's static SVG set via jsDelivr**
(MIT-licensed, no JS/bundler required). Only the app icon/favicon are hand-authored, for the same
licensing-clarity reason.

## Data model (Firestore)

- **`allowlist/{uid}`** — doc existence for a Firebase Auth UID = access granted. `{email, displayName, addedAt}`.
  **Never readable from the client** (`allow read, write: if false`); managed only via the Firebase
  console. Used by security rules via `exists(...)` as the gate for every other collection.
- **`medications/{id}`** —
  `name, strength, form, doctor, instructions, prescriptionNumber, pharmacy, refillReminderThreshold` (days),
  `schedule: [{time, quantity, label}, ...]` (embedded array — always read/written with the medication,
  never queried independently), `inventory: {count, countedAt, unit, lastRestockDate, lastRestockAmount}`
  (`count` is the quantity as of `countedAt`, *not* current stock — see "Stock model"),
  (`lastRestockDate` = purchase/stock-in date: a Timestamp at local midnight of the day the caregiver
  picks; older docs may hold the server time of the restock — read it via `dateKeyFromStored`),
  `active`, timestamps.
- **`doseLogs`** — *legacy, no longer read or written.* The old Mark Taken model logged one doc per dose;
  existing docs are harmless and can be deleted from the console. The rules still allow it.
- **`settings/{uid}`** — per-caregiver `notificationsEnabled, theme` (older docs may also carry an unused
  `gracePeriodMinutes`).

### Stock model (the core logic — `js/inventory.js`, writes in `js/db.js`)

There is **no per-dose logging** — no Mark Taken / Skip / Undo, and no missed doses. Every scheduled
dose of an active medication is **assumed taken at its scheduled time**, and stock is **derived**:

1. Each medication stores a baseline: `inventory.count` = quantity on hand as of the instant
   `inventory.countedAt`.
2. `remainingAt(med, now)` = `count` − the `quantity` of every schedule entry whose occurrence falls
   in `(countedAt, now]` (local time), clamped at 0. Nothing is written as time passes — the Today,
   Stock, Meds and History views all compute from the same function, so they can't drift.
3. **Stock-in date → instant** (`stockInInstant`): today = *now* (doses already passed today came out
   of the old stock); a past date = that day's local midnight (all its doses count against the new
   stock). No future dates.
4. **Restock** (Inventory view): new `count` = `remainingAt(stock-in instant) + added`, `countedAt` =
   that instant (never earlier than the current baseline, which would double-subtract). Also sets
   `lastRestockDate` / `lastRestockAmount` (shown as "Stocked in …" on the Stock card).
5. **Add/Edit medication**: "Quantity on stock-in date" + "Purchase / stock-in date" edit the baseline
   directly. If they're left untouched on edit, the save **rebases** (`count` = derived remaining now,
   `countedAt` = now) so a schedule change only affects consumption from that moment on.
6. **Deactivate/Reactivate** rebases the same way; inactive medications don't consume.
7. **Legacy docs** (from the old Mark Taken model) have no `countedAt`; their `count` was kept current
   until their last write, so `baselineAt` falls back to `updatedAt`. The first rebase adds `countedAt`.

Any write that touches `count`, `schedule` or `active` must also set `countedAt` (go through
`updateMedication` / `setMedicationActive` / `restockMedication` in `db.js`, which do this in a
transaction).

The Today view shows today's doses as "upcoming" or "taken" (passed), with a "due now" badge for
`DUE_WINDOW_MINUTES` (30) after each dose time — that window is also what triggers reminders. History is
derived the same way (last 21 days, from when each medication was added, using its *current* schedule).

## Security rules (Firestore)

The rules live in [`firestore.rules`](./firestore.rules) (with a matching [`firebase.json`](./firebase.json)
so they're deployable via `firebase deploy --only firestore:rules` if you ever install the Firebase CLI —
otherwise just paste the file's contents into Firebase Console → Firestore Database → Rules). Summary:
an `isAllowed()` helper checks the caller's UID exists in the `allowlist` collection; `medications` and
`doseLogs` are readable/writable by any allowlisted caregiver; `settings/{uid}` is restricted to its own
owner; `allowlist` itself is never readable or writable from the client.

Client-side, treat any `permission-denied` Firestore error (including the very first read right after
login) as "this account is not allowlisted": force sign-out and show a clear message. Don't try to read
`allowlist` from the client to check membership — it's unreadable by design; let the rules on the real
collections do the gating.

## Reminders — known limitation, don't try to "fix" this without adding a server

GitHub Pages is static hosting; there is no server to hold a push subscription. True push notifications
that fire when the browser/PWA is **fully closed** require a backend (Web Push / FCM + a server or
Cloud Function to trigger sends), and Firebase Cloud Functions requires the paid **Blaze** plan — that's
explicitly a future/Phase-2 option, not part of this build.

**Current (MVP) behavior**: request `Notification.requestPermission()` from an explicit button in
Settings (never auto-prompt on load), then fire local notifications via the service worker's
`showNotification` (no action buttons — tapping opens the app) for doses that just became due, checked on load,
`visibilitychange`, and a ~30–60s interval while the tab/installed PWA is open. iOS Safari's PWA
notification support is more limited/version-gated — that's a platform constraint, not a bug here.

## Visual design system ("3D premium", CSS-only — no WebGL/Three.js, for perf on older phones)

- Dark-first indigo→navy background gradient with a light-mode override via `data-theme` on `<html>`;
  teal→violet accent gradient; semantic green/amber/red for taken/due/missed. Headings in
  Manrope/Sora, body in Inter (Google Fonts CDN). All defined as custom properties in `css/tokens.css`.
- Glass cards: `backdrop-filter: blur(16px) saturate(160%)` + translucent gradient fill + **layered**
  box-shadow (inset highlight + close ambient shadow + far soft shadow) — the layering is what reads as
  depth, not a single flat shadow.
- 3D tilt (`js/tilt.js`): `pointermove` maps offset-from-center to small `rotateX/rotateY` (±6°) via
  `perspective(800px) rotateX() rotateY() translateZ(8px)`; touch devices get a tap-press `scale(0.98)`
  instead (no hover concept). Always respect `prefers-reduced-motion`.
- Fixed gradient-mesh background (`body::before`, several blurred low-opacity radial gradients) behind
  the glass cards so `backdrop-filter` has real color variation to pick up.
- Mobile-first responsive: bottom glassmorphic tab bar on phones, single `@media (min-width: 900px)`
  breakpoint switches to a left sidebar + multi-column grid on laptop. Keep it to these two layouts —
  don't add more breakpoints than this personal app needs. Primary actions (e.g. "Restock") ≥44×44px,
  reachable one-handed.
- The sidebar's Log out item is desktop-only (`.nav-logout`); on phones Log out lives in Settings.
- Medications view has a Cards/List toggle; the choice is a per-device UI preference in `localStorage`
  (`medtracker.medsLayout`), not synced via Firestore.
- Modals use an opaque `--surface-modal` fill (not glass): a `backdrop-filter` nested inside the blurred
  modal backdrop samples nothing and renders black. Tokens set `color-scheme` so native inputs match.

## One-time manual setup (outside of code — do this before the app can actually log in)

1. Create a Firebase project (free **Spark** plan — sufficient for this app's scale).
2. Authentication → Sign-in method → enable **Email/Password** only.
3. Firestore Database → create the `(default)` database in **production mode** → paste in the contents
   of `firestore.rules` (Firestore Database → Rules) and **Publish** immediately.
4. Authentication → Users → manually add one account per caregiver.
5. For each account, copy its UID and create a matching doc at `allowlist/{uid}` in Firestore
   (`email`, `displayName`, `addedAt`). The **document ID must be the UID** (not Auto-ID) — rules check
   `exists()` on that path. A missing entry shows up as a forced sign-out; `app.html` redirects to
   `index.html?denied=<uid>`, which displays the exact path to create.
6. Project settings → register a Web App → copy the `firebaseConfig` values into `js/firebase-config.js`
   and commit (this is not a secret).
7. Repo Settings → Pages → Source: GitHub Actions (the existing `deploy.yml` already handles the rest;
   its job declares `environment: github-pages`, which `actions/deploy-pages@v4` requires).
8. Authentication → Settings → Authorized domains → add the `*.github.io` domain, or `signInWithEmailAndPassword` will fail from the deployed site.
9. Hand-author `icons/icon.svg`, rasterize to `icon-192.png` / `icon-512.png` / a maskable variant.
10. Test "Add to Home Screen" on an Android phone and confirm manifest icons render.

There is no password-reset UI in the app (out of MVP scope) — the admin resets a caregiver's password
via the Firebase console.

## Things not to do

- Don't add a public sign-up flow — this app is closed-access by design.
- Don't try to make reminders fire when the app is fully closed without first adding a real backend
  (see "Reminders" above) — that's a known, accepted limitation, not an oversight.
- Don't introduce a bundler/build step without also updating `.github/workflows/deploy.yml`.
- Don't store "current stock" or decrement `inventory.count` as time passes — stock is derived from the
  baseline (`count` + `countedAt`) and the schedule. Any write that changes `count`, `schedule` or
  `active` must rebase `countedAt` (see "Stock model").
- Don't use `latest` for the Firebase CDN import URLs — pin an exact version.
