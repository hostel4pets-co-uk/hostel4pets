type Theme = "light" | "dark";

const storageKey = "h4p.theme";
const darkPreference = window.matchMedia("(prefers-color-scheme: dark)");

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return darkPreference.matches ? "dark" : "light";
}

function activeTheme(): Theme {
  return savedTheme() ?? systemTheme();
}

function updateControls(theme: Theme): void {
  document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach(button => {
    const next = theme === "dark" ? "light" : "dark";
    button.dataset.themeState = theme;
    button.setAttribute("aria-label", `Use ${next} theme`);
    button.setAttribute("title", `Use ${next} theme`);
    button.setAttribute("aria-pressed", String(theme === "dark"));
    const label = button.querySelector<HTMLElement>("[data-theme-label]");
    if (label) label.textContent = theme === "dark" ? "🌙" : "☀️";
  });
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  updateControls(theme);
}

function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    console.warn("Theme preference could not be saved");
  }
}

function toggleTheme(): void {
  const next: Theme = activeTheme() === "dark" ? "light" : "dark";
  storeTheme(next);
  applyTheme(next);
}

applyTheme(activeTheme());

function initialiseControls(): void {
  updateControls(activeTheme());
  document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]").forEach(button => {
    button.addEventListener("click", toggleTheme);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiseControls, { once: true });
} else {
  initialiseControls();
}

darkPreference.addEventListener("change", () => {
  if (!savedTheme()) applyTheme(systemTheme());
});

export {};
