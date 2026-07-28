export {};
const calendarUrl = "https://h4p.kittycrow.dev/calendar.json";
const calendarPath = "/calendar.json";
const calendarMetadataPath = "/database/calendar";
const calendarStorageKey = "h4p.calendar.events.v1";
function addCacheBuster(url) {
    const cacheBuster = `v=${Date.now()}`;
    return url.includes("?") ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;
}
function resourceUrl(resource) {
    if (typeof resource === "string")
        return resource;
    if (resource instanceof URL)
        return resource.toString();
    return null;
}
function cacheBustFetchRequests() {
    const originalFetch = window.fetch.bind(window);
    let calendarRequest = null;
    let metadataRequest = null;
    const fetchCalendar = (url, configuration) => {
        calendarRequest ??= (async () => {
            try {
                const response = await originalFetch(addCacheBuster(url), configuration);
                if (response.ok) {
                    try {
                        localStorage.setItem(calendarStorageKey, await response.clone().text());
                    }
                    catch {
                        console.warn("Could not save calendar to local storage");
                    }
                }
                return response;
            }
            catch (error) {
                try {
                    const cached = localStorage.getItem(calendarStorageKey);
                    if (cached)
                        return new Response(cached, { status: 200, headers: { "Content-Type": "application/json" } });
                }
                catch {
                    console.warn("Could not read calendar from local storage");
                }
                throw error;
            }
        })();
        return calendarRequest.then(response => response.clone());
    };
    const fetchMetadata = (url, configuration) => {
        metadataRequest ??= originalFetch(addCacheBuster(url), configuration);
        return metadataRequest.then(response => response.clone());
    };
    window.fetch = (resource, configuration) => {
        const url = resourceUrl(resource);
        if (!url)
            return originalFetch(resource, configuration);
        const path = new URL(url, window.location.href).pathname;
        if (path === calendarPath)
            return fetchCalendar(url, configuration);
        if (path === calendarMetadataPath)
            return fetchMetadata(url, configuration);
        return originalFetch(addCacheBuster(url), configuration);
    };
    void fetchCalendar(calendarUrl).catch(() => undefined);
}
cacheBustFetchRequests();
const { initialiseCalendar } = await import("./calendar.js");
initialiseCalendar();
//# sourceMappingURL=calendarPage.js.map