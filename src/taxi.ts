import type { TaxiCoverageEntry, TaxiFormElements, TaxiPriceResponse } from "./contracts.js";
import { optionalElement } from "./dom.js";

async function loadCoverage(): Promise<string[]> {
  const response = await fetch("https://h4p.kittycrow.dev/taxiCoverage.json", {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

  const entries = await response.json() as TaxiCoverageEntry[];
  if (!Array.isArray(entries)) throw new Error("Coverage payload is not an array");

  const towns = new Set<string>();
  for (const entry of entries) {
    const town = entry.town?.trim();
    if (town) towns.add(town);
  }
  return Array.from(towns).sort((left, right) => left.localeCompare(right));
}

function populateSelect(select: HTMLSelectElement, towns: string[]): void {
  select.innerHTML = "";
  for (const town of towns) {
    const option = document.createElement("option");
    option.value = town;
    option.textContent = town;
    select.appendChild(option);
  }
}

function showDropoffFields(group: HTMLElement, dropoff: HTMLSelectElement): void {
  group.style.display = "";
  dropoff.disabled = false;
}

function hideDropoffFields(group: HTMLElement, dropoff: HTMLSelectElement): void {
  group.style.display = "none";
  dropoff.disabled = true;
}

function updateDropoffVisibility(elements: TaxiFormElements): void {
  const { pickupEnabled, dropoffEnabled, different, dropoffGroup, dropoff } = elements;
  if (!pickupEnabled.checked || !dropoffEnabled.checked) {
    different.disabled = true;
    different.checked = false;
    hideDropoffFields(dropoffGroup, dropoff);
    return;
  }

  different.disabled = false;
  if (different.checked) showDropoffFields(dropoffGroup, dropoff);
  else hideDropoffFields(dropoffGroup, dropoff);
}

function wireTaxiEvents(elements: TaxiFormElements): void {
  const handler = (): void => updateDropoffVisibility(elements);
  elements.pickupEnabled.addEventListener("change", handler);
  elements.dropoffEnabled.addEventListener("change", handler);
  elements.different.addEventListener("change", handler);
}

async function initTaxiForm(): Promise<void> {
  const pickup = optionalElement<HTMLSelectElement>("pickupLocation");
  const dropoff = optionalElement<HTMLSelectElement>("dropoffLocation");
  const pickupEnabled = optionalElement<HTMLInputElement>("pickupEnabled");
  const dropoffEnabled = optionalElement<HTMLInputElement>("dropoffEnabled");
  const different = optionalElement<HTMLInputElement>("sameLocation");
  const dropoffGroup = dropoff?.closest<HTMLElement>(".form-group") ?? null;

  if (!pickup || !dropoff || !pickupEnabled || !dropoffEnabled || !different || !dropoffGroup) return;

  const elements: TaxiFormElements = {
    pickup,
    dropoff,
    pickupEnabled,
    dropoffEnabled,
    different,
    dropoffGroup
  };
  const towns = await loadCoverage();
  populateSelect(pickup, towns);
  populateSelect(dropoff, towns);
  updateDropoffVisibility(elements);
  wireTaxiEvents(elements);

  const form = optionalElement<HTMLFormElement>("taxi-form");
  form?.addEventListener("submit", event => {
    event.preventDefault();
    void (async (): Promise<void> => {
      try {
        const pickupTown = pickupEnabled.checked ? pickup.value : null;
        const dropoffTown = dropoffEnabled.checked
          ? (different.checked ? dropoff.value : pickup.value)
          : null;
        const query = new URLSearchParams();
        if (pickupTown) query.append("pickupTown", pickupTown);
        if (dropoffTown) query.append("dropoffTown", dropoffTown);
        query.append("isReturn", dropoffEnabled.checked ? "true" : "false");

        const response = await fetch(`https://h4p.kittycrow.dev/taxi?${query.toString()}`, {
          headers: { Accept: "application/json" }
        });
        if (!response.ok) throw new Error(`Taxi endpoint failed: ${response.status} ${response.statusText}`);

        const body = await response.json() as TaxiPriceResponse;
        const price = Number(body.price);
        if (Number.isNaN(price)) throw new Error("Taxi endpoint returned invalid price");
        console.log(`[debug] Final taxi price = £${price.toFixed(2)}`);
        window.taxiPrice = price;
      } catch {
        console.error("[debug] Price calculation failed");
      }
    })();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTaxiForm().catch(() => console.error("Taxi form initialisation failed"));
});
