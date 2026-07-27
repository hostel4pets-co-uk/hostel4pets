const routes = new Map([
    ["/index.html", "/"],
    ["/chat.html", "/chat"],
    ["/chat/", "/chat"],
    ["/calendar.html", "/calendar"],
    ["/calendar/", "/calendar"]
]);
export function cleanPath(path) {
    return routes.get(path) ?? null;
}
const path = cleanPath(window.location.pathname);
if (path) {
    const next = `${path}${window.location.search}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", next);
}
//# sourceMappingURL=routes.js.map