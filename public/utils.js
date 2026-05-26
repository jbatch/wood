export function countdown(iso) {
  const ms = Math.max(0, Date.parse(iso) - Date.now());
  const h = Math.floor(ms / 3600000);
  const m = Math.ceil((ms % 3600000) / 60000);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function formatDate(iso) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function escHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function humanErr(v) {
  return String(v).replaceAll("_", " ");
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the old selection API below.
    }
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

export function without(object, keys) {
  const copy = { ...object };
  for (const key of keys) delete copy[key];
  return copy;
}

export function b64ToUint8(b64) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from([...atob(base64)].map((c) => c.charCodeAt(0)));
}
