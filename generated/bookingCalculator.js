import { dateFromLocalInputs, eventTarget, requireElement } from "./dom.js";
export class BookingCalculator {
    hourlyRate;
    maxDailyRate;
    latePickupCharge;
    openingTime;
    closingTime;
    lateClosingTime;
    extraChargeNonNeutered;
    extraChargeCub;
    extraPetDiscountRate;
    depositRateOfTotal;
    sessionId;
    constructor(configuration) {
        this.hourlyRate = configuration.hourlyRate;
        this.maxDailyRate = configuration.maxDailyRate;
        this.latePickupCharge = configuration.latePickupCharge;
        this.openingTime = configuration.openingTime;
        this.closingTime = configuration.closingTime;
        this.lateClosingTime = configuration.lateClosingTime;
        this.extraChargeNonNeutered = configuration.extraChargeNonNeutered;
        this.extraChargeCub = configuration.extraChargeCub;
        this.extraPetDiscountRate = configuration.extraPetDiscountRate ?? 0.10;
        this.depositRateOfTotal = configuration.depositRateOfTotal ?? 0.25;
        this.sessionId = localStorage.getItem("sessionId");
    }
    timeBaseForOnePet(checkIn, checkOut) {
        let base = 0;
        let cursor = new Date(checkIn.getTime());
        while (cursor < checkOut) {
            const nextBoundary = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 0, 0, 0, 0);
            const periodEnd = new Date(Math.min(nextBoundary.getTime(), checkOut.getTime()));
            const hoursThisPeriod = (periodEnd.getTime() - cursor.getTime()) / 36e5;
            base += Math.min(this.hourlyRate * hoursThisPeriod, this.maxDailyRate);
            cursor = nextBoundary;
        }
        return base;
    }
    async getSessionId() {
        while (!this.sessionId) {
            this.sessionId = localStorage.getItem("sessionId");
            if (!this.sessionId)
                await new Promise(resolve => requestAnimationFrame(() => resolve()));
        }
        return this.sessionId;
    }
    calculatePrice(checkIn, checkOut, numberOfPets, neuteredStatus, cubStatus) {
        const baseOnePet = this.timeBaseForOnePet(checkIn, checkOut);
        const baseAllPetsAtFull = baseOnePet * numberOfPets;
        const extraPetCount = Math.max(0, numberOfPets - 1);
        const extraPetDiscount = extraPetCount * baseOnePet * this.extraPetDiscountRate;
        let cubSurcharge = 0;
        let nonNeuteredSurcharge = 0;
        for (let index = 0; index < numberOfPets; index += 1) {
            const isCub = cubStatus[index] === "yes";
            const isNeutered = neuteredStatus[index] === "yes";
            if (isCub)
                cubSurcharge += this.extraChargeCub * baseOnePet;
            else if (!isNeutered)
                nonNeuteredSurcharge += this.extraChargeNonNeutered * baseOnePet;
        }
        const checkoutHour = checkOut.getHours();
        const latePickupFee = checkoutHour > this.closingTime && checkoutHour <= this.lateClosingTime
            ? this.latePickupCharge
            : 0;
        const totalCharge = baseAllPetsAtFull
            - extraPetDiscount
            + cubSurcharge
            + nonNeuteredSurcharge
            + latePickupFee;
        const depositAmount = totalCharge * this.depositRateOfTotal;
        const lines = [
            "BASE",
            `• Time charge per pet: £${baseOnePet.toFixed(2)} × ${numberOfPets} = £${baseAllPetsAtFull.toFixed(2)}`,
            "",
            "DISCOUNTS",
            extraPetDiscount > 0 ? `• Multi-pet discount: -£${extraPetDiscount.toFixed(2)}` : "• None",
            "",
            "EXTRAS"
        ];
        if (nonNeuteredSurcharge > 0)
            lines.push(`• Non-neutered surcharge: £${nonNeuteredSurcharge.toFixed(2)}`);
        if (cubSurcharge > 0)
            lines.push(`• Puppy/kitten surcharge: £${cubSurcharge.toFixed(2)}`);
        if (latePickupFee > 0)
            lines.push(`• Late pickup fee: £${latePickupFee.toFixed(2)}`);
        if (nonNeuteredSurcharge === 0 && cubSurcharge === 0 && latePickupFee === 0)
            lines.push("• None");
        lines.push("", "TOTAL", `• Amount due in total: £${totalCharge.toFixed(2)}`, "", "DEPOSIT", `• Pay now (25% of total): £${depositAmount.toFixed(2)}`);
        return { totalCharge, depositAmount, breakdown: lines.join("\n") };
    }
    getOpeningTime() {
        return this.openingTime;
    }
}
export const bookingConfig = {
    hourlyRate: 2.25,
    maxDailyRate: 27,
    latePickupCharge: 8,
    openingTime: 7,
    closingTime: 20,
    lateClosingTime: 22,
    extraChargeNonNeutered: 0.2,
    extraChargeCub: 0.2
};
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