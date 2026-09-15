import {
  BOOKING_OPEN_TIME,
  BOOKING_TIME_STEP_MINUTES,
  minimumCheckoutTime,
  normaliseCheckoutDate
} from "../src/bookingDates.ts";
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

if (BOOKING_TIME_STEP_MINUTES !== 15) {
  throw new Error("Booking time controls must use 15-minute steps");
}

if (normaliseCheckoutDate("2026-10-12", "") !== "2026-10-12") {
  throw new Error("Empty check-out date must default to the check-in date");
}

if (normaliseCheckoutDate("2026-10-12", "2026-09-20") !== "2026-10-12") {
  throw new Error("Check-out date must not be earlier than check-in");
}

if (normaliseCheckoutDate("2026-10-12", "2026-11-03") !== "2026-11-03") {
  throw new Error("Future check-out months must remain selectable");
}

if (minimumCheckoutTime("2026-10-12", "2026-10-12", "08:00") !== "08:15") {
  throw new Error("Same-day check-out must start one 15-minute step after check-in");
}

if (minimumCheckoutTime("2026-10-12", "2026-10-13", "21:45") !== BOOKING_OPEN_TIME) {
  throw new Error("Later-date check-out must start at opening time");
}

if (minimumCheckoutTime("2026-10-12", "2026-10-12", "22:00") !== null) {
  throw new Error("22:00 check-in must not permit a same-day check-out");
}

console.log("Booking pricing and date constraints are valid.");
