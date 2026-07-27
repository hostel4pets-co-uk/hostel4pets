export type YesNo = "yes" | "no";

export interface BookingConfiguration {
  hourlyRate: number;
  maxDailyRate: number;
  latePickupCharge: number;
  openingTime: number;
  closingTime: number;
  lateClosingTime: number;
  extraChargeNonNeutered: number;
  extraChargeCub: number;
  extraPetDiscountRate?: number;
  depositRateOfTotal?: number;
}

export interface PriceResult {
  totalCharge: number;
  depositAmount: number;
  breakdown: string;
}
