import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushState = "unsupported" | "default" | "subscribed" | "denied" | "loading";

export function usePush() {
  const [state, setState] = useState<PushState>("loading");

  const checkState = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "subscribed" : "default");
    } catch {
      setState("default");
    }
  }, []);

  useEffect(() => {
    checkState();
  }, [checkState]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setState("loading");
    try {
      const res = await fetch("/api/push/vapid-public-key", { credentials: "include" });
      if (!res.ok) throw new Error("VAPID 키 조회 실패");
      const { publicKey } = await res.json();

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "default");
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const { endpoint, keys } = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      await apiRequest("POST", "/api/push/subscribe", {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });

      setState("subscribed");
      return true;
    } catch (err) {
      console.error("구독 오류:", err);
      await checkState();
      return false;
    }
  }, [checkState]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await apiRequest("DELETE", "/api/push/subscribe", { endpoint });
      }
      setState("default");
      return true;
    } catch (err) {
      console.error("구독 해제 오류:", err);
      await checkState();
      return false;
    }
  }, [checkState]);

  return { state, subscribe, unsubscribe };
}
