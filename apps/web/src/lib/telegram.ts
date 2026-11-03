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

export function getStartParam() {
  try {
    const unsafe = WebApp as typeof WebApp & { initDataUnsafe?: { start_param?: string } };
    return unsafe.initDataUnsafe?.start_param || "";
  } catch {
    return "";
  }
}

// Bots cannot message a user who never started them, so the QR message needs this permission first.
// Always resolves: a declined or unavailable request must not block the registration.
export function requestBotWriteAccess() {
  return new Promise<void>((resolve) => {
    try {
      if (WebApp.initDataUnsafe.user?.allows_write_to_pm || !WebApp.isVersionAtLeast("6.9")) return resolve();
      WebApp.requestWriteAccess(() => resolve());
    } catch {
      resolve();
    }
  });
}

export function haptic(type: "success" | "error" | "warning" = "success") {
  try {
    WebApp.HapticFeedback.notificationOccurred(type);
  } catch {
    // Haptics are Telegram-only.
  }
}
