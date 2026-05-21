import { dotColours } from "./calendar.js";

const CAL_URL = "https://h4p.kittycrow.dev/calendar.json";
const WIKI_CACHE_KEY = "h4p.wiki.breed.links.v1";

let cachedEventsRef = null;
let cachedStaysByPet = null;

function normalise(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}${month}${day}`;
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

async function getEvents() {
    if (Array.isArray(window.h4pCalendarEvents)) {
        return window.h4pCalendarEvents;
    }

    const res = await fetch(CAL_URL);

    if (!res.ok) {
        throw new Error("Failed to fetch calendar.json");
    }

    const events = await res.json();

    if (!Array.isArray(events)) {
        throw new Error("calendar.json did not return an array");
    }

    window.h4pCalendarEvents = events;

    return events;
}

function buildStaysByPet(events) {
    if (cachedEventsRef === events && cachedStaysByPet) {
        return cachedStaysByPet;
    }

    const staysByPet = {};

    events
        .filter(ev => ev.petId && ev.petId !== "Unknown")
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .forEach(ev => {
            const types = Array.isArray(ev.type) ? ev.type : [ev.type];

            if (types.includes("Not available")) return;

            const petId = ev.petId;

            if (!staysByPet[petId]) {
                staysByPet[petId] = {
                    open: null,
                    ranges: [],
                    pet: ev
                };
            }

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

    cachedEventsRef = events;
    cachedStaysByPet = staysByPet;

    return staysByPet;
}

function getActivePets(events, targetDate) {
    const staysByPet = buildStaysByPet(events);
    const activePets = [];

    for (const petId in staysByPet) {
        const { ranges, pet } = staysByPet[petId];

        for (const [checkIn, checkOut] of ranges) {
            if (targetDate >= checkIn && targetDate <= checkOut) {
                activePets.push({ pet, checkIn, checkOut });
            }
        }
    }

    activePets.sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());

    return activePets;
}

function assignColours(activePets) {
    const guestColourMap = window.guestColourMap || {};
    const colourHistory = window.colourHistory || [];

    window.guestColourMap = guestColourMap;
    window.colourHistory = colourHistory;

    const allColours = Object.values(dotColours);
    const activePetIds = new Set(activePets.map(active => active.pet.petId));

    for (const { pet } of activePets) {
        const petId = pet.petId;
        let assignedColour = guestColourMap[petId];

        if (!assignedColour) {
            const usedColours = Object.entries(guestColourMap)
                .filter(([id]) => activePetIds.has(id))
                .map(([, colour]) => colour);

            const freeColours = allColours.filter(colour => !usedColours.includes(colour));
            const unusedFree = freeColours.filter(colour => !colourHistory.includes(colour));
            const lruFree = freeColours
                .slice()
                .sort((a, b) => colourHistory.indexOf(a) - colourHistory.indexOf(b));

            assignedColour = unusedFree[0] || lruFree[0] || allColours[0];
            guestColourMap[petId] = assignedColour;
        }

        const idx = colourHistory.indexOf(assignedColour);

        if (idx !== -1) {
            colourHistory.splice(idx, 1);
        }

        colourHistory.push(assignedColour);
        pet.colour = assignedColour;
    }
}

function getWikiCache() {
    try {
        const raw = localStorage.getItem(WIKI_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};

        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function setWikiCache(cache) {
    try {
        localStorage.setItem(WIKI_CACHE_KEY, JSON.stringify(cache));
    } catch {
        // Non-critical cache.
    }
}

async function searchWiki(term) {
    const url =
        "https://en.wikipedia.org/w/api.php" +
        `?action=query&list=search&srsearch=${encodeURIComponent(term)}` +
        "&srlimit=1&format=json&origin=*";

    const res = await fetch(url);

    if (!res.ok) return null;

    const data = await res.json();

    return data?.query?.search?.[0] || null;
}

async function isAnimalBreed(pageId) {
    try {
        const url =
            "https://en.wikipedia.org/w/api.php" +
            `?action=query&prop=categories&pageids=${pageId}` +
            "&cllimit=50&format=json&origin=*";

        const res = await fetch(url);

        if (!res.ok) return false;

        const data = await res.json();
        const categories = data?.query?.pages?.[pageId]?.categories || [];

        return categories.some(category =>
            /dog breeds|cat breeds|domestic dogs|domestic cats/i.test(category.title)
        );
    } catch {
        return false;
    }
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

async function getWikiLink(breed) {
    if (!breed) return null;

    const cache = getWikiCache();
    const key = breed.toLowerCase().trim();

    if (Object.prototype.hasOwnProperty.call(cache, key)) {
        return cache[key];
    }

    const firstHit = await searchWiki(breed);
    let link = null;

    if (firstHit) {
        const title = firstHit.title.toLowerCase();

        if (title.includes(breed.toLowerCase())) {
            link = `https://en.wikipedia.org/wiki/${encodeURIComponent(firstHit.title.replace(/ /g, "_"))}`;
        }
    }

    if (!link) {
        link = await tryAnimalVariants(breed);
    }

    cache[key] = link;
    setWikiCache(cache);

    return link;
}

function renderEmptyState(list) {
    const li = document.createElement("li");
    li.className = "pet-item empty";
    li.textContent = "No bookings for this day.";
    list.appendChild(li);
}

function renderPet(stay, guestNumber) {
    const { name, species, breed, colour } = stay.pet;

    const li = document.createElement("li");
    li.className = "pet-item";

    const dot = document.createElement("span");
    dot.className = "pet-dot";
    dot.style.backgroundColor = colour;

    const guestNum = document.createElement("div");
    guestNum.className = "guest-num";
    guestNum.textContent = `Guest ${guestNumber}:`;

    const nameLine = document.createElement("div");
    nameLine.className = "detail name";
    nameLine.textContent = `Name: ${name}`;

    const speciesLine = document.createElement("div");
    speciesLine.className = "detail species";
    speciesLine.textContent = `Species: ${species}`;

    const breedLine = document.createElement("div");
    breedLine.className = "detail breed";
    breedLine.textContent = `Breed: ${breed}`;

    li.append(dot, guestNum, nameLine, speciesLine, breedLine);

    getWikiLink(breed).then(link => {
        if (!link) return;

        const a = document.createElement("a");
        a.href = link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = breed;

        breedLine.textContent = "Breed: ";
        breedLine.appendChild(a);
    });

    return li;
}

async function loadDayView() {
    const targetDateRaw = getQueryDate();

    if (!targetDateRaw) return;

    const targetDate = normalise(targetDateRaw);
    const titleEl = document.getElementById("day-title");

    if (titleEl) {
        titleEl.textContent = `Bookings for ${targetDate.toLocaleDateString()}`;
    }

    const list = document.getElementById("pet-list");

    if (!list) return;

    try {
        const events = await getEvents();
        const activePets = getActivePets(events, targetDate);

        assignColours(activePets);

        list.innerHTML = "";

        if (activePets.length === 0) {
            renderEmptyState(list);
            return;
        }

        let guestCounter = 1;

        for (const stay of activePets) {
            list.appendChild(renderPet(stay, guestCounter++));
        }
    } catch (err) {
        console.error("Error loading day view:", err);
        list.innerHTML = "";

        const li = document.createElement("li");
        li.className = "pet-item error";
        li.textContent = "Could not load bookings for this day.";

        list.appendChild(li);
    }
}

window.loadDayView = loadDayView;
