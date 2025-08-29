class BookingCalculator {
  constructor(hourlyRate, maxDailyRate, latePickupCharge, openingTime, closingTime, lateClosingTime, extraChargeNonNeutered, extraChargeCub) {
    this.hourlyRate = hourlyRate;
    this.maxDailyRate = maxDailyRate;
    this.latePickupCharge = latePickupCharge;
    this.openingTime = openingTime;
    this.closingTime = closingTime;
    this.lateClosingTime = lateClosingTime;
    this.extraChargeNonNeutered = extraChargeNonNeutered; // percentage, e.g. 0.2
    this.extraChargeCub = extraChargeCub;                 // percentage, e.g. 0.2
    this.extraPetDiscountRate = 0.10;                     // 10% discount per extra pet
    this.depositRateOfTotal = 0.25;                       // 25% of final total
  }

  // Calculates the base time charge for a single pet between two Date objects in local time
  _timeBaseForOnePet(checkIn, checkOut) {
    let base = 0;
    let cursor = new Date(checkIn.getTime());

    while (cursor < checkOut) {
      const nextBoundary = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 0, 0, 0, 0);
      const periodEnd = new Date(Math.min(nextBoundary.getTime(), checkOut.getTime()));
      const hoursThisPeriod = (periodEnd - cursor) / 36e5;
      const dailyCharge = Math.min(this.hourlyRate * hoursThisPeriod, this.maxDailyRate);
      base += dailyCharge;
      cursor = nextBoundary;
    }
    return base;
  }

  calculatePrice(checkIn, checkOut, numOfPets, neuteredStatus, cubStatus) {
    // Base time charge for one pet
    const baseOnePet = this._timeBaseForOnePet(checkIn, checkOut);

    // Base if every pet paid full price
    const baseAllPetsAtFull = baseOnePet * numOfPets;

    // Discount for extra pets: 10% of the one-pet base for each additional pet
    const extraPetCount = Math.max(0, numOfPets - 1);
    const extraPetDiscount = extraPetCount * (baseOnePet * this.extraPetDiscountRate);

    // Subtotal after discounts, before surcharges and deposit
    const baseAfterDiscounts = baseAllPetsAtFull - extraPetDiscount;

    // Surcharges per pet
    let cubSurcharge = 0;
    let nonNeuteredSurcharge = 0;

    for (let i = 0; i < numOfPets; i++) {
      const isCub = cubStatus[i] === 'yes';
      const isNonNeutered = neuteredStatus[i] === 'no';
      if (isCub) cubSurcharge += this.extraChargeCub * baseOnePet;
      if (isNonNeutered) nonNeuteredSurcharge += this.extraChargeNonNeutered * baseOnePet;
    }

    // Late pickup fee window check
    const checkoutHour = checkOut.getHours();
    const latePickupFee = checkoutHour > this.closingTime && checkoutHour <= this.lateClosingTime ? this.latePickupCharge : 0;

    // Grand total before deposit is included
    const grandWithoutDeposit = baseAfterDiscounts + cubSurcharge + nonNeuteredSurcharge + latePickupFee;

    // Make the final total include a 25% deposit, and keep the deposit field equal to 25% of that total
    // Solve T = grandWithoutDeposit + 0.25*T  =>  T = grandWithoutDeposit / 0.75
    const totalCharge = grandWithoutDeposit / (1 - this.depositRateOfTotal);
    const depositAmount = totalCharge * this.depositRateOfTotal;

    // Build explicit breakdown text
    const lines = [];

    lines.push('BASE');
    lines.push(`• Time charge per pet: £${baseOnePet.toFixed(2)} × ${numOfPets} pet(s) = £${baseAllPetsAtFull.toFixed(2)}`);

    lines.push('');
    lines.push('EXTRAS');
    if (nonNeuteredSurcharge > 0) lines.push(`• Non-neutered surcharge: £${nonNeuteredSurcharge.toFixed(2)}`);
    if (cubSurcharge > 0) lines.push(`• Puppy/kitten surcharge: £${cubSurcharge.toFixed(2)}`);
    if (latePickupFee > 0) lines.push(`• Late pickup fee: £${latePickupFee.toFixed(2)}`);
    lines.push(`• Deposit (25% of total): £${depositAmount.toFixed(2)}`);

    lines.push('');
    lines.push('DISCOUNTS');
    if (extraPetDiscount > 0) {
      lines.push(`• Multi-pet discount: -£${extraPetDiscount.toFixed(2)} (10% off per extra pet)`);
    } else {
      lines.push('• None');
    }

    lines.push('');
    lines.push('SUBTOTALS');
    lines.push(`• Base after discounts: £${baseAfterDiscounts.toFixed(2)}`);
    const extrasSum = nonNeuteredSurcharge + cubSurcharge + latePickupFee + depositAmount;
    lines.push(`• Extras total: £${extrasSum.toFixed(2)}`);

    lines.push('');
    lines.push('TOTAL');
    lines.push(`• Amount due in total: £${totalCharge.toFixed(2)}`);

    const breakdown = lines.join('\n');

    return {
      totalCharge,
      depositAmount,
      breakdown
    };
  }
}

// Build a local Date from separate <input type="date"> and <input type="time">
const combineLocal = (dateStr, timeStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
};

function calculateTotal() {
  const checkIn = combineLocal(
    document.getElementById('checkInDate').value,
    document.getElementById('checkInTime').value
  );
  const checkOut = combineLocal(
    document.getElementById('checkOutDate').value,
    document.getElementById('checkOutTime').value
  );

  const numOfPets = parseInt(document.getElementById('numOfPets').value);
  const neuteredStatus = Array.from({ length: numOfPets }, (_, i) => document.getElementById('neutered' + (i + 1)).value);
  const cubStatus = Array.from({ length: numOfPets }, (_, i) => document.getElementById('cub' + (i + 1)).value);

  // £2.25/hour, cap £27/day, £8 late pickup, open 07:00, close 20:00, late close 22:00, 20% surcharges
  const calculator = new BookingCalculator(2.25, 27, 8, 7, 20, 22, 0.2, 0.2);

  const { totalCharge, depositAmount, breakdown } =
    calculator.calculatePrice(checkIn, checkOut, numOfPets, neuteredStatus, cubStatus);

  document.getElementById('totalPrice').value = '£' + totalCharge.toFixed(2);
  document.getElementById('deposit').value = '£' + depositAmount.toFixed(2);
  document.getElementById('priceBreakdown').value = breakdown;
}

function updatePetOptions() {
  const numOfPets = parseInt(document.getElementById('numOfPets').value);
  let petOptionsHTML = '';
  for (let i = 0; i < numOfPets; i++) {
    petOptionsHTML += `
      <label for="neutered${i + 1}">Pet ${i + 1} Neutered/Spayed:</label>
      <select id="neutered${i + 1}">
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select><br>
      <label for="cub${i + 1}">Pet ${i + 1} a Cub (Puppy/Kitten):</label>
      <select id="cub${i + 1}">
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </select><br>
    `;
  }
  document.getElementById('petOptions').innerHTML = petOptionsHTML;
}

document.addEventListener('DOMContentLoaded', function () {
  updatePetOptions();

  document.getElementById('calculateButton').addEventListener('click', calculateTotal);

  const cssFiles = document.querySelectorAll('link[rel="stylesheet"]');
  cssFiles.forEach(function (file) {
    file.href += '?v=' + new Date().getTime();
  });

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) document.body.classList.add('mobile');
});