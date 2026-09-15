export const BOOKING_OPEN_TIME = "07:00";
export const BOOKING_CLOSE_TIME = "22:00";
export const BOOKING_TIME_STEP_MINUTES = 15;
function minutesFromTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match)
        return null;
    const hours = Number.parseInt(match[1] ?? "", 10);
    const minutes = Number.parseInt(match[2] ?? "", 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59)
        return null;
    return (hours * 60) + minutes;
}
function timeFromMinutes(value) {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}
export function normaliseCheckoutDate(checkInDate, checkOutDate) {
    if (!checkInDate)
        return checkOutDate;
    if (!checkOutDate || checkOutDate < checkInDate)
        return checkInDate;
    return checkOutDate;
}
export function minimumCheckoutTime(checkInDate, checkOutDate, checkInTime) {
    if (!checkInDate || checkOutDate !== checkInDate || !checkInTime)
        return BOOKING_OPEN_TIME;
    const checkInMinutes = minutesFromTime(checkInTime);
    const closingMinutes = minutesFromTime(BOOKING_CLOSE_TIME);
    if (checkInMinutes === null || closingMinutes === null)
        return BOOKING_OPEN_TIME;
    const minimum = checkInMinutes + BOOKING_TIME_STEP_MINUTES;
    return minimum <= closingMinutes ? timeFromMinutes(minimum) : null;
}
//# sourceMappingURL=bookingDates.js.map
