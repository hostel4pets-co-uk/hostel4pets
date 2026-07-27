import type { YesNo } from "./contracts.js";
import { dateFromLocalInputs, eventTarget, requireElement } from "./dom.js";
import { BookingCalculator, bookingConfig } from "./pricing/booking.js";

export { BookingCalculator, bookingConfig } from "./pricing/booking.js";

function readPetStatus(prefix: string, numberOfPets: number): YesNo[] {
  return Array.from({ length: numberOfPets }, (_, index) => {
    const select = requireElement<HTMLSelectElement>(`${prefix}${index + 1}`);
    return select.value === "yes" ? "yes" : "no";
  });
}

function calculateTotal(): void {
  const checkIn = dateFromLocalInputs(
    requireElement<HTMLInputElement>("checkInDate").value,
    requireElement<HTMLInputElement>("checkInTime").value
  );
  const checkOut = dateFromLocalInputs(
    requireElement<HTMLInputElement>("checkOutDate").value,
    requireElement<HTMLInputElement>("checkOutTime").value
  );

  if (!Number.isNaN(checkIn.getTime()) && !Number.isNaN(checkOut.getTime())) {
    document.dispatchEvent(new CustomEvent<BookingDatesChangedDetail>("booking:datesChanged", {
      detail: { checkIn, checkOut }
    }));
  }

  const numberOfPets = Number.parseInt(requireElement<HTMLSelectElement>("numOfPets").value, 10);
  const calculator = new BookingCalculator(bookingConfig);
  const result = calculator.calculatePrice(
    checkIn,
    checkOut,
    numberOfPets,
    readPetStatus("neutered", numberOfPets),
    readPetStatus("cub", numberOfPets)
  );

  requireElement<HTMLInputElement>("totalPrice").value = `£${result.totalCharge.toFixed(2)}`;
  requireElement<HTMLInputElement>("deposit").value = `£${result.depositAmount.toFixed(2)}`;
  requireElement<HTMLTextAreaElement>("priceBreakdown").value = result.breakdown;
}

function updatePetOptions(): void {
  const numberOfPets = Number.parseInt(requireElement<HTMLSelectElement>("numOfPets").value, 10);
  const container = requireElement<HTMLElement>("petOptions");
  const fragments: string[] = [];

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
    const neutered = requireElement<HTMLSelectElement>(`neutered${petNumber}`);
    const cub = requireElement<HTMLSelectElement>(`cub${petNumber}`);
    const savedNeutered = localStorage.getItem(`neutered${petNumber}`);
    const savedCub = localStorage.getItem(`cub${petNumber}`);

    if (savedNeutered) neutered.value = savedNeutered;
    if (savedCub) cub.value = savedCub;

    neutered.addEventListener("change", event => {
      localStorage.setItem(`neutered${petNumber}`, eventTarget<HTMLSelectElement>(event).value);
    });
    cub.addEventListener("change", event => {
      localStorage.setItem(`cub${petNumber}`, eventTarget<HTMLSelectElement>(event).value);
    });
  }
}

function initialiseBookingCalculator(): void {
  const numberOfPets = requireElement<HTMLSelectElement>("numOfPets");
  const savedNumber = localStorage.getItem("numOfPets");
  if (savedNumber) numberOfPets.value = savedNumber;

  updatePetOptions();
  numberOfPets.addEventListener("change", event => {
    localStorage.setItem("numOfPets", eventTarget<HTMLSelectElement>(event).value);
    updatePetOptions();
  });
  requireElement<HTMLButtonElement>("calculateButton").addEventListener("click", calculateTotal);

  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach(file => {
    const separator = file.href.includes("?") ? "&" : "?";
    file.href += `${separator}v=${Date.now()}`;
  });

  const today = new Date().toISOString().split("T")[0] ?? "";
  requireElement<HTMLInputElement>("checkInDate").min = today;
  requireElement<HTMLInputElement>("checkOutDate").min = today;
}

document.addEventListener("DOMContentLoaded", initialiseBookingCalculator);
