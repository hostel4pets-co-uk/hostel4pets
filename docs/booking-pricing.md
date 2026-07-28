# Booking pricing

The booking form sends its existing request contract to:

```text
POST https://h4p.kittycrow.dev/booking/price
```

The request fields are:

```text
checkIn
checkOut
numOfPets
neuteredStatus
cubStatus
```

The response fields are unchanged:

```text
totalCharge
depositAmount
breakdown
```

## Canonical and fallback calculations

The backend calculator is canonical. The frontend still contains the previous calculator for two purposes:

1. it provides an estimate when the backend cannot be reached or returns a server error;
2. it acts as a parity oracle whenever the backend responds.

For every valid estimate, the frontend calculates the local result and requests the backend result. When the backend responds successfully, its result is displayed. The totals, deposit and breakdown are compared with the local result.

If the backend is unreachable or returns a server-side failure, the local result is displayed instead. Client errors such as invalid dates remain errors and do not silently use the fallback.

## Divergence rule

A backend/frontend mismatch is reported in the browser console. The backend remains the source of truth.

**When the values diverge, update the frontend fallback calculator values or logic to match the backend before release. Do not change the backend merely to preserve stale frontend output.**

The following command validates the request contract, parity detection, backend preference and offline fallback:

```sh
npm run validate:booking-api
```

The existing `@hostel4pets/web/booking` export remains available while the backend repository uses it as an independent parity oracle. It should only be removed after both repositories have another shared contract and parity strategy in place.
