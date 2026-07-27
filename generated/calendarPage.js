export {};
function addCacheBuster(url) {
    const cacheBuster = `v=${Date.now()}`;
    return url.includes("?") ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;
}
function cacheBustStaticResources() {
    document.querySelectorAll('script[src], link[rel="stylesheet"]').forEach(element => {
        if (element instanceof HTMLScriptElement) {
            element.src = addCacheBuster(element.src);
        }
        else {
            element.href = addCacheBuster(element.href);
        }
    });
}
function cacheBustFetchRequests() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (resource, configuration) => {
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
//# sourceMappingURL=calendarPage.js.map