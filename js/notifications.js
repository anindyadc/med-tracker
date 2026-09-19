// MVP reminder scope (see CLAUDE.md "Reminders"): local notifications only, fired while the
// tab/installed PWA is open, checked on load / visibilitychange / a repeating interval. There
// is no server, so notifications cannot fire once the app is fully closed - that's an accepted
// limitation, not a bug.

const CHECK_INTERVAL_MS = 45_000;
const notifiedThisSession = new Set();

let intervalHandle = null;
let getDueDosesFn = null;

export function notificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

function occurrenceKey(occ) {
  return `${occ.medicationId}_${occ.scheduledDate}_${occ.scheduledTime}`;
}

async function notifyDue(occurrence) {
  const key = occurrenceKey(occurrence);
  if (notifiedThisSession.has(key)) return;
  notifiedThisSession.add(key);

  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({
    type: 'SHOW_DUE_NOTIFICATION',
    payload: {
      title: `${occurrence.medicationName} is due`,
      body: `Scheduled for ${occurrence.scheduledTime}${occurrence.label ? ` (${occurrence.label})` : ''}`,
      tag: key,
      medicationId: occurrence.medicationId,
      scheduledDate: occurrence.scheduledDate,
      scheduledTime: occurrence.scheduledTime
    }
  });
}

async function checkDueDoses() {
  if (Notification.permission !== 'granted' || !getDueDosesFn) return;
  try {
    const dueDoses = await getDueDosesFn();
    for (const occ of dueDoses) {
      await notifyDue(occ);
    }
  } catch (err) {
    console.warn('Notification due-dose check failed:', err);
  }
}

export function startDueDoseWatcher(getDueDoses) {
  getDueDosesFn = getDueDoses;
  stopDueDoseWatcher();
  checkDueDoses();
  intervalHandle = setInterval(checkDueDoses, CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkDueDoses();
  });
}

export function stopDueDoseWatcher() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

export function onNotificationAction(handler) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'NOTIFICATION_ACTION') {
      handler(event.data.action, event.data.data);
    }
  });
}
