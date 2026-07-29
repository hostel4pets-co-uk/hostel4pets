import {
  BOOKING_PRICE_URL,
  bookingPriceDiff,
  requestBookingPrice,
  resolveBookingPrice,
  type BookingHttpInit,
  type BookingPriceRequest,
  type BookingSend
} from "../src/bookingApi.ts";
import { BookingCalculator, bookingConfig } from "../src/pricing/booking.ts";

const request: BookingPriceRequest = {
  checkIn: "2026-08-03T07:00",
  checkOut: "2026-08-05T21:30",
  numOfPets: 2,
  neuteredStatus: ["yes", "no"],
  cubStatus: ["no", "yes"]
};
const frontend = new BookingCalculator(bookingConfig).calculatePrice(
  new Date(request.checkIn),
  new Date(request.checkOut),
  request.numOfPets,
  request.neuteredStatus,
  request.cubStatus
);

const call: { url: string; init: BookingHttpInit } = {
  url: "",
  init: { method: "POST", headers: {}, body: "" }
};
const success: BookingSend = async (url, init) => {
  call.url = url;
  call.init = init;
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => frontend
  };
};

const backend = await requestBookingPrice(request, success);
assert(call.url === BOOKING_PRICE_URL, "Booking client used the wrong URL");
assert(call.init.method === "POST", "Booking client did not use POST");
assert(call.init.headers["Content-Type"] === "application/json", "Booking client did not send JSON");
assert(call.init.body === JSON.stringify(request), "Booking client changed the request contract");
assert(bookingPriceDiff(backend, frontend).length === 0, "Equal prices were reported as different");

const matching = await resolveBookingPrice(request, frontend, success);
assert(matching.source === "backend", "Available backend was not preferred");
assert(matching.differences.length === 0, "Matching backend and frontend prices diverged");

const changed = { ...frontend, totalCharge: frontend.totalCharge + 1 };
const divergent = await resolveBookingPrice(request, frontend, async () => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => changed
}));
assert(divergent.source === "backend", "Divergent backend response was not kept canonical");
assert(divergent.differences.some(item => item.startsWith("totalCharge:")), "Price divergence was not detected");

const offline = await resolveBookingPrice(request, frontend, async () => {
  throw new Error("offline");
});
assert(offline.source === "frontend", "Offline backend did not use the frontend fallback");
assert(bookingPriceDiff(offline.result, frontend).length === 0, "Fallback changed the local result");
assert(offline.cause?.message === "offline", "Fallback did not preserve the backend error");

const missingRoute = await resolveBookingPrice(request, frontend, async () => ({
  ok: false,
  status: 404,
  statusText: "Not Found",
  json: async () => ({ error: "Not found" })
}));
assert(missingRoute.source === "frontend", "Missing booking route did not use the frontend fallback");

let rejected = false;
try {
  await resolveBookingPrice(request, frontend, async () => ({
    ok: false,
    status: 400,
    statusText: "Bad Request",
    json: async () => ({ error: "checkOut must be after checkIn" })
  }));
} catch (err) {
  rejected = err instanceof Error && err.message === "checkOut must be after checkIn";
}
assert(rejected, "Invalid booking requests incorrectly used the local fallback");

console.log("Booking API, parity detection and offline fallback are valid.");

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
