import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
  exports?: Record<string, unknown>;
};
const source = await readFile("src/bookingPricing.ts", "utf8");

if (packageJson.exports?.["./booking"] !== "./src/bookingPricing.ts") {
  throw new Error("@hostel4pets/web/booking is not exported");
}

for (const browserGlobal of ["document", "window", "localStorage", "sessionStorage"]) {
  if (new RegExp(`\\b${browserGlobal}\\b`).test(source)) {
    throw new Error(`Booking pricing contract depends on browser global: ${browserGlobal}`);
  }
}

for (const requiredExport of ["BookingCalculator", "bookingConfig"]) {
  if (!source.includes(`export ${requiredExport === "BookingCalculator" ? "class" : "const"} ${requiredExport}`)) {
    throw new Error(`Booking pricing contract is missing ${requiredExport}`);
  }
}

console.log("Booking pricing contract is valid.");
