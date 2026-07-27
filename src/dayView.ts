import type {
  ActivePetStay,
  CalendarEventRecord,
  OpenStay,
  WikiCategoryResponse,
  WikiSearchHit,
  WikiSearchResponse
} from "./contracts.js";
import { normaliseDate, requireElement } from "./dom.js";
import { dotColours } from "./palette.js";

const calendarUrl = "https://h4p.kittycrow.dev/calendar.json";
const wikiCacheKey = "h4p.wiki.breed.links.v1";
let cachedEventsReference: CalendarEventRecord[] | null = null;
let cachedStaysByPet: Record<string, OpenStay> | null = null;

function getQueryDate(): Date | null {
  const value = new URLSearchParams(window.location.search).get("d");
  if (!value || !/^\d{8}$/.test(value)) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(4, 6), 10) - 1;
  const day = Number.parseInt(value.slice(6, 8), 10);
  return new Date(year, month, day);
}

async function getEvents(): Promise<CalendarEventRecord[]> {
  if (Array.isArray(window.h4pCalendarEvents)) return window.h4pCalendarEvents;
  const response = await fetch(calendarUrl);
  if (!response.ok) throw new Error("Failed to fetch calendar.json");
  const events = await response.json() as CalendarEventRecord[];
  if (!Array.isArray(events)) throw new Error("calendar.json did not return an array");
  window.h4pCalendarEvents = events;
  return events;
}

function eventTypes(event: CalendarEventRecord): string[] {
  if (Array.isArray(event.type)) return event.type;
  return event.type ? [event.type] : [];
}

function buildStaysByPet(events: CalendarEventRecord[]): Record<string, OpenStay> {
  if (cachedEventsReference === events && cachedStaysByPet) return cachedStaysByPet;
  const stays: Record<string, OpenStay> = {};

  events
    .filter(event => event.petId && event.petId !== "Unknown")
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())
    .forEach(event => {
      const petId = event.petId;
      if (!petId) return;
      const types = eventTypes(event);
      if (types.includes("Not available")) return;
      const stay = stays[petId] ?? { open: null, ranges: [], pet: event };
      stays[petId] = stay;

      if (types.includes("Check-in")) {
        stay.open = normaliseDate(new Date(event.start));
        stay.pet = event;
        return;
      }
      if (!types.includes("Check-out")) return;
      if (stay.open) {
        stay.ranges.push({ checkIn: stay.open, checkOut: normaliseDate(new Date(event.end)) });
        stay.open = null;
      }
      stay.pet = event;
    });

  cachedEventsReference = events;
  cachedStaysByPet = stays;
  return stays;
}

function getActivePets(events: CalendarEventRecord[], targetDate: Date): ActivePetStay[] {
  const active: ActivePetStay[] = [];
  for (const stay of Object.values(buildStaysByPet(events))) {
    for (const range of stay.ranges) {
      if (targetDate >= range.checkIn && targetDate <= range.checkOut) {
        active.push({ pet: stay.pet, checkIn: range.checkIn, checkOut: range.checkOut });
      }
    }
  }
  active.sort((left, right) => left.checkIn.getTime() - right.checkIn.getTime());
  return active;
}

function assignColours(activePets: ActivePetStay[]): void {
  const guestColourMap = window.guestColourMap ?? {};
  const colourHistory = window.colourHistory ?? [];
  window.guestColourMap = guestColourMap;
  window.colourHistory = colourHistory;

  const allColours = Object.values(dotColours);
  const activePetIds = new Set(activePets.flatMap(stay => stay.pet.petId ? [stay.pet.petId] : []));

  for (const { pet } of activePets) {
    const petId = pet.petId;
    if (!petId) continue;
    let assignedColour = guestColourMap[petId];
    if (!assignedColour) {
      const usedColours = Object.entries(guestColourMap)
        .filter(([id]) => activePetIds.has(id))
        .map(([, colour]) => colour);
      const freeColours = allColours.filter(colour => !usedColours.includes(colour));
      const unusedFree = freeColours.filter(colour => !colourHistory.includes(colour));
      const leastRecentFree = freeColours.slice().sort(
        (left, right) => colourHistory.indexOf(left) - colourHistory.indexOf(right)
      );
      assignedColour = unusedFree[0] ?? leastRecentFree[0] ?? allColours[0] ?? "grey";
      guestColourMap[petId] = assignedColour;
    }

    const previousIndex = colourHistory.indexOf(assignedColour);
    if (previousIndex !== -1) colourHistory.splice(previousIndex, 1);
    colourHistory.push(assignedColour);
    pet.colour = assignedColour;
  }
}

function getWikiCache(): Record<string, string | null> {
  try {
    const raw = localStorage.getItem(wikiCacheKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string | null>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function setWikiCache(cache: Record<string, string | null>): void {
  try {
    localStorage.setItem(wikiCacheKey, JSON.stringify(cache));
  } catch {
    console.warn("Could not save Wikipedia link cache");
  }
}

async function searchWiki(term: string): Promise<WikiSearchHit | null> {
  const url = "https://en.wikipedia.org/w/api.php"
    + `?action=query&list=search&srsearch=${encodeURIComponent(term)}`
    + "&srlimit=1&format=json&origin=*";
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json() as WikiSearchResponse;
  return data.query?.search?.[0] ?? null;
}

async function isAnimalBreed(pageId: number): Promise<boolean> {
  try {
    const url = "https://en.wikipedia.org/w/api.php"
      + `?action=query&prop=categories&pageids=${pageId}`
      + "&cllimit=50&format=json&origin=*";
    const response = await fetch(url);
    if (!response.ok) return false;
    const data = await response.json() as WikiCategoryResponse;
    const categories = data.query?.pages?.[String(pageId)]?.categories ?? [];
    return categories.some(category => /dog breeds|cat breeds|domestic dogs|domestic cats/i.test(category.title));
  } catch {
    return false;
  }
}

function wikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

async function tryAnimalVariants(breed: string): Promise<string | null> {
  for (const term of [`${breed} dog`, `${breed} cat`, `${breed} breed`]) {
    const hit = await searchWiki(term);
    if (hit && await isAnimalBreed(hit.pageid)) return wikiUrl(hit.title);
  }
  return null;
}

async function getWikiLink(breed: string): Promise<string | null> {
  if (!breed) return null;
  const cache = getWikiCache();
  const key = breed.toLowerCase().trim();
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key] ?? null;

  const firstHit = await searchWiki(breed);
  let link = firstHit?.title.toLowerCase().includes(breed.toLowerCase()) ? wikiUrl(firstHit.title) : null;
  if (!link) link = await tryAnimalVariants(breed);
  cache[key] = link;
  setWikiCache(cache);
  return link;
}

function renderEmptyState(list: HTMLUListElement): void {
  const item = document.createElement("li");
  item.className = "pet-item empty";
  item.textContent = "No bookings for this day.";
  list.appendChild(item);
}

function renderPet(stay: ActivePetStay, guestNumber: number): HTMLLIElement {
  const name = stay.pet.name ?? "Unknown";
  const species = stay.pet.species ?? "Unknown";
  const breed = stay.pet.breed ?? "Unknown";
  const colour = stay.pet.colour ?? "grey";
  const item = document.createElement("li");
  item.className = "pet-item";

  const dot = document.createElement("span");
  dot.className = "pet-dot";
  dot.style.backgroundColor = colour;
  const guest = document.createElement("div");
  guest.className = "guest-num";
  guest.textContent = `Guest ${guestNumber}:`;
  const nameLine = document.createElement("div");
  nameLine.className = "detail name";
  nameLine.textContent = `Name: ${name}`;
  const speciesLine = document.createElement("div");
  speciesLine.className = "detail species";
  speciesLine.textContent = `Species: ${species}`;
  const breedLine = document.createElement("div");
  breedLine.className = "detail breed";
  breedLine.textContent = `Breed: ${breed}`;
  item.append(dot, guest, nameLine, speciesLine, breedLine);

  void getWikiLink(breed).then(link => {
    if (!link) return;
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = breed;
    breedLine.textContent = "Breed: ";
    breedLine.appendChild(anchor);
  });
  return item;
}

export async function loadDayView(): Promise<void> {
  const targetDateRaw = getQueryDate();
  if (!targetDateRaw) return;
  const targetDate = normaliseDate(targetDateRaw);
  const title = document.getElementById("day-title");
  if (title) title.textContent = `Bookings for ${targetDate.toLocaleDateString()}`;
  const list = requireElement<HTMLUListElement>("pet-list");

  try {
    const activePets = getActivePets(await getEvents(), targetDate);
    assignColours(activePets);
    list.innerHTML = "";
    if (activePets.length === 0) {
      renderEmptyState(list);
      return;
    }
    activePets.forEach((stay, index) => list.appendChild(renderPet(stay, index + 1)));
  } catch {
    console.error("Error loading day view");
    list.innerHTML = "";
    const item = document.createElement("li");
    item.className = "pet-item error";
    item.textContent = "Could not load bookings for this day.";
    list.appendChild(item);
  }
}

window.loadDayView = loadDayView;

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("day-modal")) void loadDayView();
});
