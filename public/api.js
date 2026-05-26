const MILE_HIGH_WOOD_COOKIE = "wood_mile_high_attempt";
const MILE_HIGH_WOOD_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function looksLikeOfflineSendFailure(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  const message = String(err?.message || err || "");
  return /failed to fetch|load failed|networkerror|network error/i.test(message);
}

export function markMileHighWoodAttempt(err) {
  if (!looksLikeOfflineSendFailure(err)) return false;
  document.cookie = `${MILE_HIGH_WOOD_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=${MILE_HIGH_WOOD_COOKIE_MAX_AGE}`;
  return true;
}

export async function api(url, options = {}) {
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "request_failed");
  return data;
}
