import { optionalElement } from "./dom.js";
async function loadCoverage() {
    const response = await fetch("https://h4p.kittycrow.dev/taxiCoverage.json", {
        headers: { Accept: "application/json" }
    });
    if (!response.ok)
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const entries = await response.json();
    if (!Array.isArray(entries))
        throw new Error("Coverage payload is not an array");
    const towns = new Set();
    for (const entry of entries) {
        const town = entry.town?.trim();
        if (town)
            towns.add(town);
    }
    return Array.from(towns).sort((left, right) => left.localeCompare(right));
}
function populateSelect(select, towns) {
    select.innerHTML = "";
    for (const town of towns) {
        const option = document.createElement("option");
        option.value = town;
        option.textContent = town;
        select.appendChild(option);
    }
}
function showDropoffFields(group, dropoff) {
    group.classList.remove("is-hidden");
    dropoff.disabled = false;
}
function hideDropoffFields(group, dropoff) {
    group.classList.add("is-hidden");
    dropoff.disabled = true;
}
function updateDropoffVisibility(elements) {
    const { pickupEnabled, dropoffEnabled, different, dropoffGroup, dropoff } = elements;
    if (!pickupEnabled.checked || !dropoffEnabled.checked) {
        different.disabled = true;
        different.checked = false;
        hideDropoffFields(dropoffGroup, dropoff);
        return;
    }
    different.disabled = false;
    if (different.checked)
        showDropoffFields(dropoffGroup, dropoff);
    else
        hideDropoffFields(dropoffGroup, dropoff);
}
function wireTaxiEvents(elements) {
    const handler = () => updateDropoffVisibility(elements);
    elements.pickupEnabled.addEventListener("change", handler);
    elements.dropoffEnabled.addEventListener("change", handler);
    elements.different.addEventListener("change", handler);
}
async function initTaxiForm() {
    const pickup = optionalElement("pickupLocation");
    const dropoff = optionalElement("dropoffLocation");
    const pickupEnabled = optionalElement("pickupEnabled");
    const dropoffEnabled = optionalElement("dropoffEnabled");
    const different = optionalElement("sameLocation");
    const dropoffGroup = dropoff?.closest(".form-group") ?? null;
    if (!pickup || !dropoff || !pickupEnabled || !dropoffEnabled || !different || !dropoffGroup)
        return;
    const elements = {
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
    const form = optionalElement("taxi-form");
    form?.addEventListener("submit", event => {
        event.preventDefault();
        void (async () => {
            try {
                const pickupTown = pickupEnabled.checked ? pickup.value : null;
                const dropoffTown = dropoffEnabled.checked
                    ? (different.checked ? dropoff.value : pickup.value)
                    : null;
                const query = new URLSearchParams();
                if (pickupTown)
                    query.append("pickupTown", pickupTown);
                if (dropoffTown)
                    query.append("dropoffTown", dropoffTown);
                query.append("isReturn", dropoffEnabled.checked ? "true" : "false");
                const response = await fetch(`https://h4p.kittycrow.dev/taxi?${query.toString()}`, {
                    headers: { Accept: "application/json" }
                });
                if (!response.ok)
                    throw new Error(`Taxi endpoint failed: ${response.status} ${response.statusText}`);
                const body = await response.json();
                const price = Number(body.price);
                if (Number.isNaN(price))
                    throw new Error("Taxi endpoint returned invalid price");
                console.log(`[debug] Final taxi price = £${price.toFixed(2)}`);
                window.taxiPrice = price;
            }
            catch {
                console.error("[debug] Price calculation failed");
            }
        })();
    });
}
document.addEventListener("DOMContentLoaded", () => {
    initTaxiForm().catch(() => console.error("Taxi form initialisation failed"));
});
//# sourceMappingURL=taxi.js.map