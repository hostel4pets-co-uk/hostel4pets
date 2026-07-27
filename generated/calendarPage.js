export {};
function addCacheBuster(url) {
    const cacheBuster = `v=${Date.now()}`;
    return url.includes("?") ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;
}
function cacheBustFetchRequests() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (resource, configuration) => {
        if (typeof resource === "string")
            return originalFetch(addCacheBuster(resource), configuration);
        if (resource instanceof URL)
            return originalFetch(new URL(addCacheBuster(resource.toString())), configuration);
        return originalFetch(resource, configuration);
    };
}
cacheBustFetchRequests();
const { initialiseCalendar } = await import("./calendar.js");
initialiseCalendar();
//# sourceMappingURL=calendarPage.js.map