import { dotColours } from "./calendar.js";

function normalise(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

async function getWikiLink(breed) {
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(breed)}&limit=1&namespace=0&format=json&origin=*`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return data[3]?.[0] || null; // first URL if available
    } catch {
        return null;
    }
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

    const titleEl = document.getElementById("day-title");
    if (titleEl) {
        titleEl.textContent = `Bookings for ${targetDate.toLocaleDateString()}`;
    }

    try {
        const res = await fetch("https://kittycrypto.ddns.net:5493/calendar.json");
        if (!res.ok) throw new Error("Failed to fetch calendar.json");
        const events = await res.json();

        // Build stays map
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

        // Gather only pets checked in on targetDate
        const activePets = Object.values(stays)
            .filter(s => s.checkIn && s.checkOut &&
                targetDate >= s.checkIn && targetDate <= s.checkOut)
            .sort((a, b) => (a.checkIn.getTime() - b.checkIn.getTime()));

        // Assign colours in order
        const colours = Object.values(dotColours);
        activePets.forEach((stay, i) => {
            stay.pet.colour = colours[i % colours.length];
        });

        // Render list
        const list = document.getElementById("pet-list");
        if (!list) return;
        list.innerHTML = "";

        let guestCounter = 1;
        for (const stay of activePets) {
            const { name, species, breed, colour } = stay.pet;

            const li = document.createElement("li");
            li.className = "pet-item";

            const dot = document.createElement("span");
            dot.className = "pet-dot";
            dot.style.backgroundColor = colour;

            const guestNum = document.createElement("div");
            guestNum.className = "guest-num";
            guestNum.textContent = `Guest ${guestCounter++}:`;

            const nameLine = document.createElement("div");
            nameLine.className = "detail name";
            nameLine.textContent = `Name: ${name}`;

            const speciesLine = document.createElement("div");
            speciesLine.className = "detail species";
            speciesLine.textContent = `Species: ${species}`;

            const breedLine = document.createElement("div");
            breedLine.className = "detail breed";
            breedLine.textContent = `Breed: ${breed}`;

            // Fetch Wikipedia link asynchronously
            getWikiLink(breed).then(link => {
                if (link) {
                    const a = document.createElement("a");
                    a.href = link;
                    a.target = "_blank";
                    a.rel = "noopener noreferrer";
                    a.textContent = breed;
                    breedLine.textContent = "Breed: ";
                    breedLine.appendChild(a);
                }
            });

            li.append(dot, guestNum, nameLine, speciesLine, breedLine);
            list.appendChild(li);
        }
    } catch (err) {
        console.error("Error loading day view:", err);
    }
}

window.loadDayView = loadDayView;