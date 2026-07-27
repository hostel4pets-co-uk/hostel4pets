import type {
  BankHolidayResponse,
  CalendarCacheRecord,
  CalendarDot,
  CalendarEventRecord,
  CalendarMetadata,
  HolidayEntry,
  PetStayRange
} from "./contracts.js";
import { loadDayView } from "./dayView.js";
import { normaliseDate, requireElement, requireQuery } from "./dom.js";
import { backgroundColours, dotColours } from "./palette.js";

export { backgroundColours, dotColours } from "./palette.js";

const fullDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const shortDayNames = ["Su", "M", "Tu", "W", "Th", "F", "Sa"] as const;
const veryShortDayNames = ["S", "m", "t", "w", "T", "f", "s"] as const;
const apiBase = "https://h4p.kittycrow.dev";
const calendarUrl = `${apiBase}/calendar.json`;
const calendarDatabaseUrl = `${apiBase}/database/calendar`;
const calendarShaKey = "h4p.calendar.sha256.v1";
const databaseName = "h4p-browser-cache";
const databaseVersion = 1;
const databaseStore = "calendar";
const calendarRecordId = "calendar";

Object.entries(backgroundColours).forEach(([key, value]) => {
  document.documentElement.style.setProperty(`--${key.toLowerCase()}`, value);
});

interface StayAccumulator {
  open: Date | null;
  ranges: PetStayRange[];
}

export class Calendar {
  private readonly container: HTMLElement;
  private readonly petTooltip: HTMLDivElement;
  private readonly onResize: () => void;
  private date = new Date();
  private guestColourMap: Record<string, string>;
  private colourHistory: string[];
  private allPets: CalendarEventRecord[] = [];
  private database: IDBDatabase | null = null;
  private dots: CalendarDot[] = [];
  private texts: Record<string, string[]> = {};
  private bankHolidays: Record<string, HolidayEntry> = {};
  private tableHeaders: HTMLTableCellElement[] = [];
  private loadId = 0;
  private abortController: AbortController | null = null;
  private selectedCheckIn: Date | null = null;
  private selectedCheckOut: Date | null = null;

  public constructor(containerId: string) {
    this.container = requireElement<HTMLElement>(containerId);
    this.guestColourMap = window.guestColourMap ?? {};
    this.colourHistory = window.colourHistory ?? [];
    this.petTooltip = this.createPetTooltip();
    this.onResize = () => this.updateDayHeaders();

    const requestedMonth = new URLSearchParams(window.location.search).get("m") ?? "";
    const match = /^(\d{4})(\d{2})$/.exec(requestedMonth);
    const year = match?.[1] ? Number(match[1]) : Number.NaN;
    const month = match?.[2] ? Number(match[2]) : Number.NaN;
    if (!Number.isNaN(year) && month >= 1 && month <= 12) this.date = new Date(year, month - 1, 1);

    document.addEventListener("booking:datesChanged", event => {
      const start = new Date(event.detail.checkIn);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(event.detail.checkOut);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      this.selectedCheckIn = start;
      this.selectedCheckOut = end;
      this.highlightSelected(start, end);
    });

    void this.render();
  }

  private createPetTooltip(): HTMLDivElement {
    const tooltip = document.createElement("div");
    tooltip.id = "pet-tooltip";
    document.body.appendChild(tooltip);
    return tooltip;
  }

  private openCacheDatabase(): Promise<IDBDatabase> {
    if (this.database) return Promise.resolve(this.database);
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, databaseVersion);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(databaseStore)) database.createObjectStore(databaseStore, { keyPath: "id" });
      };
      request.onsuccess = () => {
        this.database = request.result;
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked"));
    });
  }

  private async getCalendarCache(): Promise<CalendarEventRecord[] | null> {
    try {
      const database = await this.openCacheDatabase();
      return await new Promise<CalendarEventRecord[] | null>((resolve, reject) => {
        const request = database.transaction(databaseStore, "readonly").objectStore(databaseStore).get(calendarRecordId);
        request.onsuccess = () => {
          const record = request.result as CalendarCacheRecord | undefined;
          resolve(Array.isArray(record?.events) ? record.events : null);
        };
        request.onerror = () => reject(request.error ?? new Error("Calendar cache could not be read"));
      });
    } catch {
      console.warn("Could not read calendar cache from IndexedDB");
      return null;
    }
  }

  private async setCalendarCache(events: CalendarEventRecord[]): Promise<void> {
    try {
      const database = await this.openCacheDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(databaseStore, "readwrite");
        const record: CalendarCacheRecord = { id: calendarRecordId, events, savedAt: Date.now() };
        transaction.objectStore(databaseStore).put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Calendar cache write failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("Calendar cache write was aborted"));
      });
    } catch {
      console.warn("Could not save calendar cache to IndexedDB");
    }
  }

  private getCalendarSha(): string | null {
    try {
      return localStorage.getItem(calendarShaKey);
    } catch {
      return null;
    }
  }

  private setCalendarSha(sha: string | null): void {
    try {
      if (sha) localStorage.setItem(calendarShaKey, sha);
      else localStorage.removeItem(calendarShaKey);
    } catch {
      console.warn("Could not save calendar SHA");
    }
  }

  private async fetchCalendar(signal: AbortSignal): Promise<CalendarEventRecord[]> {
    const response = await fetch(calendarUrl, { signal });
    if (!response.ok) throw new Error("Failed to fetch calendar.json");
    const events = await response.json() as CalendarEventRecord[];
    if (!Array.isArray(events)) throw new Error("calendar.json did not return an array");
    return events;
  }

  private async fetchCalendarSha(signal: AbortSignal): Promise<string> {
    const response = await fetch(calendarDatabaseUrl, { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Failed to fetch calendar database metadata");
    const metadata = await response.json() as CalendarMetadata;
    if (!metadata || typeof metadata.sha256 !== "string") throw new Error("Calendar database metadata did not include sha256");
    return metadata.sha256;
  }

  private async getEvents(signal: AbortSignal): Promise<CalendarEventRecord[]> {
    const cached = await this.getCalendarCache();
    const cachedSha = this.getCalendarSha();
    if (!cached || !cachedSha) {
      const events = await this.fetchCalendar(signal);
      try {
        const sha = await this.fetchCalendarSha(signal);
        await this.setCalendarCache(events);
        this.setCalendarSha(sha);
      } catch {
        await this.setCalendarCache(events);
        this.setCalendarSha(null);
        console.warn("Calendar loaded, but its SHA cache could not be updated");
      }
      return events;
    }

    let liveSha = "";
    try {
      liveSha = await this.fetchCalendarSha(signal);
    } catch {
      console.warn("Could not check calendar SHA. Using IndexedDB calendar");
      return cached;
    }
    if (liveSha === cachedSha) return cached;

    try {
      const events = await this.fetchCalendar(signal);
      await this.setCalendarCache(events);
      this.setCalendarSha(liveSha);
      return events;
    } catch {
      console.warn("Could not refresh calendar. Using IndexedDB calendar");
      return cached;
    }
  }

  private async render(): Promise<void> {
    this.container.innerHTML = "";
    this.texts = {};
    this.dots = [];
    this.createHeader();
    this.createTable();
    this.updateTable();
    this.addLegend();
    await this.fetchBankHolidays();
    await this.bankHolidaysToTexts();
    this.addTexts();
    await this.loadBookings();
  }

  private createHeader(): void {
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "5px"
    });
    const backButton = document.createElement("button");
    backButton.innerText = "<";
    backButton.addEventListener("click", () => this.changeMonth(-1));
    const forwardButton = document.createElement("button");
    forwardButton.innerText = ">";
    forwardButton.addEventListener("click", () => this.changeMonth(1));
    const monthPicker = document.createElement("input");
    monthPicker.type = "month";
    monthPicker.value = `${this.date.getFullYear()}-${String(this.date.getMonth() + 1).padStart(2, "0")}`;
    monthPicker.style.margin = "0 10px";
    monthPicker.addEventListener("change", () => {
      const [year = this.date.getFullYear(), month = this.date.getMonth() + 1] = monthPicker.value.split("-").map(Number);
      this.date.setFullYear(year);
      this.date.setMonth(month - 1);
      const url = new URL(window.location.href);
      url.searchParams.set("m", `${year}${String(month).padStart(2, "0")}`);
      window.history.replaceState({}, "", url);
      void this.render();
    });
    header.append(backButton, monthPicker, forwardButton);
    this.container.appendChild(header);
  }

  private createTable(): void {
    this.tableHeaders = [];
    const table = document.createElement("table");
    table.id = "Calendar";
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
    const tableHead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    fullDayNames.forEach(day => {
      const header = document.createElement("th");
      header.innerText = day;
      Object.assign(header.style, { border: "1px solid #ddd", padding: "8px", textAlign: "center" });
      this.tableHeaders.push(header);
      headerRow.appendChild(header);
    });
    tableHead.appendChild(headerRow);
    table.appendChild(tableHead);

    const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
    const daysInMonth = new Date(this.date.getFullYear(), this.date.getMonth() + 1, 0).getDate();
    const rowsNeeded = Math.ceil((firstDay + daysInMonth) / 7);
    const body = document.createElement("tbody");
    const rows = Array.from({ length: rowsNeeded }, () => document.createElement("tr"));

    Array.from({ length: rowsNeeded * 7 }).forEach((_, index) => {
      const cell = document.createElement("td");
      Object.assign(cell.style, {
        border: "1px solid #ddd",
        padding: "8px",
        textAlign: "center",
        cursor: "pointer"
      });
      cell.dataset.day = String(index % 7);
      cell.dataset.week = String(Math.floor(index / 7));
      rows[Math.floor(index / 7)]?.appendChild(cell);
    });
    rows.forEach(row => body.appendChild(row));
    table.appendChild(body);
    this.container.appendChild(table);
    this.updateDayHeaders();
    window.removeEventListener("resize", this.onResize);
    window.addEventListener("resize", this.onResize);
  }

  private updateDayHeaders(): void {
    const narrow = this.container.offsetWidth < 400;
    const veryNarrow = this.container.offsetWidth < 350;
    this.tableHeaders.forEach((header, index) => {
      header.innerText = veryNarrow
        ? veryShortDayNames[index] ?? ""
        : narrow
          ? shortDayNames[index] ?? ""
          : fullDayNames[index] ?? "";
    });
  }

  private updateTable(): void {
    const table = requireElement<HTMLTableElement>("Calendar");
    const body = requireQuery<HTMLTableSectionElement>(table, "tbody");
    body.querySelectorAll<HTMLTableCellElement>("td").forEach(cell => {
      cell.textContent = "";
      cell.className = "";
      cell.style.fontWeight = "";
      cell.style.position = "";
      if (cell.dataset.locked !== "bank") {
        cell.style.backgroundColor = "";
        delete cell.dataset.locked;
      }
      delete cell.dataset.date;
    });

    const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
    const daysInMonth = new Date(this.date.getFullYear(), this.date.getMonth() + 1, 0).getDate();
    const today = new Date();

    for (let day = 1; day <= daysInMonth; day += 1) {
      const cellIndex = firstDay + day - 1;
      const row = Math.floor(cellIndex / 7);
      const column = cellIndex % 7;
      const cell = body.querySelector<HTMLTableCellElement>(`td[data-week="${row}"][data-day="${column}"]`);
      if (!cell) continue;
      const cellDate = new Date(this.date.getFullYear(), this.date.getMonth(), day);
      cell.textContent = String(day);
      cell.dataset.date = cellDate.toISOString().split("T")[0] ?? "";
      Object.assign(cell.style, { textAlign: "left", verticalAlign: "top", fontSize: "0.85em" });
      cell.onclick = () => void this.openDayModal(this.compactDate(cellDate));
      const isToday = cellDate.toDateString() === today.toDateString();
      const isPast = cellDate < today && !isToday;
      const count = this.dots.filter(dot => dot.date.toDateString() === cellDate.toDateString()).length;
      if (cell.dataset.locked !== "bank") this.updateCellBackground(cell, isToday, isPast, count);
      this.dots.filter(dot => dot.date.toDateString() === cellDate.toDateString()).forEach(dot => this.addDot(cellDate, dot.colour));
    }
    this.highlightSelected(this.selectedCheckIn, this.selectedCheckOut);
  }

  private updateCellBackground(cell: HTMLTableCellElement, isToday: boolean, isPast: boolean, dots: number, isBankHoliday = false): void {
    if (isPast) cell.style.backgroundColor = backgroundColours.PAST;
    else if (isBankHoliday) cell.style.backgroundColor = backgroundColours.BANKHOLIDAY;
    else if (isToday) {
      cell.style.backgroundColor = backgroundColours.TODAY;
      cell.style.fontWeight = "bold";
      cell.className = "today";
    } else if (dots > 5) cell.style.backgroundColor = backgroundColours.BOOKED;
    else if (dots >= 4) cell.style.backgroundColor = backgroundColours.BUSY;
    else cell.style.backgroundColor = "";
  }

  private highlightSelected(checkIn: Date | null, checkOut: Date | null): void {
    this.container.querySelectorAll("td.selected").forEach(cell => cell.classList.remove("selected"));
    if (!checkIn || !checkOut) return;
    this.container.querySelectorAll<HTMLTableCellElement>("td[data-date]").forEach(cell => {
      const value = cell.dataset.date;
      if (!value) return;
      const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
      const cellDate = new Date(year, month - 1, day);
      if (cellDate >= checkIn && cellDate <= checkOut) cell.classList.add("selected");
    });
  }

  private async fetchBankHolidays(): Promise<Record<string, HolidayEntry>> {
    if (Object.keys(this.bankHolidays).length > 0) return this.bankHolidays;
    try {
      const response = await fetch("https://www.gov.uk/bank-holidays.json");
      const data = await response.json() as BankHolidayResponse;
      const addHolidays = (events: BankHolidayResponse["scotland"]["events"]): Record<string, HolidayEntry> => {
        const result: Record<string, HolidayEntry> = {};
        const currentYear = new Date().getFullYear();
        events.forEach(holiday => {
          const date = new Date(holiday.date);
          const year = date.getFullYear();
          if (year >= currentYear - 1) result[`${holiday.title} (${year})`] = { date };
        });
        return result;
      };
      this.bankHolidays = {
        ...addHolidays(data.scotland.events),
        ...addHolidays(data["england-and-wales"].events)
      };
      return this.bankHolidays;
    } catch {
      console.error("Error fetching bank holidays");
      return {};
    }
  }

  private async bankHolidaysToTexts(): Promise<void> {
    const holidays = await this.fetchBankHolidays();
    for (const [holiday, entry] of Object.entries(holidays)) {
      const dateKey = this.getDateKey(entry.date);
      const holidayName = holiday.replace(/\s*\(\d{4}\)$/, "").trim();
      const entries = this.texts[dateKey] ?? [];
      if (!entries.includes(holidayName)) entries.push(holidayName);
      this.texts[dateKey] = entries;
      this.updateCellForHoliday(entry.date);
    }
  }

  private updateCellForHoliday(date: Date): void {
    if (date.getFullYear() !== this.date.getFullYear() || date.getMonth() !== this.date.getMonth()) return;
    const body = requireQuery<HTMLTableSectionElement>(requireElement<HTMLTableElement>("Calendar"), "tbody");
    const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
    const cellIndex = firstDay + date.getDate() - 1;
    const row = Math.floor(cellIndex / 7);
    const column = cellIndex % 7;
    const cell = body.querySelector<HTMLTableCellElement>(`td[data-week="${row}"][data-day="${column}"]`);
    if (!cell) return;
    const isToday = date.toDateString() === new Date().toDateString();
    const isPast = date < new Date() && !isToday;
    const count = this.dots.filter(dot => dot.date.toDateString() === date.toDateString()).length;
    this.updateCellBackground(cell, isToday, isPast, count, true);
    cell.dataset.locked = "bank";
  }

  private addDot(date: Date, preferredColour?: string, petId?: string): void {
    const dotDate = normaliseDate(date);
    const colours: readonly string[] = Object.values(dotColours);
    let colour = preferredColour;
    if (!colour) {
      const used = this.dots.filter(dot => dot.date.getTime() === dotDate.getTime()).map(dot => dot.colour);
      colour = colours.find(candidate => !used.includes(candidate));
    }
    if (!colour || !colours.includes(colour)) return;
    if (!this.dots.some(dot => dot.date.getTime() === dotDate.getTime() && dot.colour === colour)) this.dots.push({ date: dotDate, colour });
    if (dotDate.getMonth() !== this.date.getMonth() || dotDate.getFullYear() !== this.date.getFullYear()) return;

    const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
    const cellIndex = firstDay + dotDate.getDate() - 1;
    const row = Math.floor(cellIndex / 7);
    const column = cellIndex % 7;
    const cell = requireElement<HTMLTableElement>("Calendar").querySelector<HTMLTableCellElement>(`td[data-week="${row}"][data-day="${column}"]`);
    if (!cell) return;

    const dotSize = 8;
    const padding = 4;
    const maximumPerRow = Math.max(1, Math.floor(cell.clientWidth / (dotSize + padding)));
    const maximumRows = Math.max(1, Math.floor(cell.clientHeight / (dotSize + padding)));
    const existingDots = cell.querySelectorAll(".dot");
    if (existingDots.length >= maximumPerRow * maximumRows) return;

    const rowIndex = Math.floor(existingDots.length / maximumPerRow);
    const columnIndex = existingDots.length % maximumPerRow;
    const dot = document.createElement("div");
    dot.className = "dot";
    Object.assign(dot.style, {
      width: `${dotSize}px`,
      height: `${dotSize}px`,
      backgroundColor: colour,
      borderRadius: "50%",
      position: "absolute",
      bottom: `${padding + rowIndex * (dotSize + padding)}px`,
      left: `${padding + columnIndex * (dotSize + padding)}px`
    });
    cell.style.position = "relative";
    if (petId) dot.id = petId;
    cell.appendChild(dot);

    const isToday = dotDate.toDateString() === new Date().toDateString();
    const isPast = dotDate < new Date() && !isToday;
    const totalDots = this.dots.filter(item => item.date.toDateString() === dotDate.toDateString()).length;
    const locked = cell.dataset.locked === "na" || cell.dataset.locked === "bank";
    if (totalDots >= 4) {
      delete cell.dataset.locked;
      this.updateCellBackground(cell, isToday, isPast, totalDots);
    } else if (!locked) this.updateCellBackground(cell, isToday, isPast, totalDots);

    if (petId) {
      dot.addEventListener("mouseenter", () => {
        const pet = this.allPets.find(item => item.petId === petId);
        if (!pet) return;
        this.petTooltip.textContent = `${pet.name ?? "Unknown"}, ${pet.breed ?? "Unknown"}`;
        this.petTooltip.style.display = "block";
      });
      dot.addEventListener("mousemove", event => {
        this.petTooltip.style.left = `${event.pageX + 10}px`;
        this.petTooltip.style.top = `${event.pageY + 10}px`;
      });
      dot.addEventListener("mouseleave", () => { this.petTooltip.style.display = "none"; });
    }
  }

  private addLegend(): void {
    const legend = document.createElement("div");
    legend.className = "calendar-legend";
    legend.innerHTML = `<div class="calendar-legend-row">
      <div><span class="legend-box selected"></span>Selected Day(s)</div>
      <div><span class="legend-box today"></span>Today</div>
      <div><span class="legend-box busy"></span>Busy</div>
      <div><span class="legend-box booked"></span>Completely Booked</div>
      <div><span class="legend-box bankholiday"></span>Bank Holiday</div>
      <div><span class="legend-box notavailable"></span>Not Available</div>
    </div>`;
    this.container.appendChild(legend);
  }

  private getDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  private addTexts(): void {
    const body = requireQuery<HTMLTableSectionElement>(requireElement<HTMLTableElement>("Calendar"), "tbody");
    body.querySelectorAll<HTMLTableCellElement>("td").forEach(cell => {
      const day = Number.parseInt(cell.innerText.trim(), 10);
      if (Number.isNaN(day)) return;
      const dateKey = this.getDateKey(new Date(this.date.getFullYear(), this.date.getMonth(), day));
      cell.querySelector(".texts")?.remove();
      const entries = this.texts[dateKey];
      if (!entries?.length) return;
      const text = document.createElement("p");
      text.className = "texts";
      text.style.margin = "5px 0 0 0";
      text.style.fontSize = "0.75em";
      text.innerHTML = entries.join("<br>");
      cell.appendChild(text);
    });
  }

  private eventTypes(event: CalendarEventRecord): string[] {
    if (Array.isArray(event.type)) return event.type;
    return event.type ? [event.type] : [];
  }

  private async loadBookings(): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const loadId = ++this.loadId;

    try {
      const events = await this.getEvents(signal);
      this.allPets = events.filter(event => event.petId && event.petId !== "Unknown");
      window.h4pCalendarEvents = events;
      if (loadId !== this.loadId) return;

      for (const event of events) {
        if (!event.petId || event.petId === "Unknown" || !this.eventTypes(event).includes("Not available")) continue;
        const start = normaliseDate(new Date(event.start));
        const end = normaliseDate(new Date(event.end));
        for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
          if (loadId !== this.loadId) return;
          this.markNotAvailable(cursor);
        }
      }

      const stays: Record<string, StayAccumulator> = {};
      events
        .filter(event => event.petId && event.petId !== "Unknown")
        .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())
        .forEach(event => {
          const petId = event.petId;
          if (!petId) return;
          const types = this.eventTypes(event);
          if (types.includes("Not available")) return;
          const stay = stays[petId] ?? { open: null, ranges: [] };
          stays[petId] = stay;
          if (types.includes("Check-in")) {
            stay.open = normaliseDate(new Date(event.start));
            return;
          }
          if (types.includes("Check-out") && stay.open) {
            stay.ranges.push({ checkIn: stay.open, checkOut: normaliseDate(new Date(event.end)) });
            stay.open = null;
          }
        });

      const colours: readonly string[] = Object.values(dotColours);
      const activePetIds = new Set(Object.keys(stays));
      for (const [petId, stay] of Object.entries(stays)) {
        let colour = this.guestColourMap[petId];
        if (!colour) {
          const used = Object.entries(this.guestColourMap)
            .filter(([id]) => activePetIds.has(id))
            .map(([, assigned]) => assigned);
          const available = colours.filter(candidate => !used.includes(candidate));
          const unused = colours.find(candidate => !this.colourHistory.includes(candidate));
          colour = available[0] ?? unused ?? colours.at(-1) ?? "grey";
          this.guestColourMap[petId] = colour;
        }
        this.colourHistory = this.colourHistory.filter(item => item !== colour);
        this.colourHistory.push(colour);
        for (const range of stay.ranges) {
          for (let cursor = new Date(range.checkIn); cursor <= range.checkOut; cursor.setDate(cursor.getDate() + 1)) {
            if (loadId !== this.loadId) return;
            this.addDot(new Date(cursor), colour, petId);
          }
        }
      }
      Object.keys(this.guestColourMap).forEach(petId => {
        if (!activePetIds.has(petId)) delete this.guestColourMap[petId];
      });
      window.guestColourMap = this.guestColourMap;
      window.colourHistory = this.colourHistory;
    } catch {
      if (!signal.aborted) console.error("Error loading bookings");
    }
  }

  private markNotAvailable(date: Date): void {
    if (date.getMonth() !== this.date.getMonth() || date.getFullYear() !== this.date.getFullYear()) return;
    const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
    const cellIndex = firstDay + date.getDate() - 1;
    const row = Math.floor(cellIndex / 7);
    const column = cellIndex % 7;
    const cell = requireElement<HTMLTableElement>("Calendar").querySelector<HTMLTableCellElement>(`td[data-week="${row}"][data-day="${column}"]`);
    if (!cell) return;
    cell.style.backgroundColor = backgroundColours.NOTAVAILABLE;
    cell.dataset.locked = "na";
  }

  private changeMonth(offset: number): void {
    this.date.setMonth(this.date.getMonth() + offset);
    void this.render();
  }

  private compactDate(date: Date): string {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  }

  private async openDayModal(dateString: string): Promise<void> {
    if (document.getElementById("day-modal-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "day-modal-overlay";
    const modal = document.createElement("div");
    modal.id = "day-modal-shell";
    document.body.classList.add("no-scroll");
    window.guestColourMap = this.guestColourMap;
    window.colourHistory = this.colourHistory;

    let html = "";
    try {
      const response = await fetch("./dayView.html");
      if (!response.ok) throw new Error("Failed to load dayView.html");
      html = await response.text();
    } catch {
      html = "<div id=\"day-modal\" class=\"modal\"><div class=\"modal-content\"><h2 id=\"day-title\">Bookings</h2><ul id=\"pet-list\"></ul></div></div>";
    }

    const temporary = document.createElement("div");
    temporary.innerHTML = html;
    const backbone = temporary.querySelector<HTMLElement>("#day-modal") ?? temporary.firstElementChild as HTMLElement | null;
    if (backbone) {
      backbone.style.display = "block";
      modal.appendChild(backbone);
    } else modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const content = modal.querySelector<HTMLElement>(".modal-content") ?? modal;
    let closeElement = content.querySelector<HTMLElement>(".close");
    if (!closeElement) {
      closeElement = document.createElement("span");
      closeElement.className = "close";
      closeElement.textContent = "❌";
      content.style.position ||= "relative";
      content.appendChild(closeElement);
    }

    const previousUrl = window.location.href;
    const previousState = history.state as object | null;
    const closeModal = (): void => {
      overlay.remove();
      document.body.classList.remove("no-scroll");
      history.replaceState(previousState, "", previousUrl);
      document.removeEventListener("keydown", onEscape);
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeModal();
    };
    closeElement.addEventListener("click", closeModal);
    overlay.addEventListener("click", event => { if (event.target === overlay) closeModal(); });
    document.addEventListener("keydown", onEscape);

    const url = new URL(window.location.href);
    url.searchParams.set("d", dateString);
    history.replaceState(previousState, "", url);
    await loadDayView();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new Calendar("calendar-container");
});
