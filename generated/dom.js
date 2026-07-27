export function requireElement(id) {
    const element = document.getElementById(id);
    if (!element)
        throw new Error(`Required element #${id} was not found`);
    return element;
}
export function optionalElement(id) {
    return document.getElementById(id);
}
export function requireQuery(root, selector) {
    const element = root.querySelector(selector);
    if (!element)
        throw new Error(`Required element ${selector} was not found`);
    return element;
}
export function eventTarget(event) {
    if (!event.target)
        throw new Error("Event target was not available");
    return event.target;
}
export function dateFromLocalInputs(dateValue, timeValue) {
    const [year = 0, month = 1, day = 1] = dateValue.split("-").map(Number);
    const [hour = 0, minute = 0] = (timeValue || "00:00").split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0);
}
export function normaliseDate(value) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
//# sourceMappingURL=dom.js.map