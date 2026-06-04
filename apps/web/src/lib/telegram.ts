import WebApp from "@twa-dev/sdk";

export function initTelegram() {
  try {
    WebApp.ready();
    WebApp.expand();
    WebApp.setHeaderColor("#080405");
    WebApp.setBackgroundColor("#080405");
  } catch {
    // Local browser preview without Telegram runtime.
  }
}

export function getInitData() {
  return WebApp.initData || import.meta.env.VITE_DEV_INIT_DATA || "";
}

export function haptic(type: "success" | "error" | "warning" = "success") {
  try {
    WebApp.HapticFeedback.notificationOccurred(type);
  } catch {
    // Haptics are Telegram-only.
  }
}
