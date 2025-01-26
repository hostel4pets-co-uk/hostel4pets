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
    }
  
    calculatePrice(checkInDateTime, checkOutDateTime, numOfPets, neuteredStatus, cubStatus) {
      let breakdown = '';
      let totalCharge = 0;
      let baseCharge = 0;
      let checkIn = new Date(checkInDateTime);
      let checkOut = new Date(checkOutDateTime);
  
      while (checkIn < checkOut) {
        let nextBoundary = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate() + 1, 0, 0, 0); // Midnight of the next day
        let periodEnd = new Date(Math.min(nextBoundary, checkOut));
        let hoursThisPeriod = (periodEnd - checkIn) / (1000 * 60 * 60);
        let dailyCharge = Math.min(this.hourlyRate * hoursThisPeriod, this.maxDailyRate);
  
        baseCharge += dailyCharge;
        checkIn = nextBoundary;
      }
      breakdown += 'Base Charge: £' + baseCharge.toFixed(2) + '\n';
      totalCharge += baseCharge;
  
      let latePickupFee = 0;
      if (checkOut.getHours() > this.closingTime && checkOut.getHours() <= this.lateClosingTime) {
        latePickupFee = this.latePickupCharge;
        breakdown += 'Late Pickup Charge: £' + latePickupFee.toFixed(2) + '\n';
      }
      totalCharge += latePickupFee;
  
      let extraPetCharge = 0;
      if (numOfPets > 1) {
        extraPetCharge = (numOfPets - 1) * (baseCharge * 0.9);
        breakdown += 'Extra Pet Charge: £' + extraPetCharge.toFixed(2) + '\n';
      }
      totalCharge += extraPetCharge;
  
      let extraNonNeuteredCharge = 0;
      let extraCubCharge = 0;
      for (let i = 0; i < numOfPets; i++) {
        if (cubStatus[i] === 'yes') {
          extraCubCharge += this.extraChargeCub * baseCharge;
        }
        if (neuteredStatus[i] === 'no') {
          extraNonNeuteredCharge += this.extraChargeNonNeutered * baseCharge;
        }
      }
      if (extraCubCharge > 0) {
        breakdown += 'Cub Charge: £' + extraCubCharge.toFixed(2) + '\n';
      }
      if (extraNonNeuteredCharge > 0) {
        breakdown += 'Non-Neutered/Spayed Charge: £' + extraNonNeuteredCharge.toFixed(2) + '\n';
      }
      totalCharge += extraCubCharge + extraNonNeuteredCharge;
  
      return { totalCharge, breakdown };
    }
  }
  
  function calculateTotal() {
    const checkInDate = document.getElementById('checkInDate').value + ' ' + document.getElementById('checkInTime').value;
    const checkOutDate = document.getElementById('checkOutDate').value + ' ' + document.getElementById('checkOutTime').value;
    const numOfPets = parseInt(document.getElementById('numOfPets').value);
    const neuteredStatus = Array.from({length: numOfPets}, (_, i) => document.getElementById('neutered' + (i + 1)).value);
    const cubStatus = Array.from({length: numOfPets}, (_, i) => document.getElementById('cub' + (i + 1)).value);
  
    const calculator = new BookingCalculator(2, 24, 6, 7, 20, 22, 0.17, 0.17); // Modify these values as needed
    const { totalCharge, breakdown } = calculator.calculatePrice(checkInDate, checkOutDate, numOfPets, neuteredStatus, cubStatus);
  
    document.getElementById('totalPrice').value = '£' + totalCharge.toFixed(2);
    document.getElementById('deposit').value = '£' + (totalCharge * 0.25).toFixed(2);
    document.getElementById('priceBreakdown').value = breakdown;
  }
  
  function updatePetOptions() {
    const numOfPets = parseInt(document.getElementById('numOfPets').value);
    let petOptionsHTML = '';
    for (let i = 0; i < numOfPets; i++) {
      petOptionsHTML += `
        <label for="neutered${i+1}">Pet ${i+1} Neutered/Spayed:</label>
        <select id="neutered${i+1}">
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select><br>
        <label for="cub${i+1}">Pet ${i+1} a Cub (Puppy/Kitten):</label>
        <select id="cub${i+1}">
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select><br>
      `;
    }
    document.getElementById('petOptions').innerHTML = petOptionsHTML;
  }
  
  
  document.addEventListener('DOMContentLoaded', function() {
    updatePetOptions(); // Your existing call to populate pet options
  
    // Adding an event listener to the "Calculate" button
    document.getElementById('calculateButton').addEventListener('click', calculateTotal);
  
    var cssFiles = document.querySelectorAll('link[rel="stylesheet"]');
    cssFiles.forEach(function(file) {
      file.href += '?v=' + new Date().getTime();
    });
    
    var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
          document.body.classList.add('mobile');
      }
  });