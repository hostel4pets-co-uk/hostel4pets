import { dotColours } from "./calendar.js";

function normalise(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

async function searchWiki(term) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=1&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.query?.search?.[0] || null;
}

async function getWikiLink(breed) {
    const firstHit = await searchWiki(breed);
    if (!firstHit) return await tryAnimalVariants(breed);

    const title = firstHit.title.toLowerCase();
    if (title.includes(breed.toLowerCase())) {
        return `https://en.wikipedia.org/wiki/${encodeURIComponent(firstHit.title.replace(/ /g, "_"))}`;
    }

    return await tryAnimalVariants(breed);
}

async function tryAnimalVariants(breed) {
    const attempts = [`${breed} dog`, `${breed} cat`, `${breed} breed`];
    for (const term of attempts) {
        const hit = await searchWiki(term);
        if (!hit) continue;
        const valid = await isAnimalBreed(hit.pageid);
        if (!valid) continue;
        return `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`;
    }
    return null;
}

async function isAnimalBreed(pageId) {
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&prop=categories&pageids=${pageId}&cllimit=50&format=json&origin=*`;
        const res = await fetch(url);
        if (!res.ok) return false;
        const data = await res.json();
        const categories = data?.query?.pages?.[pageId]?.categories || [];
        return categories.some(c => /dog breeds|cat breeds|domestic dogs|domestic cats/i.test(c.title));
    } catch {
        return false;
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
        const res = await fetch("https://h4p.api.kittycrypto.gg/calendar.json");
        if (!res.ok) throw new Error("Failed to fetch calendar.json");
        const events = await res.json();

        const staysByPet = {};

        events
            .filter(ev => ev.petId && ev.petId !== "Unknown")
            .sort((a, b) => new Date(a.start) - new Date(b.start))
            .forEach(ev => {
                const types = Array.isArray(ev.type) ? ev.type : [ev.type];
                if (types.includes("Not available")) return;

                const petId = ev.petId;
                if (!staysByPet[petId]) staysByPet[petId] = { open: null, ranges: [], pet: ev };

                if (types.includes("Check-in")) {
                    staysByPet[petId].open = normalise(new Date(ev.start));
                    staysByPet[petId].pet = ev;
                    return;
                }

                if (!types.includes("Check-out")) return;

                const start = staysByPet[petId].open;
                if (!start) {
                    staysByPet[petId].pet = ev;
                    return;
                }

                const end = normalise(new Date(ev.end));
                staysByPet[petId].ranges.push([start, end]);
                staysByPet[petId].open = null;
                staysByPet[petId].pet = ev;
            });

        const activePets = [];
        for (const petId in staysByPet) {
            const { ranges, pet } = staysByPet[petId];
            for (const [start, end] of ranges) {
                if (targetDate >= start && targetDate <= end) {
                    activePets.push({ pet, checkIn: start, checkOut: end });
                }
            }
        }

        activePets.sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());

        // Use shared global colour state
        const guestColourMap = window.guestColourMap || {};
        const colourHistory = window.colourHistory || [];
        window.guestColourMap = guestColourMap;
        window.colourHistory = colourHistory;

        const allColours = Object.values(dotColours);
        const activePetIds = new Set(activePets.map(a => a.pet.petId));

        for (const { pet } of activePets) {
            const petId = pet.petId;
            let assignedColour = guestColourMap[petId];

            if (!assignedColour) {
                const usedColours = Object.entries(guestColourMap)
                    .filter(([id]) => activePetIds.has(id))
                    .map(([, colour]) => colour);

                const freeColours = allColours.filter(c => !usedColours.includes(c));
                const unusedFree = freeColours.filter(c => !colourHistory.includes(c));
                const lruFree = freeColours
                    .slice()
                    .sort((a, b) => colourHistory.indexOf(a) - colourHistory.indexOf(b));

                assignedColour = unusedFree[0] || lruFree[0] || allColours[0];
                guestColourMap[petId] = assignedColour;
            }

            const idx = colourHistory.indexOf(assignedColour);
            if (idx !== -1) colourHistory.splice(idx, 1);
            colourHistory.push(assignedColour);
            pet.colour = assignedColour;
        }

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