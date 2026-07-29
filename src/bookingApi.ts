import type { PriceResult, YesNo } from "./pricing/types.js";

export const BOOKING_PRICE_URL = "https://h4p.kittycrow.dev/booking/price";

export type { YesNo };

export interface BookingPriceRequest {
  checkIn: string;
  checkOut: string;
  numOfPets: number;
  neuteredStatus: YesNo[];
  cubStatus: YesNo[];
}

export type BookingPriceResponse = PriceResult;

export interface BookingHttpInit {
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

export interface BookingHttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<BookingPriceBody>;
}

export type BookingSend = (
  url: string,
  init: BookingHttpInit
) => Promise<BookingHttpResponse>;

type BookingPriceBody = Partial<BookingPriceResponse> & { error?: string };

export interface BookingPriceChoice {
  result: BookingPriceResponse;
  source: "backend" | "frontend";
  differences: string[];
  cause?: Error;
}

export class BookingApiError extends Error {
  public readonly status?: number;

  public constructor(message: string, status?: number) {
    super(message);
    this.name = "BookingApiError";
    this.status = status;
  }
}

const browserSend: BookingSend = async (url, init) => {
  const response = await fetch(url, init);
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json: async () => await response.json() as BookingPriceBody
  };
};

export async function requestBookingPrice(
  request: BookingPriceRequest,
  send: BookingSend = browserSend
): Promise<BookingPriceResponse> {
  const response = await send(BOOKING_PRICE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });
  const body = await response.json();

  if (!response.ok) {
    const message = typeof body.error === "string" && body.error.trim()
      ? body.error
      : `Booking endpoint failed: ${response.status} ${response.statusText}`;
    throw new BookingApiError(message, response.status);
  }

  const totalCharge = body.totalCharge;
  const depositAmount = body.depositAmount;
  const breakdown = body.breakdown;
  if (typeof totalCharge !== "number"
    || !Number.isFinite(totalCharge)
    || typeof depositAmount !== "number"
    || !Number.isFinite(depositAmount)
    || typeof breakdown !== "string") {
    throw new BookingApiError("Booking endpoint returned an invalid estimate");
  }

  return { totalCharge, depositAmount, breakdown };
}

export async function resolveBookingPrice(
  request: BookingPriceRequest,
  frontend: BookingPriceResponse,
  send: BookingSend = browserSend
): Promise<BookingPriceChoice> {
  try {
    const backend = await requestBookingPrice(request, send);
    return {
      result: backend,
      source: "backend",
      differences: bookingPriceDiff(backend, frontend)
    };
  } catch (err) {
    if (err instanceof BookingApiError && err.status === 400) throw err;
    return {
      result: frontend,
      source: "frontend",
      differences: [],
      cause: err instanceof Error ? err : new Error("Booking endpoint failed")
    };
  }
}

export function bookingPriceDiff(
  backend: BookingPriceResponse,
  frontend: BookingPriceResponse
): string[] {
  const differences: string[] = [];
  if (cents(backend.totalCharge) !== cents(frontend.totalCharge)) {
    differences.push(`totalCharge: backend=${backend.totalCharge}, frontend=${frontend.totalCharge}`);
  }
  if (cents(backend.depositAmount) !== cents(frontend.depositAmount)) {
    differences.push(`depositAmount: backend=${backend.depositAmount}, frontend=${frontend.depositAmount}`);
  }
  if (backend.breakdown !== frontend.breakdown) differences.push("breakdown text differs");
  return differences;
}

function cents(value: number): number {
  return Math.round(value * 100);
}
