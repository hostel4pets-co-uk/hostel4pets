const storageKey = "h4p.theme";
const darkPreference = window.matchMedia("(prefers-color-scheme: dark)");
function savedTheme() {
    try {
        const value = localStorage.getItem(storageKey);
        return value === "light" || value === "dark" ? value : null;
    }
    catch {
        return null;
    }
}
function systemTheme() {
    return darkPreference.matches ? "dark" : "light";
}
function activeTheme() {
    return savedTheme() ?? systemTheme();
}
function updateControls(theme) {
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
        const next = theme === "dark" ? "light" : "dark";
        button.dataset.themeState = theme;
        button.setAttribute("aria-label", `Use ${next} theme`);
        button.setAttribute("title", `Use ${next} theme`);
        button.setAttribute("aria-pressed", String(theme === "dark"));
        const label = button.querySelector("[data-theme-label]");
        if (label)
            label.textContent = theme === "dark" ? "🌙" : "☀️";
    });
}
function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    updateControls(theme);
}
function storeTheme(theme) {
    try {
        localStorage.setItem(storageKey, theme);
    }
    catch {
        console.warn("Theme preference could not be saved");
    }
}
function toggleTheme() {
    const next = activeTheme() === "dark" ? "light" : "dark";
    storeTheme(next);
    applyTheme(next);
}
applyTheme(activeTheme());
function initialiseControls() {
    updateControls(activeTheme());
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
        button.addEventListener("click", toggleTheme);
    });
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseControls, { once: true });
}
else {
    initialiseControls();
}
darkPreference.addEventListener("change", () => {
    if (!savedTheme())
        applyTheme(systemTheme());
});
export {};
//# sourceMappingURL=theme.js.map