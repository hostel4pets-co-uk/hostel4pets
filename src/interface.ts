import { ChatApp } from "./chat.js";

const currencyPattern = /£\s*([0-9]+(?:\.[0-9]{1,2})?)/;
const taxiSectionPattern = /\n?PET TAXI\n• Journey estimate: £[0-9]+(?:\.[0-9]{2})?\n?/;
const bookingDraftKey = "h4p.bookingDraft.v1";

function parseCurrency(value: string): number | null {
  const match = currencyPattern.exec(value);
  if (!match?.[1]) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number): string {
  return `£${value.toFixed(2)}`;
}

function setFooterYear(): void {
  const currentYear = String(new Date().getFullYear());
  document.querySelectorAll<HTMLElement>("[data-current-year]").forEach(element => {
    element.textContent = currentYear;
  });
}

function fitBreakdown(textarea: HTMLTextAreaElement): void {
  textarea.style.blockSize = "auto";
  textarea.style.blockSize = `${textarea.scrollHeight + 2}px`;
}

interface BookingDisplayState {
  baseTotal: number | null;
  baseBreakdown: string;
  taxiPrice: number | null;
}

interface BookingDraft {
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  numberOfPets: string;
  pickupEnabled: boolean;
  dropoffEnabled: boolean;
  differentDropoff: boolean;
  pickupLocation: string;
  dropoffLocation: string;
  taxiOpen: boolean;
}

const emptyBookingDraft: BookingDraft = {
  checkInDate: "",
  checkInTime: "",
  checkOutDate: "",
  checkOutTime: "",
  numberOfPets: "1",
  pickupEnabled: true,
  dropoffEnabled: true,
  differentDropoff: false,
  pickupLocation: "",
  dropoffLocation: "",
  taxiOpen: false
};

function readBookingDraft(): BookingDraft {
  try {
    const raw = localStorage.getItem(bookingDraftKey);
    if (!raw) return { ...emptyBookingDraft };
    const saved = JSON.parse(raw) as Partial<BookingDraft>;
    return {
      checkInDate: typeof saved.checkInDate === "string" ? saved.checkInDate : "",
      checkInTime: typeof saved.checkInTime === "string" ? saved.checkInTime : "",
      checkOutDate: typeof saved.checkOutDate === "string" ? saved.checkOutDate : "",
      checkOutTime: typeof saved.checkOutTime === "string" ? saved.checkOutTime : "",
      numberOfPets: typeof saved.numberOfPets === "string" ? saved.numberOfPets : "1",
      pickupEnabled: typeof saved.pickupEnabled === "boolean" ? saved.pickupEnabled : true,
      dropoffEnabled: typeof saved.dropoffEnabled === "boolean" ? saved.dropoffEnabled : true,
      differentDropoff: typeof saved.differentDropoff === "boolean" ? saved.differentDropoff : false,
      pickupLocation: typeof saved.pickupLocation === "string" ? saved.pickupLocation : "",
      dropoffLocation: typeof saved.dropoffLocation === "string" ? saved.dropoffLocation : "",
      taxiOpen: typeof saved.taxiOpen === "boolean" ? saved.taxiOpen : false
    };
  } catch {
    return { ...emptyBookingDraft };
  }
}

function inputValue(id: string): string {
  const input = document.getElementById(id);
  return input instanceof HTMLInputElement || input instanceof HTMLSelectElement ? input.value : "";
}

function checkedValue(id: string, fallback: boolean): boolean {
  const input = document.getElementById(id);
  return input instanceof HTMLInputElement ? input.checked : fallback;
}

function collectBookingDraft(): BookingDraft {
  const taxi = document.getElementById("pet-taxi");
  return {
    checkInDate: inputValue("checkInDate"),
    checkInTime: inputValue("checkInTime"),
    checkOutDate: inputValue("checkOutDate"),
    checkOutTime: inputValue("checkOutTime"),
    numberOfPets: inputValue("numOfPets") || "1",
    pickupEnabled: checkedValue("pickupEnabled", true),
    dropoffEnabled: checkedValue("dropoffEnabled", true),
    differentDropoff: checkedValue("sameLocation", false),
    pickupLocation: inputValue("pickupLocation"),
    dropoffLocation: inputValue("dropoffLocation"),
    taxiOpen: taxi instanceof HTMLDetailsElement && taxi.open
  };
}

function saveBookingDraft(): void {
  try {
    const draft = collectBookingDraft();
    localStorage.setItem(bookingDraftKey, JSON.stringify(draft));
    localStorage.setItem("numOfPets", draft.numberOfPets);
  } catch {
    console.warn("Could not save booking selections");
  }
}

function setControlValue(id: string, value: string): void {
  const control = document.getElementById(id);
  if ((control instanceof HTMLInputElement || control instanceof HTMLSelectElement) && value) control.value = value;
}

function restoreSelectWhenReady(id: string, value: string): void {
  const select = document.getElementById(id);
  if (!(select instanceof HTMLSelectElement) || !value) return;

  const apply = (): boolean => {
    const available = Array.from(select.options).some(option => option.value === value);
    if (!available) return false;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  if (apply()) return;
  const observer = new MutationObserver(() => {
    if (apply()) observer.disconnect();
  });
  observer.observe(select, { childList: true });
  window.setTimeout(() => observer.disconnect(), 15_000);
}

function initialiseBookingPersistence(): void {
  const bookingForm = document.getElementById("booking-form");
  if (!bookingForm) return;

  const draft = readBookingDraft();
  setControlValue("checkInDate", draft.checkInDate);
  setControlValue("checkInTime", draft.checkInTime);
  setControlValue("checkOutDate", draft.checkOutDate);
  setControlValue("checkOutTime", draft.checkOutTime);
  setControlValue("numOfPets", draft.numberOfPets);

  const pickupEnabled = document.getElementById("pickupEnabled");
  const dropoffEnabled = document.getElementById("dropoffEnabled");
  const differentDropoff = document.getElementById("sameLocation");
  if (pickupEnabled instanceof HTMLInputElement) pickupEnabled.checked = draft.pickupEnabled;
  if (dropoffEnabled instanceof HTMLInputElement) dropoffEnabled.checked = draft.dropoffEnabled;
  if (differentDropoff instanceof HTMLInputElement) differentDropoff.checked = draft.differentDropoff;

  const taxi = document.getElementById("pet-taxi");
  if (taxi instanceof HTMLDetailsElement) {
    taxi.open = draft.taxiOpen;
    taxi.addEventListener("toggle", saveBookingDraft);
  }

  restoreSelectWhenReady("pickupLocation", draft.pickupLocation);
  restoreSelectWhenReady("dropoffLocation", draft.dropoffLocation);
  bookingForm.addEventListener("input", saveBookingDraft);
  bookingForm.addEventListener("change", saveBookingDraft);
  window.addEventListener("pagehide", saveBookingDraft);
}

function insertTaxiSection(breakdown: string, taxiPrice: number): string {
  const clean = breakdown.replace(taxiSectionPattern, "\n");
  const taxiSection = `\nPET TAXI\n• Journey estimate: ${formatCurrency(taxiPrice)}\n`;
  const totalMarker = "\nTOTAL\n";
  const totalIndex = clean.indexOf(totalMarker);
  return totalIndex === -1
    ? `${clean.trimEnd()}${taxiSection}`
    : `${clean.slice(0, totalIndex)}${taxiSection}${clean.slice(totalIndex)}`;
}

function initialiseEstimatePresentation(): void {
  const calculateButton = document.getElementById("calculateButton");
  const totalInput = document.getElementById("totalPrice");
  const depositInput = document.getElementById("deposit");
  const breakdown = document.getElementById("priceBreakdown");
  if (!(calculateButton instanceof HTMLButtonElement)
    || !(totalInput instanceof HTMLInputElement)
    || !(depositInput instanceof HTMLInputElement)
    || !(breakdown instanceof HTMLTextAreaElement)) return;

  const state: BookingDisplayState = {
    baseTotal: parseCurrency(totalInput.value),
    baseBreakdown: breakdown.value,
    taxiPrice: typeof window.taxiPrice === "number" ? window.taxiPrice : null
  };

  const render = (): void => {
    syncTaxiControls();
    if (state.baseTotal === null) {
      breakdown.value = state.baseBreakdown;
      fitBreakdown(breakdown);
      return;
    }

    const taxiPrice = state.taxiPrice ?? 0;
    const total = state.baseTotal + taxiPrice;
    const deposit = total * 0.25;
    totalInput.value = formatCurrency(total);
    depositInput.value = formatCurrency(deposit);

    let content = state.baseBreakdown;
    if (state.taxiPrice !== null) content = insertTaxiSection(content, state.taxiPrice);
    content = content
      .replace(/• Amount due in total: £[0-9]+(?:\.[0-9]{2})?/, `• Amount due in total: ${formatCurrency(total)}`)
      .replace(/• Pay now \(25% of total\): £[0-9]+(?:\.[0-9]{2})?/, `• Pay now (25% of total): ${formatCurrency(deposit)}`);
    breakdown.value = content;
    fitBreakdown(breakdown);
  };

  const captureBookingResult = (): void => {
    state.baseTotal = parseCurrency(totalInput.value);
    state.baseBreakdown = breakdown.value.replace(taxiSectionPattern, "\n");
    render();
  };

  calculateButton.addEventListener("click", () => requestAnimationFrame(captureBookingResult));
  document.addEventListener("booking:priceChanged", captureBookingResult);
  breakdown.addEventListener("input", () => fitBreakdown(breakdown));
  window.addEventListener("resize", () => fitBreakdown(breakdown));
  fitBreakdown(breakdown);

  const taxiForm = document.getElementById("taxi-form");
  const taxiResult = document.getElementById("taxi-result");
  const taxiSummaryStatus = document.getElementById("taxi-summary-status");
  const taxiSubmit = document.getElementById("taxiSubmit");
  const taxiRemove = document.getElementById("taxiRemove");
  if (!(taxiForm instanceof HTMLFormElement)) return;

  const syncTaxiControls = (): void => {
    const hasTaxi = state.taxiPrice !== null;
    if (taxiRemove instanceof HTMLButtonElement) taxiRemove.hidden = !hasTaxi;
    if (taxiSubmit instanceof HTMLButtonElement) taxiSubmit.textContent = hasTaxi ? "Update taxi estimate" : "Add taxi to estimate";
    if (taxiSummaryStatus) taxiSummaryStatus.textContent = hasTaxi && state.taxiPrice !== null
      ? `${formatCurrency(state.taxiPrice)} added`
      : "Optional";
  };

  taxiForm.addEventListener("submit", () => {
    delete window.taxiPrice;
    if (taxiResult) taxiResult.textContent = "Calculating taxi estimate…";

    const started = performance.now();
    const timer = window.setInterval(() => {
      const price = window.taxiPrice;
      if (typeof price === "number" && Number.isFinite(price)) {
        window.clearInterval(timer);
        state.taxiPrice = price;
        if (taxiResult) taxiResult.textContent = `${formatCurrency(price)} added to the stay estimate.`;
        render();
        return;
      }
      if (performance.now() - started > 15_000) {
        window.clearInterval(timer);
        if (taxiResult) taxiResult.textContent = "The taxi estimate could not be loaded. Please try again.";
      }
    }, 120);
  }, { capture: true });

  if (taxiRemove instanceof HTMLButtonElement) {
    taxiRemove.addEventListener("click", () => {
      state.taxiPrice = null;
      delete window.taxiPrice;
      if (taxiResult) taxiResult.textContent = "Pet taxi removed from this estimate.";
      render();
    });
  }
  syncTaxiControls();
}

function initialiseTaxiFlow(): void {
  const section = document.getElementById("pet-taxi");
  if (!(section instanceof HTMLDetailsElement)) return;

  const openSection = (): void => {
    section.open = true;
    requestAnimationFrame(() => section.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  document.querySelectorAll<HTMLElement>("[data-taxi-open]").forEach(control => {
    control.addEventListener("click", event => {
      event.preventDefault();
      openSection();
    });
  });

  if (window.location.hash === "#pet-taxi") openSection();
}

function initialiseStandaloneChat(): void {
  const shell = document.querySelector<HTMLElement>("#chat-panel-shell.standalone-chat-shell");
  if (!shell || window.chatApp) return;
  window.ChatApp = ChatApp;
  window.chatApp = new ChatApp();
}

function initialiseInterface(): void {
  setFooterYear();
  initialiseBookingPersistence();
  initialiseEstimatePresentation();
  initialiseTaxiFlow();
  initialiseStandaloneChat();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialiseInterface, { once: true });
} else {
  initialiseInterface();
}

export {};
