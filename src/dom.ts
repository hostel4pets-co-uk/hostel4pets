export function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required element #${id} was not found`);
  return element as T;
}

export function optionalElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function requireQuery<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Required element ${selector} was not found`);
  return element as T;
}

export function eventTarget<T extends EventTarget>(event: Event): T {
  if (!event.target) throw new Error("Event target was not available");
  return event.target as T;
}

export function dateFromLocalInputs(dateValue: string, timeValue: string): Date {
  const [year = 0, month = 1, day = 1] = dateValue.split("-").map(Number);
  const [hour = 0, minute = 0] = (timeValue || "00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function normaliseDate(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
