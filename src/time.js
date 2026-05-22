export function nowIso() {
  return new Date().toISOString();
}

export function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function addHoursIso(hours) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

export function isPast(iso) {
  return Boolean(iso) && Date.parse(iso) <= Date.now();
}
