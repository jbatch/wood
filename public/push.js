import { api } from "./api.js";
import { state } from "./state.js";
import { b64ToUint8 } from "./utils.js";

export async function subscribePush() {
  if (!state.data?.push?.enabled) throw new Error("push_keys_missing");
  if (!window.isSecureContext) throw new Error("https_required");
  if (!("Notification" in window) || !("PushManager" in window)) throw new Error("push_not_supported");

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission === "denied") throw new Error("notifications_blocked");
  if (permission !== "granted") throw new Error("permission_not_granted");

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64ToUint8(state.data.push.publicKey),
  });
  await api("/api/push-subscriptions", { method: "POST", body: { subscription: sub.toJSON() } });
  await refreshPushStatus();
}

export async function refreshPushStatus() {
  if (!state.data?.push?.enabled) {
    state.pushStatus = { label: "Push off", supported: false };
    return;
  }
  if (!window.isSecureContext) {
    state.pushStatus = { label: "HTTPS needed", supported: false };
    return;
  }
  if (!("Notification" in window) || !("PushManager" in window)) {
    state.pushStatus = { label: "Push unsupported", supported: false };
    return;
  }

  const permission = Notification.permission;
  let subscribed = false;
  if (permission === "granted") {
    const reg = await navigator.serviceWorker.ready;
    subscribed = Boolean(await reg.pushManager.getSubscription());
  }

  state.pushStatus = {
    supported: true,
    permission,
    subscribed,
    label: subscribed ? "Push on" : permission === "denied" ? "Push blocked" : "Enable push",
  };
}
