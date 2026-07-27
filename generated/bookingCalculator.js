import { dateFromLocalInputs, eventTarget, requireElement } from "./dom.js";
import { BookingCalculator, bookingConfig } from "./pricing/booking.js";
export { BookingCalculator, bookingConfig } from "./pricing/booking.js";
function readPetStatus(prefix, numberOfPets) {
    return Array.from({ length: numberOfPets }, (_, index) => {
        const select = requireElement(`${prefix}${index + 1}`);
        return select.value === "yes" ? "yes" : "no";
    });
}
function calculateTotal() {
    const checkIn = dateFromLocalInputs(requireElement("checkInDate").value, requireElement("checkInTime").value);
    const checkOut = dateFromLocalInputs(requireElement("checkOutDate").value, requireElement("checkOutTime").value);
    if (!Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime())) {
        document.dispatchEvent(new CustomEvent("booking:datesChanged", {
            detail: { checkIn, checkOut }
        }));
    }
    const numberOfPets = Number.parseInt(requireElement("numOfPets").value, 10);
    const calculator = new BookingCalculator(bookingConfig);
    const result = calculator.calculatePrice(checkIn, checkOut, numberOfPets, readPetStatus("neutered", numberOfPets), readPetStatus("cub", numberOfPets));
    requireElement("totalPrice").value = `£${result.totalCharge.toFixed(2)}`;
    requireElement("deposit").value = `£${result.depositAmount.toFixed(2)}`;
    requireElement("priceBreakdown").value = result.breakdown;
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
    requireElement("calculateButton").addEventListener("click", calculateTotal);
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