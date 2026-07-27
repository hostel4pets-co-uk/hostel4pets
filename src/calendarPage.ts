export {};

function addCacheBuster(url: string): string {
  const cacheBuster = `v=${Date.now()}`;
  return url.includes("?") ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;
}

function cacheBustFetchRequests(): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (resource: RequestInfo | URL, configuration?: RequestInit): Promise<Response> => {
    if (typeof resource === "string") return originalFetch(addCacheBuster(resource), configuration);
    if (resource instanceof URL) return originalFetch(new URL(addCacheBuster(resource.toString())), configuration);
    return originalFetch(resource, configuration);
  };
}

cacheBustFetchRequests();
const { initialiseCalendar } = await import("./calendar.js");
initialiseCalendar();
