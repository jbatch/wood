const MAX_ENTRIES = 200;
const entries = [];

export function debugLog(type, data = {}) {
  const entry = {
    at: new Date().toISOString(),
    type,
    ...data,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  console.log(`[${entry.at}] ${type}`, JSON.stringify(data));
  return entry;
}

export function debugEntries() {
  return entries.slice().reverse();
}

export function endpointHost(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid-endpoint";
  }
}
