import { config } from "./config.js";
import { debugLog, endpointHost } from "./debugLog.js";

let webPushClient;
let didTryImport = false;

export function pushPublicConfig() {
  return {
    publicKey: config.vapidPublicKey,
    enabled: Boolean(config.vapidPublicKey),
  };
}

export async function notifyUser(db, recipientId, payload) {
  const subs = db.push_subs.filter((sub) => sub.user_id === recipientId);
  const webPush = await getWebPush();
  if (!webPush || !config.vapidPublicKey || !config.vapidPrivateKey) {
    debugLog("push.disabled", {
      recipientId,
      subscriptionCount: subs.length,
      hasWebPush: Boolean(webPush),
      hasPublicKey: Boolean(config.vapidPublicKey),
      hasPrivateKey: Boolean(config.vapidPrivateKey),
    });
    return { attempted: subs.length, sent: 0, disabled: true, stale: [] };
  }

  debugLog("push.begin", {
    recipientId,
    subscriptionCount: subs.length,
    title: payload.title,
    url: payload.url,
  });

  const stale = [];
  let sent = 0;
  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      );
      sent += 1;
      debugLog("push.subscription.sent", {
        recipientId,
        subscriptionId: sub.id,
        endpointHost: endpointHost(sub.endpoint),
      });
    } catch (err) {
      debugLog("push.subscription.failed", {
        recipientId,
        subscriptionId: sub.id,
        endpointHost: endpointHost(sub.endpoint),
        statusCode: err.statusCode || null,
        message: err.message,
      });
      if (err.statusCode === 404 || err.statusCode === 410) {
        stale.push(sub.id);
      } else {
        console.warn("Push send failed:", err.message);
      }
    }
  }

  debugLog("push.end", {
    recipientId,
    attempted: subs.length,
    sent,
    staleCount: stale.length,
  });

  return { attempted: subs.length, sent, disabled: false, stale };
}

async function getWebPush() {
  if (didTryImport) return webPushClient;
  didTryImport = true;
  try {
    const module = await import("web-push");
    webPushClient = module.default?.sendNotification ? module.default : module;
    webPushClient.setVapidDetails(
      config.vapidSubject,
      config.vapidPublicKey,
      config.vapidPrivateKey,
    );
    return webPushClient;
  } catch (err) {
    debugLog("push.webpush_import_failed", {
      message: err.message,
    });
    return null;
  }
}
