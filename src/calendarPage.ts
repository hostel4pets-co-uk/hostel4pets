export {};

function addCacheBuster(url: string): string {
  const cacheBuster = `v=${Date.now()}`;
  return url.includes("?") ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;
}

function cacheBustStaticResources(): void {
  document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"]').forEach(element => {
    if (element instanceof HTMLScriptElement) {
      element.src = addCacheBuster(element.src);
    } else {
      element.href = addCacheBuster(element.href);
    }
  });
}

function cacheBustFetchRequests(): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (resource: RequestInfo | URL, configuration?: RequestInit): Promise<Response> => {
    if (typeof resource === "string") {
      return originalFetch(addCacheBuster(resource), configuration);
    }
    if (resource instanceof URL) {
      return originalFetch(new URL(addCacheBuster(resource.toString())), configuration);
    }
    return originalFetch(resource, configuration);
  };
}

cacheBustStaticResources();
cacheBustFetchRequests();
await import("./calendar.js");
