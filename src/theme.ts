export type Theme = "light" | "dark";

const STORAGE_KEY = "ibmz-theme-v1";

export function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? systemTheme();
}

/** Apply theme to the document (PatternFly + custom CSS). */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("pf-v6-theme-dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(resolveInitialTheme());
}
