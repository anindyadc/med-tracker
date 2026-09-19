export function dailyUsage(medication) {
  return (medication.schedule || []).reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0);
}

export function daysRemaining(medication) {
  const usage = dailyUsage(medication);
  if (usage <= 0) return Infinity;
  const count = medication.inventory?.count ?? 0;
  return Math.floor(count / usage);
}

export function isLowStock(medication) {
  const threshold = medication.refillReminderThreshold ?? 7;
  const remaining = daysRemaining(medication);
  return remaining !== Infinity && remaining <= threshold;
}

export function stockFraction(medication, horizonDays = 30) {
  const usage = dailyUsage(medication);
  if (usage <= 0) return 1;
  const fullSupply = usage * horizonDays;
  const count = medication.inventory?.count ?? 0;
  return Math.max(0, Math.min(1, count / fullSupply));
}

export function lowStockMedications(medications) {
  return medications.filter((m) => m.active !== false && isLowStock(m));
}
