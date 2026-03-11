import webpush from "web-push";

let initialized = false;

export function initPush() {
  if (initialized) return;

  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || "mailto:admin@kpetro.or.kr";

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    console.log("=== VAPID 키가 설정되지 않아 임시 키를 생성했습니다. ===");
    console.log("프로덕션 환경에서는 아래 키를 환경변수로 저장하세요:");
    console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
    console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
    console.log(`VAPID_EMAIL=${email}`);
    console.log("=========================================================");
  }

  webpush.setVapidDetails(email, publicKey, privateKey);
  initialized = true;
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || webpush.generateVAPIDKeys().publicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload)
    );
    return true;
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      return false;
    }
    console.error("푸시 전송 오류:", err.message ?? err);
    return false;
  }
}

export async function sendPushToAll(
  subscriptions: Array<{ endpoint: string; p256dh: string; auth: string }>,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      const ok = await sendPush(sub, payload);
      if (ok) sent++;
      else failed++;
    })
  );
  return { sent, failed };
}
