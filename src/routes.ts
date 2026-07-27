const routes = new Map<string, string>([
  ["/index.html", "/"],
  ["/chat.html", "/chat"],
  ["/chat/", "/chat"],
  ["/calendar.html", "/calendar"],
  ["/calendar/", "/calendar"]
]);

export function cleanPath(path: string): string | null {
  return routes.get(path) ?? null;
}

const path = cleanPath(window.location.pathname);
if (path) {
  const next = `${path}${window.location.search}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", next);
}
