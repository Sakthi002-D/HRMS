import { useEffect } from "react";
import { applyDocumentTitle, getAppSettings, loadAppSettings, SETTINGS_EVENT } from "../../utils/appSettings";
import { storeAuthToken } from "../../utils/auth";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"];
const CHECK_INTERVAL_MS = 15 * 1000;

// Signed-in only. Loads the shared HR Settings once and signs the user out after the
// "Session Timeout" of inactivity chosen there.
function SessionGuard() {
  useEffect(() => {
    applyDocumentTitle();
    loadAppSettings().catch((error) => console.error("Unable to load settings:", error.message));

    let lastActivity = Date.now();
    const markActive = () => {
      lastActivity = Date.now();
    };

    const signOut = () => {
      storeAuthToken(null);
      sessionStorage.removeItem("loggedInHR");
      sessionStorage.removeItem("loggedInEmployee");
      window.location.href = "/login";
    };

    const check = () => {
      const minutes = Number(getAppSettings().sessionTimeout);
      if (minutes > 0 && Date.now() - lastActivity >= minutes * 60 * 1000) signOut();
    };

    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, markActive, { passive: true }));
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    // A hidden tab can be throttled; re-check as soon as it is visible again
    document.addEventListener("visibilitychange", check);
    window.addEventListener(SETTINGS_EVENT, check);

    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, markActive));
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener(SETTINGS_EVENT, check);
    };
  }, []);

  return null;
}

export default SessionGuard;
