export class BookingCalculator {
    hourlyRate;
    maxDailyRate;
    latePickupCharge;
    closingTime;
    lateClosingTime;
    extraChargeNonNeutered;
    extraChargeCub;
    extraPetDiscountRate;
    depositRateOfTotal;
    constructor(configuration) {
        this.hourlyRate = configuration.hourlyRate;
        this.maxDailyRate = configuration.maxDailyRate;
        this.latePickupCharge = configuration.latePickupCharge;
        this.closingTime = configuration.closingTime;
        this.lateClosingTime = configuration.lateClosingTime;
        this.extraChargeNonNeutered = configuration.extraChargeNonNeutered;
        this.extraChargeCub = configuration.extraChargeCub;
        this.extraPetDiscountRate = configuration.extraPetDiscountRate ?? 0.10;
        this.depositRateOfTotal = configuration.depositRateOfTotal ?? 0.25;
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
//# sourceMappingURL=booking.js.map