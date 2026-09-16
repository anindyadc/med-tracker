# CLAUDE.md

Guidance for Claude Code (or any future contributor) working in this repository.

## Project

**MedTracker** — a private, family-use web app for managing one person's (the maintainer's mother's)
medication care: inventory of pills/doses on hand, prescription details, multi-times-per-day dosage
schedules, due-dose reminders, and reconciliation of missed doses against inventory. Built for a small
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
  scheduler.js        due/upcoming/missed computation + taken/skip/missed transactions (core domain logic)
  inventory.js        inventory decrement/increment, low-stock / days-remaining calc
  notifications.js    Notification permission + interval-based due-dose checks
  date-utils.js       local date-key + grace-period helpers
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
  never queried independently), `inventory: {count, unit, lastRestockDate, lastRestockAmount}`,
  `active`, timestamps.
- **`doseLogs/{medicationId_scheduledDate_scheduledTime}`** — one doc per scheduled dose *occurrence*.
  The ID is deterministic so recomputing the schedule repeatedly is idempotent (never creates duplicates).
  `medicationId, medicationName` (denormalized for fast history rendering), `scheduledDate` (local
  `YYYY-MM-DD` string, not a Timestamp — avoids timezone ambiguity about which day a dose belongs to),
  `scheduledTime`, `scheduledDateTime` (Timestamp, for sorting/grace math), `quantity` (copied at
  creation so later schedule edits don't rewrite history), `status: "taken"|"missed"|"skipped"`,
  `loggedAt`, `loggedBy`, `note`.
- **`settings/{uid}`** — per-caregiver `gracePeriodMinutes, notificationsEnabled, theme`.

### Missed-dose ↔ inventory algorithm (the core logic — lives in `js/scheduler.js`)

Re-run on app load, on `visibilitychange`, and on a ~60s interval while the app is open:

1. For each active medication's schedule entry, compute today's `scheduledDateTime` (local time).
2. If a `doseLogs` doc already exists for that occurrence, trust its stored status — never overwritten.
3. No doc yet + `now < scheduledDateTime` → virtual **"upcoming"** (nothing written to Firestore).
4. No doc yet + within the grace window → virtual **"due"** (shown prominently, eligible for a
   notification; still nothing written — avoids polluting Firestore with docs that flip a minute later).
5. No doc yet + grace period elapsed → **write `status: "missed"`**. This is the *only* trigger for the
   due→missed transition. **Inventory is left untouched.**
6. **"Mark Taken"** → write/overwrite the doc as `status: "taken"`, and in the *same Firestore
   transaction* decrement `medications.inventory.count` by `quantity` (clamp at 0). This is the *only*
   trigger for an inventory decrement — never on "missed".
7. **"Skip"** → `status: "skipped"`, no inventory change (distinguishes a doctor-directed skip from a
   forgotten dose in history).
8. **Undo** (correcting a mis-tap) reverses the same transaction — status reverts, inventory increments
   back. Must be a confirm-guarded UI action, not a casual toggle.
9. **Manual restock** (Inventory view) adjusts `inventory.count` / `lastRestockDate` directly,
   independent of dose logging.

## Security rules (Firestore)

```
function isAllowed() {
  return request.auth != null &&
    exists(/databases/$(database)/documents/allowlist/$(request.auth.uid));
}
match /allowlist/{uid} { allow read, write: if false; }
match /medications/{id} { allow read, write: if isAllowed(); }
match /doseLogs/{id}    { allow read, write: if isAllowed(); }
match /settings/{uid}   { allow read, write: if isAllowed() && request.auth.uid == uid; }
```

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
`showNotification` (supports action buttons) for doses that just became due, checked on load,
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
  don't add more breakpoints than this personal app needs. Primary actions ("Mark Taken") ≥44×44px,
  reachable one-handed.

## One-time manual setup (outside of code — do this before the app can actually log in)

1. Create a Firebase project (free **Spark** plan — sufficient for this app's scale).
2. Authentication → Sign-in method → enable **Email/Password** only.
3. Firestore Database → create in **production mode** → paste in the rules above immediately.
4. Authentication → Users → manually add one account per caregiver.
5. For each account, copy its UID and create a matching doc at `allowlist/{uid}` in Firestore
   (`email`, `displayName`, `addedAt`).
6. Project settings → register a Web App → copy the `firebaseConfig` values into `js/firebase-config.js`
   and commit (this is not a secret).
7. Repo Settings → Pages → Source: GitHub Actions (the existing `deploy.yml` already handles the rest).
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
- Don't decrement inventory anywhere except the "Mark Taken" transaction in `scheduler.js` — that
  invariant is what keeps inventory and dose history consistent.
- Don't use `latest` for the Firebase CDN import URLs — pin an exact version.
