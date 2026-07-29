import { resolveBookingPrice } from "./bookingApi.js";
import { dateFromLocalInputs, eventTarget, requireElement } from "./dom.js";
import { BookingCalculator, bookingConfig } from "./pricing/booking.js";
export { BookingCalculator, bookingConfig } from "./pricing/booking.js";
function readPetStatus(prefix, numberOfPets) {
    return Array.from({ length: numberOfPets }, (_, index) => {
        const select = requireElement(`${prefix}${index + 1}`);
        return select.value === "yes" ? "yes" : "no";
    });
}
function localStamp(dateId, timeId) {
    const date = requireElement(dateId).value;
    const time = requireElement(timeId).value || "00:00";
    return date ? `${date}T${time}` : "";
}
function readRequest() {
    const checkIn = localStamp("checkInDate", "checkInTime");
    const checkOut = localStamp("checkOutDate", "checkOutTime");
    if (!checkIn || !checkOut)
        throw new Error("Choose check-in and check-out dates.");
    const numberOfPets = Number.parseInt(requireElement("numOfPets").value, 10);
    return {
        checkIn,
        checkOut,
        numOfPets: numberOfPets,
        neuteredStatus: readPetStatus("neutered", numberOfPets),
        cubStatus: readPetStatus("cub", numberOfPets)
    };
}
function localPrice(request) {
    const checkIn = new Date(request.checkIn);
    const checkOut = new Date(request.checkOut);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
        throw new Error("Choose valid check-in and check-out dates.");
    }
    if (checkOut <= checkIn)
        throw new Error("Check-out must be after check-in.");
    return new BookingCalculator(bookingConfig).calculatePrice(checkIn, checkOut, request.numOfPets, request.neuteredStatus, request.cubStatus);
}
function emitDates(request) {
    const checkIn = dateFromLocalInputs(request.checkIn.slice(0, 10), request.checkIn.slice(11));
    const checkOut = dateFromLocalInputs(request.checkOut.slice(0, 10), request.checkOut.slice(11));
    document.dispatchEvent(new CustomEvent("booking:datesChanged", {
        detail: { checkIn, checkOut }
    }));
}
async function bestPrice(request) {
    const choice = await resolveBookingPrice(request, localPrice(request));
    if (choice.differences.length > 0) {
        console.warn("[booking] Backend and frontend fallback prices diverged. Update the frontend calculator values to match the backend.", {
            differences: choice.differences,
            backend: choice.result,
            frontend: localPrice(request),
            request
        });
    }
    if (choice.source === "frontend") {
        console.warn("[booking] Backend unavailable; using the local fallback calculator.", choice.cause);
    }
    return choice.result;
}
async function calculateTotal(button) {
    const total = requireElement("totalPrice");
    const deposit = requireElement("deposit");
    const breakdown = requireElement("priceBreakdown");
    const label = button.querySelector("span");
    const oldLabel = label?.textContent ?? "Calculate estimate";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (label)
        label.textContent = "Calculating…";
    try {
        const request = readRequest();
        emitDates(request);
        const result = await bestPrice(request);
        total.value = `£${result.totalCharge.toFixed(2)}`;
        deposit.value = `£${result.depositAmount.toFixed(2)}`;
        breakdown.value = result.breakdown;
    }
    catch (err) {
        total.value = "";
        deposit.value = "";
        const detail = err instanceof Error && err.message ? ` ${err.message}` : "";
        breakdown.value = `The estimate could not be calculated.${detail}`;
    }
    finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        if (label)
            label.textContent = oldLabel;
        document.dispatchEvent(new Event("booking:priceChanged"));
    }
}
function updatePetOptions() {
    const numberOfPets = Number.parseInt(requireElement("numOfPets").value, 10);
    const container = requireElement("petOptions");
    const fragments = [];
    for (let index = 0; index < numberOfPets; index += 1) {
        const petNumber = index + 1;
        fragments.push(`
      <label for="neutered${petNumber}">Pet ${petNumber} Neutered/Spayed:</label>
      <select id="neutered${petNumber}">
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select><br>
      <label for="cub${petNumber}">Pet ${petNumber} a Cub (Puppy/Kitten):</label>
      <select id="cub${petNumber}">
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </select><br>
    `);
    }
    container.innerHTML = fragments.join("");
    for (let index = 0; index < numberOfPets; index += 1) {
        const petNumber = index + 1;
        const neutered = requireElement(`neutered${petNumber}`);
        const cub = requireElement(`cub${petNumber}`);
        const savedNeutered = localStorage.getItem(`neutered${petNumber}`);
        const savedCub = localStorage.getItem(`cub${petNumber}`);
        if (savedNeutered)
            neutered.value = savedNeutered;
        if (savedCub)
            cub.value = savedCub;
        neutered.addEventListener("change", event => {
            localStorage.setItem(`neutered${petNumber}`, eventTarget(event).value);
        });
        cub.addEventListener("change", event => {
            localStorage.setItem(`cub${petNumber}`, eventTarget(event).value);
        });
    }
}
function initialiseBookingCalculator() {
    const numberOfPets = requireElement("numOfPets");
    const savedNumber = localStorage.getItem("numOfPets");
    if (savedNumber)
        numberOfPets.value = savedNumber;
    updatePetOptions();
    numberOfPets.addEventListener("change", event => {
        localStorage.setItem("numOfPets", eventTarget(event).value);
        updatePetOptions();
    });
    const button = requireElement("calculateButton");
    button.addEventListener("click", () => {
        void calculateTotal(button);
    });
    document.querySelectorAll('link[rel="stylesheet"]').forEach(file => {
        const separator = file.href.includes("?") ? "&" : "?";
        file.href += `${separator}v=${Date.now()}`;
    });
    const today = new Date().toISOString().split("T")[0] ?? "";
    requireElement("checkInDate").min = today;
    requireElement("checkOutDate").min = today;
}
document.addEventListener("DOMContentLoaded", initialiseBookingCalculator);
//# sourceMappingURL=bookingCalculator.js.map