class BookingCalculator {
  constructor(hourlyRate, maxDailyRate, latePickupCharge, openingTime, closingTime, lateClosingTime, extraChargeNonNeutered, extraChargeCub) {
    this.hourlyRate = hourlyRate;
    this.maxDailyRate = maxDailyRate;
    this.latePickupCharge = latePickupCharge;
    this.openingTime = openingTime;
    this.closingTime = closingTime;
    this.lateClosingTime = lateClosingTime;
    this.extraChargeNonNeutered = extraChargeNonNeutered;
    this.extraChargeCub = extraChargeCub;
    this.extraPetDiscountRate = 0.10; // 10% discount per extra pet
    this.depositRateOfTotal = 0.25;   // 25% of final total
  }

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
    const baseOnePet = this._timeBaseForOnePet(checkIn, checkOut);
    const baseAllPetsAtFull = baseOnePet * numOfPets;

    const extraPetCount = Math.max(0, numOfPets - 1);
    const extraPetDiscount = extraPetCount * (baseOnePet * this.extraPetDiscountRate);

    let cubSurcharge = 0;
    let nonNeuteredSurcharge = 0;
    for (let i = 0; i < numOfPets; i++) {
      if (cubStatus[i] === 'yes') cubSurcharge += this.extraChargeCub * baseOnePet;
      if (neuteredStatus[i] === 'no') nonNeuteredSurcharge += this.extraChargeNonNeutered * baseOnePet;
    }

    const checkoutHour = checkOut.getHours();
    const latePickupFee = checkoutHour > this.closingTime && checkoutHour <= this.lateClosingTime ? this.latePickupCharge : 0;

    // Final total: base - discount + surcharges
    const totalCharge = baseAllPetsAtFull - extraPetDiscount + cubSurcharge + nonNeuteredSurcharge + latePickupFee;

    // Deposit = 25% of total (not added to total)
    const depositAmount = totalCharge * this.depositRateOfTotal;

    const lines = [];

    lines.push('BASE');
    lines.push(`• Time charge per pet: £${baseOnePet.toFixed(2)} × ${numOfPets} = £${baseAllPetsAtFull.toFixed(2)}`);

    lines.push('');
    lines.push('DISCOUNTS');
    if (extraPetDiscount > 0) {
      lines.push(`• Multi-pet discount: -£${extraPetDiscount.toFixed(2)}`);
    } else {
      lines.push('• None');
    }

    lines.push('');
    lines.push('EXTRAS');
    if (nonNeuteredSurcharge > 0) lines.push(`• Non-neutered surcharge: £${nonNeuteredSurcharge.toFixed(2)}`);
    if (cubSurcharge > 0) lines.push(`• Puppy/kitten surcharge: £${cubSurcharge.toFixed(2)}`);
    if (latePickupFee > 0) lines.push(`• Late pickup fee: £${latePickupFee.toFixed(2)}`);
    if (nonNeuteredSurcharge === 0 && cubSurcharge === 0 && latePickupFee === 0) lines.push('• None');

    lines.push('');
    lines.push('TOTAL');
    lines.push(`• Amount due in total: £${totalCharge.toFixed(2)}`);

    lines.push('');
    lines.push('DEPOSIT');
    lines.push(`• Pay now (25% of total): £${depositAmount.toFixed(2)}`);

    return {
      totalCharge,
      depositAmount,
      breakdown: lines.join('\n')
    };
  }
}

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

  // Dispatch selection change event if both dates are valid
  if (!isNaN(checkIn) && !isNaN(checkOut)) {
    document.dispatchEvent(new CustomEvent("booking:datesChanged", {
      detail: { checkIn, checkOut }
    }));
  }

  const numOfPets = parseInt(document.getElementById('numOfPets').value);
  const neuteredStatus = Array.from({ length: numOfPets }, (_, i) => document.getElementById('neutered' + (i + 1)).value);
  const cubStatus = Array.from({ length: numOfPets }, (_, i) => document.getElementById('cub' + (i + 1)).value);

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

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('checkInDate').setAttribute('min', today);
  document.getElementById('checkOutDate').setAttribute('min', today);
});