import { useEffect, useState } from "react";
import API_URL from "../../config/api";

const WIDGET_ROUTES = {
  trend: "attendance-trend",
  departments: "department-distribution",
  recruitment: "recruitment-stats",
};

// The dashboard places each widget itself, so the data loading is shared through this hook
export default function useDashboardWidgets() {
  const [widgets, setWidgets] = useState(() => Object.fromEntries(
    Object.keys(WIDGET_ROUTES).map((key) => [key, { status: "loading", data: null }])
  ));

  useEffect(() => {
    let active = true;

    // Each widget loads on its own, so one failing route leaves the others working
    Object.entries(WIDGET_ROUTES).forEach(async ([key, route]) => {
      let next = { status: "failed", data: null };
      try {
        const response = await fetch(`${API_URL}/api/dashboard/${route}`);
        if (response.ok) next = { status: "ready", data: await response.json() };
      } catch (error) {
        console.error(`Unable to load dashboard widget ${key}:`, error);
      }
      if (active) setWidgets((current) => ({ ...current, [key]: next }));
    });

    return () => {
      active = false;
    };
  }, []);

  return widgets;
}
