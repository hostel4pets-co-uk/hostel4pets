function normalise(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getQueryDate() {
    const params = new URLSearchParams(window.location.search);
    const d = params.get("d");
    if (!d || !/^\d{8}$/.test(d)) return null;
    const year = parseInt(d.slice(0, 4), 10);
    const month = parseInt(d.slice(4, 6), 10) - 1;
    const day = parseInt(d.slice(6, 8), 10);
    return new Date(year, month, day);
}

async function loadDayView() {
    const targetDateRaw = getQueryDate();
    if (!targetDateRaw) return;

    const targetDate = normalise(targetDateRaw);

    document.getElementById("day-title").textContent =
        `Bookings for ${targetDate.toLocaleDateString()}`;

    try {
        const res = await fetch("https://kittycrypto.ddns.net:5493/calendar.json");
        if (!res.ok) throw new Error("Failed to fetch calendar.json");
        const events = await res.json();

        // Build map of stays by pet
        const stays = {};
        for (const ev of events) {
            if (ev.type.includes("Check-in")) {
                if (!stays[ev.petId]) stays[ev.petId] = {};
                stays[ev.petId].checkIn = normalise(new Date(ev.start));
                stays[ev.petId].pet = ev;
            }
            if (ev.type.includes("Check-out")) {
                if (!stays[ev.petId]) stays[ev.petId] = {};
                stays[ev.petId].checkOut = normalise(new Date(ev.end));
                stays[ev.petId].pet = ev;
            }
        }

        const list = document.getElementById("pet-list");
        list.innerHTML = "";

        let guestCounter = 1;
        for (const petId in stays) {
            const stay = stays[petId];
            if (!stay.checkIn || !stay.checkOut) continue;

            if (targetDate >= stay.checkIn && targetDate <= stay.checkOut) {
                const { name, species, breed, colour } = stay.pet;

                const li = document.createElement("li");
                li.className = "pet-item";

                const dot = document.createElement("span");
                dot.className = "pet-dot";
                dot.style.backgroundColor = colour || "grey";

                // Guest number
                const guestNum = document.createElement("div");
                guestNum.className = "guest-num";
                guestNum.textContent = `Guest ${guestCounter++}:`;

                // Details (with CSS indentation instead of spaces)
                const nameLine = document.createElement("div");
                nameLine.className = "detail name";
                nameLine.textContent = `Name: ${name}`;

                const speciesLine = document.createElement("div");
                speciesLine.className = "detail species";
                speciesLine.textContent = `Species: ${species}`;

                const breedLine = document.createElement("div");
                breedLine.className = "detail breed";
                breedLine.textContent = `Breed: ${breed}`;

                li.appendChild(dot);
                li.appendChild(guestNum);
                li.appendChild(nameLine);
                li.appendChild(speciesLine);
                li.appendChild(breedLine);

                list.appendChild(li);
            }
        }
    } catch (err) {
        console.error("Error loading day view:", err);
    }
}

document.addEventListener("DOMContentLoaded", loadDayView);