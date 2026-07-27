import { BookingCalculator, bookingConfig } from "../src/pricing/booking.ts";

const calculator = new BookingCalculator(bookingConfig);
const result = calculator.calculatePrice(
  new Date(2026, 6, 27, 12, 0, 0),
  new Date(2026, 6, 28, 10, 0, 0),
  1,
  ["yes"],
  ["no"]
);

if (!Number.isFinite(result.totalCharge) || result.totalCharge <= 0) {
  throw new Error("Booking pricing contract returned an invalid total");
}

if (!Number.isFinite(result.depositAmount) || result.depositAmount <= 0) {
  throw new Error("Booking pricing contract returned an invalid deposit");
}

if (!result.breakdown.includes("TOTAL")) {
  throw new Error("Booking pricing contract returned an invalid breakdown");
}

console.log("Booking pricing contract is valid.");
