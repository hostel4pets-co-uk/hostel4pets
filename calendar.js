export const dotColours = Object.freeze({
    RED: 'red', GREEN: 'green', DARK_BLUE: '#00008b', YELLOW: '#d4a017',
    PURPLE: 'purple', ORANGE: 'orange', HOT_PINK: '#ff69b4', MAROON: 'maroon',
    GOLD: 'gold', DARK_GREEN: '#006400', MAGENTA: 'magenta', NAVY: 'navy',
    BROWN: '#8b4513', INDIGO: 'indigo', OLIVE: 'olive', CRIMSON: 'crimson',
    AQUAMARINE: '#7fffd4', DARK_ORANGE: '#ff8c00', CORAL: 'coral', GREY: 'grey'
});

export const backgroundColours = Object.freeze({
    SELECTED: '#AADBAC', PAST: '#d3d3d3', TODAY: '#add8e6', BUSY: '#ffebcd', BOOKED: '#ffc0cb',
    BANKHOLIDAY: '#e6ccff', NOTAVAILABLE: '#a9a9a9'
});

const FULLDAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORTDAYNAMES = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];
const VERYSHORTDAYNAMES = ['S', 'm', 't', 'w', 'T', 'f', 's'];

const API_BASE = 'https://h4p.kittycrow.dev';
const CAL_URL = `${API_BASE}/calendar.json`;
const CAL_DB_URL = `${API_BASE}/database/calendar`;

const CAL_SHA_KEY = 'h4p.calendar.sha256.v1';
const IDB_NAME = 'h4p-browser-cache';
const IDB_VERSION = 1;
const IDB_STORE = 'calendar';
const IDB_CALENDAR_ID = 'calendar';

(() => {
    const root = document.documentElement;
    Object.entries(backgroundColours).forEach(([key, value]) => {
        root.style.setProperty(`--${key.toLowerCase()}`, value);
    });
})();

class Calendar {

    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.container = document.getElementById(containerId);
        this.guestColourMap = window.guestColourMap || {};
        this.colourHistory = window.colourHistory || [];
        this.allPets = [];
        this.idb = null;

        this.createPetTooltip();

        this.date = new Date();

        this.onResize = this.updateDayHeaders.bind(this);

        const m = new URLSearchParams(window.location.search).get("m") || "";
        const match = m.match(/^(\d{4})(\d{2})$/);
        const year = match ? Number(match[1]) : NaN;
        const month = match ? Number(match[2]) : NaN;

        if (!Number.isNaN(year) && month >= 1 && month <= 12) {
            this.date = new Date(year, month - 1, 1);
        }

        this.dotColours = dotColours;
        this.backgroundColours = backgroundColours;

        this.dots = [];
        this.texts = {};
        this.bankHolidays = {};

        this.thEls = [];
        this.loadId = 0;

        this.render();

        document.addEventListener("booking:datesChanged", e => {
            const start = new Date(e.detail.checkIn);
            start.setDate(start.getDate() - 1);
            start.setHours(0, 0, 0, 0);

            const end = new Date(e.detail.checkOut);
            end.setDate(end.getDate() - 1);
            end.setHours(23, 59, 59, 999);

            this.selectedCheckIn = start;
            this.selectedCheckOut = end;
            this.highlightSelected(this.selectedCheckIn, this.selectedCheckOut);
        });
    }

    createPetTooltip() {
        this.petTooltip = document.createElement('div');
        this.petTooltip.id = 'pet-tooltip';
        Object.assign(this.petTooltip.style, {
            position: 'fixed',
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            pointerEvents: 'none',
            zIndex: '1000',
            display: 'none'
        });
        document.body.appendChild(this.petTooltip);
    }

    openCacheDb() {
        if (this.idb) return Promise.resolve(this.idb);

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(IDB_NAME, IDB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;

                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'id' });
                }
            };

            request.onsuccess = () => {
                this.idb = request.result;
                resolve(this.idb);
            };

            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('IndexedDB upgrade was blocked'));
        });
    }

    async getCalCache() {
        try {
            const db = await this.openCacheDb();

            return await new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const store = tx.objectStore(IDB_STORE);
                const request = store.get(IDB_CALENDAR_ID);

                request.onsuccess = () => {
                    const record = request.result;
                    const events = record?.events;

                    resolve(Array.isArray(events) ? events : null);
                };

                request.onerror = () => reject(request.error);
            });
        } catch (err) {
            console.warn('Could not read calendar cache from IndexedDB:', err);
            return null;
        }
    }

    async setCalCache(events) {
        try {
            const db = await this.openCacheDb();

            await new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                const store = tx.objectStore(IDB_STORE);

                store.put({
                    id: IDB_CALENDAR_ID,
                    events,
                    savedAt: Date.now()
                });

                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        } catch (err) {
            console.warn('Could not save calendar cache to IndexedDB:', err);
        }
    }

    getCalSha() {
        try {
            return localStorage.getItem(CAL_SHA_KEY);
        } catch {
            return null;
        }
    }

    setCalSha(sha) {
        try {
            if (sha) {
                localStorage.setItem(CAL_SHA_KEY, sha);
                return;
            }

            localStorage.removeItem(CAL_SHA_KEY);
        } catch (err) {
            console.warn('Could not save calendar SHA:', err);
        }
    }

    async fetchCal(signal) {
        const response = await fetch(CAL_URL, { signal });

        if (!response.ok) {
            throw new Error('Failed to fetch calendar.json');
        }

        const events = await response.json();

        if (!Array.isArray(events)) {
            throw new Error('calendar.json did not return an array');
        }

        return events;
    }

    async fetchCalSha(signal) {
        const response = await fetch(CAL_DB_URL, {
            signal,
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error('Failed to fetch calendar database metadata');
        }

        const meta = await response.json();

        if (!meta || typeof meta.sha256 !== 'string') {
            throw new Error('Calendar database metadata did not include sha256');
        }

        return meta.sha256;
    }

    async getEvents(signal) {
        const cached = await this.getCalCache();
        const cachedSha = this.getCalSha();

        if (!cached || !cachedSha) {
            const events = await this.fetchCal(signal);

            try {
                const sha = await this.fetchCalSha(signal);
                await this.setCalCache(events);
                this.setCalSha(sha);
            } catch (err) {
                await this.setCalCache(events);
                this.setCalSha(null);
                console.warn('Calendar loaded, but SHA cache could not be updated:', err);
            }

            return events;
        }

        let liveSha;

        try {
            liveSha = await this.fetchCalSha(signal);
        } catch (err) {
            console.warn('Could not check calendar SHA. Using IndexedDB calendar:', err);
            return cached;
        }

        if (liveSha === cachedSha) {
            return cached;
        }

        try {
            const events = await this.fetchCal(signal);
            await this.setCalCache(events);
            this.setCalSha(liveSha);

            return events;
        } catch (err) {
            console.warn('Could not refresh calendar. Using IndexedDB calendar:', err);
            return cached;
        }
    }

    async render() {
        this.container.innerHTML = '';
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

    createHeader() {
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '5px';

        const backButton = document.createElement('button');
        backButton.innerText = '<';
        backButton.addEventListener('click', () => this.changeMonth(-1));

        const forwardButton = document.createElement('button');
        forwardButton.innerText = '>';
        forwardButton.addEventListener('click', () => this.changeMonth(1));

        const monthPicker = document.createElement('input');
        monthPicker.type = 'month';
        monthPicker.value = `${this.date.getFullYear()}-${String(this.date.getMonth() + 1).padStart(2, '0')}`;
        monthPicker.style.margin = '0 10px';
        monthPicker.addEventListener('change', () => {
            const [year, month] = monthPicker.value.split('-').map(Number);
            this.date.setFullYear(year);
            this.date.setMonth(month - 1);

            const newM = `${year}${String(month).padStart(2, '0')}`;
            const url = new URL(window.location.href);
            url.searchParams.set("m", newM);
            window.history.replaceState({}, "", url);

            this.render();
        });

        header.appendChild(backButton);
        header.appendChild(monthPicker);
        header.appendChild(forwardButton);

        this.container.appendChild(header);
    }

    createTable() {
        this.thEls = [];
        const table = document.createElement('table');
        table.id = 'Calendar';
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        for (const day of FULLDAYNAMES) {
            const th = document.createElement('th');
            th.innerText = day;
            this.thEls.push(th);
            th.style.border = '1px solid #ddd';
            th.style.padding = '8px';
            th.style.textAlign = 'center';
            headerRow.appendChild(th);
        }

        thead.appendChild(headerRow);
        table.appendChild(thead);
        this.updateDayHeaders();
        window.removeEventListener('resize', this.onResize);
        window.addEventListener('resize', this.onResize);

        const tbody = document.createElement('tbody');

        const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
        const daysInMonth = new Date(this.date.getFullYear(), this.date.getMonth() + 1, 0).getDate();
        const totalCells = firstDay + daysInMonth;
        const rowsNeeded = Math.ceil(totalCells / 7);

        const rows = Array.from({ length: rowsNeeded }, () => document.createElement('tr'));

        Array.from({ length: rowsNeeded * 7 }).forEach((_, index) => {
            const td = document.createElement('td');
            td.style.border = '1px solid #ddd';
            td.style.padding = '8px';
            td.style.textAlign = 'center';
            td.style.cursor = 'pointer';
            td.dataset.day = index % 7;
            td.dataset.week = Math.floor(index / 7);
            rows[Math.floor(index / 7)].appendChild(td);
        });

        rows.forEach(row => tbody.appendChild(row));

        table.appendChild(tbody);
        this.container.appendChild(table);
    }

    updateDayHeaders() {
        if (!this.thEls) return;

        const narrow = this.container.offsetWidth < 400;
        const veryNarrow = this.container.offsetWidth < 350;

        this.thEls.forEach((th, i) => {
            th.innerText = veryNarrow
                ? VERYSHORTDAYNAMES[i]
                : narrow
                    ? SHORTDAYNAMES[i]
                    : FULLDAYNAMES[i];
        });
    }

    updateTable() {
        const table = document.getElementById('Calendar');
        const tbody = table.querySelector('tbody');
        const cells = tbody.querySelectorAll('td');

        cells.forEach(cell => {
            if (cell.dataset.locked === 'bank') {
                cell.textContent = '';
                cell.className = '';
                cell.style.fontWeight = '';
                cell.style.position = '';
                delete cell.dataset.date;
            } else {
                cell.textContent = '';
                cell.className = '';
                cell.style.backgroundColor = '';
                cell.style.fontWeight = '';
                cell.style.position = '';
                delete cell.dataset.date;
                delete cell.dataset.locked;
            }
        });

        const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
        const daysInMonth = new Date(this.date.getFullYear(), this.date.getMonth() + 1, 0).getDate();
        const today = new Date();

        for (let day = 1; day <= daysInMonth; day++) {
            const cellIndex = firstDay + day - 1;
            const row = Math.floor(cellIndex / 7);
            const column = cellIndex % 7;
            const cell = tbody.querySelector(`td[data-week="${row}"][data-day="${column}"]`);

            if (!cell) continue;

            const cellDate = new Date(this.date.getFullYear(), this.date.getMonth(), day);
            cell.textContent = day;
            cell.dataset.date = cellDate.toISOString().split("T")[0];
            cell.style.textAlign = 'left';
            cell.style.verticalAlign = 'top';
            cell.style.fontSize = '0.85em';

            const isToday = cellDate.toDateString() === today.toDateString();
            const isPast = cellDate < today && !isToday;
            const dotsCount = this.dots.filter(dot => dot.date.toDateString() === cellDate.toDateString()).length;

            cell.addEventListener('click', () => {
                const dateStr = `${cellDate.getFullYear()}${String(cellDate.getMonth() + 1).padStart(2, '0')}${String(cellDate.getDate()).padStart(2, '0')}`;
                this.openDayModal(dateStr);
            });

            if (cell.dataset.locked !== 'bank') {
                this.updateCellBackground(cell, isToday, isPast, dotsCount);
            }

            const dotsForDate = this.dots.filter(dot => dot.date.toDateString() === cellDate.toDateString());
            dotsForDate.forEach(dot => this.addDot(cellDate, dot.colour));
        }

        this.highlightSelected(this.selectedCheckIn, this.selectedCheckOut);
    }

    async updateCellBackground(cell, isToday, isPast, dots, isBankHoliday = false) {
        if (isPast) {
            cell.style.backgroundColor = this.backgroundColours.PAST;
        } else if (isBankHoliday) {
            cell.style.backgroundColor = this.backgroundColours.BANKHOLIDAY;
        } else if (isToday) {
            cell.style.backgroundColor = this.backgroundColours.TODAY;
            cell.style.fontWeight = 'bold';
            cell.className = 'today';
        } else if (dots > 5) {
            cell.style.backgroundColor = this.backgroundColours.BOOKED;
        } else if (dots >= 4 && dots <= 5) {
            cell.style.backgroundColor = this.backgroundColours.BUSY;
        } else {
            cell.style.backgroundColor = '';
        }
    }

    highlightSelected(checkIn, checkOut) {
        this.container.querySelectorAll("td.selected").forEach(cell => {
            cell.classList.remove("selected");
        });

        if (!checkIn || !checkOut) return;

        const cells = this.container.querySelectorAll("td[data-date]");
        cells.forEach(cell => {
            const [year, month, day] = cell.getAttribute("data-date").split("-").map(Number);
            const cellDate = new Date(year, month - 1, day, 0, 0, 0, 0);

            if (cellDate >= checkIn && cellDate <= checkOut) {
                cell.classList.add("selected");
            }
        });
    }

    async fetchBankHolidays() {
        if (Object.keys(this.bankHolidays).length) {
            return this.bankHolidays;
        }

        try {
            const response = await fetch('https://www.gov.uk/bank-holidays.json');
            const data = await response.json();

            const addHolidays = (region) => {
                return data[region].events.reduce((acc, holiday) => {
                    const holidayDate = new Date(holiday.date);
                    const year = holidayDate.getFullYear();
                    const currentYear = new Date().getFullYear();

                    const holidayKey = year >= currentYear - 1 ? `${holiday.title} (${year})` : null;
                    if (holidayKey && !acc[holidayKey]) {
                        acc[holidayKey] = { date: holidayDate };
                    }

                    return acc;
                }, {});
            };

            const scotlandHolidays = addHolidays('scotland');
            const englandHolidays = addHolidays('england-and-wales');

            this.bankHolidays = { ...scotlandHolidays, ...englandHolidays };
            return this.bankHolidays;
        } catch (error) {
            console.error('Error fetching bank holidays:', error);
            return {};
        }
    }

    async bankHolidaysToTexts() {
        const bankHolidays = await this.fetchBankHolidays();
        if (!bankHolidays) return;

        for (const holiday in bankHolidays) {
            const holidayDate = bankHolidays[holiday].date;
            const dateKey = this.getDateKey(holidayDate);

            const holidayName = holiday.replace(/\s*\(\d{4}\)$/, '').trim();

            if (!this.texts[dateKey]) {
                this.texts[dateKey] = [];
            }

            if (!this.texts[dateKey].includes(holidayName)) {
                this.texts[dateKey].push(holidayName);
            }

            await this.updateCellForHoliday(holidayDate);
        }
    }

    async updateCellForHoliday(date) {
        const table = document.getElementById('Calendar');
        const tbody = table.querySelector('tbody');

        const sameYear = date.getFullYear() === this.date.getFullYear();
        const sameMonth = date.getMonth() === this.date.getMonth();

        if (!sameYear || !sameMonth) return;

        const day = date.getDate();
        const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
        const cellIndex = firstDay + day - 1;
        const row = Math.floor(cellIndex / 7);
        const column = cellIndex % 7;

        const cell = tbody.querySelector(`td[data-week="${row}"][data-day="${column}"]`);
        if (!cell) return;

        const isToday = date.toDateString() === new Date().toDateString();
        const isPast = date < new Date() && !isToday;
        const dots = this.dots.filter(d => d.date.toDateString() === date.toDateString()).length;

        await this.updateCellBackground(cell, isToday, isPast, dots, true);
        cell.dataset.locked = 'bank';
    }

    addDot(date, colour, petId = null) {
        const dotDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        if (!colour) {
            const usedColours = this.dots
                .filter(d => d.date.getTime() === dotDate.getTime())
                .map(d => d.colour);

            colour = Object.values(this.dotColours).find(c => !usedColours.includes(c));
        }

        if (!colour) return;
        if (!Object.values(this.dotColours).includes(colour)) return;

        if (!this.dots.some(d => d.date.getTime() === dotDate.getTime() && d.colour === colour)) {
            this.dots.push({ date: dotDate, colour });
        }

        if (dotDate.getMonth() !== this.date.getMonth() || dotDate.getFullYear() !== this.date.getFullYear()) {
            return;
        }

        const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
        const daysInMonth = new Date(this.date.getFullYear(), this.date.getMonth() + 1, 0).getDate();

        if (dotDate.getDate() < 1 || dotDate.getDate() > daysInMonth) return;

        const cellIndex = firstDay + dotDate.getDate() - 1;
        const row = Math.floor(cellIndex / 7);
        const column = cellIndex % 7;
        const table = document.getElementById('Calendar');
        const cell = table.querySelector(`td[data-week="${row}"][data-day="${column}"]`);

        if (!cell) return;

        const dotSize = 8;
        const padding = 4;
        const cellWidth = cell.clientWidth;
        const cellHeight = cell.clientHeight;
        const maxDotsPerRow = Math.floor(cellWidth / (dotSize + padding));
        const maxRows = Math.floor(cellHeight / (dotSize + padding));
        const maxDots = maxDotsPerRow * maxRows;

        const dotsInCell = cell.querySelectorAll('.dot');

        if (dotsInCell.length >= maxDots) return;

        const rowIndex = Math.floor(dotsInCell.length / maxDotsPerRow);
        const columnIndex = dotsInCell.length % maxDotsPerRow;

        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.style.width = `${dotSize}px`;
        dot.style.height = `${dotSize}px`;
        dot.style.backgroundColor = colour;
        dot.style.borderRadius = '50%';
        dot.style.position = 'absolute';
        dot.style.bottom = `${padding + rowIndex * (dotSize + padding)}px`;
        dot.style.left = `${padding + columnIndex * (dotSize + padding)}px`;
        cell.style.position = 'relative';

        if (petId) dot.id = petId;

        cell.appendChild(dot);

        const isToday = dotDate.toDateString() === new Date().toDateString();
        const isPast = dotDate < new Date() && !isToday;
        const totalDots = this.dots.filter(d => d.date.toDateString() === dotDate.toDateString()).length;

        const isLocked = cell.dataset.locked === 'na' || cell.dataset.locked === 'bank';

        if (totalDots >= 4) {
            delete cell.dataset.locked;
            this.updateCellBackground(cell, isToday, isPast, totalDots);
        } else if (!isLocked) {
            this.updateCellBackground(cell, isToday, isPast, totalDots);
        }

        if (petId) {
            dot.addEventListener('mouseenter', () => {
                const pet = this.allPets?.find(p => p.petId === petId);
                if (!pet) return;

                this.petTooltip.textContent = `${pet.name}, ${pet.breed}`;
                this.petTooltip.style.display = 'block';
            });

            dot.addEventListener('mousemove', e => {
                this.petTooltip.style.left = e.pageX + 10 + 'px';
                this.petTooltip.style.top = e.pageY + 10 + 'px';
            });

            dot.addEventListener('mouseleave', () => {
                this.petTooltip.style.display = 'none';
            });
        }
    }

    addLegend() {
        const legend = document.createElement('div');
        legend.className = 'calendar-legend';
        legend.innerHTML = `
        <div class="calendar-legend-row">
            <div><span class="legend-box selected"></span>Selected Day(s)</div>
            <div><span class="legend-box today"></span>Today</div>
            <div><span class="legend-box busy"></span>Busy</div>
            <div><span class="legend-box booked"></span>Completely Booked</div>
            <div><span class="legend-box bankholiday"></span>Bank Holiday</div>
            <div><span class="legend-box notavailable"></span>Not Available</div>
            </div>
        `;

        this.container.appendChild(legend);
    }

    getDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    addToTexts(date, text) {
        const dateKey = this.getDateKey(date);

        if (!this.texts[dateKey]) {
            this.texts[dateKey] = [];
        }

        this.texts[dateKey].push(text);
    }

    addTexts() {
        const table = document.getElementById('Calendar');
        const tbody = table.querySelector('tbody');
        const cells = tbody.querySelectorAll('td');

        cells.forEach(cell => {
            const dayString = cell.innerText.trim();
            if (!dayString) return;

            const day = parseInt(dayString, 10);
            const cellDate = new Date(this.date.getFullYear(), this.date.getMonth(), day);
            const dateKey = this.getDateKey(cellDate);

            const existingText = cell.querySelector('.texts');
            if (existingText) {
                existingText.remove();
            }

            if (this.texts[dateKey] && this.texts[dateKey].length > 0) {
                const textContainer = document.createElement('p');
                textContainer.className = 'texts';
                textContainer.style.margin = '5px 0 0 0';
                textContainer.style.fontSize = '0.75em';
                textContainer.innerHTML = this.texts[dateKey].join('<br>');
                cell.appendChild(textContainer);
            }
        });
    }

    async loadBookings() {
        if (this.abortController) this.abortController.abort();

        this.abortController = new AbortController();

        const signal = this.abortController.signal;
        const loadId = ++this.loadId;
        const toDay = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());

        try {
            const events = await this.getEvents(signal);
            this.events = events;
            window.h4pCalendarEvents = events;

            this.allPets = events.filter(ev => ev.petId && ev.petId !== "Unknown");

            if (loadId !== this.loadId) return;

            for (const ev of events) {
                if (!ev.petId || ev.petId === "Unknown") continue;

                const types = Array.isArray(ev.type) ? ev.type : [ev.type];
                if (!types.includes("Not available")) continue;

                const startDay = toDay(new Date(ev.start));
                const endDay = toDay(new Date(ev.end));

                for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
                    if (loadId !== this.loadId) return;
                    if (d.getMonth() !== this.date.getMonth()) continue;
                    if (d.getFullYear() !== this.date.getFullYear()) continue;

                    const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
                    const cellIndex = firstDay + d.getDate() - 1;
                    const row = Math.floor(cellIndex / 7);
                    const column = cellIndex % 7;
                    const table = document.getElementById('Calendar');
                    const tbody = table.querySelector('tbody');
                    const cell = tbody.querySelector(`td[data-week="${row}"][data-day="${column}"]`);

                    if (!cell) continue;

                    cell.style.backgroundColor = this.backgroundColours.NOTAVAILABLE;
                    cell.dataset.locked = 'na';
                }
            }

            const staysByPet = {};
            events
                .filter(ev => ev.petId && ev.petId !== "Unknown")
                .sort((a, b) => new Date(a.start) - new Date(b.start))
                .forEach(ev => {
                    const types = Array.isArray(ev.type) ? ev.type : [ev.type];
                    if (types.includes("Not available")) return;

                    const petId = ev.petId;
                    if (!staysByPet[petId]) staysByPet[petId] = { open: null, ranges: [] };

                    if (types.includes("Check-in")) {
                        staysByPet[petId].open = toDay(new Date(ev.start));
                        return;
                    }

                    if (!types.includes("Check-out")) return;
                    if (!staysByPet[petId].open) return;

                    const endDay = toDay(new Date(ev.end));
                    staysByPet[petId].ranges.push([staysByPet[petId].open, endDay]);
                    staysByPet[petId].open = null;
                });

            const allColours = Object.values(this.dotColours);
            const activePetIds = new Set(Object.keys(staysByPet));

            for (const petId in staysByPet) {
                let assignedColour = this.guestColourMap[petId];

                if (!assignedColour) {
                    const usedColours = Object.entries(this.guestColourMap)
                        .filter(([id]) => activePetIds.has(id))
                        .map(([, colour]) => colour);

                    const availableColours = allColours.filter(c => !usedColours.includes(c));
                    const unused = allColours.find(c => !this.colourHistory.includes(c));

                    assignedColour = availableColours[0] || unused || allColours[allColours.length - 1];
                    this.guestColourMap[petId] = assignedColour;
                }

                this.colourHistory = this.colourHistory.filter(c => c !== assignedColour);
                this.colourHistory.push(assignedColour);

                for (const [startDay, endDay] of staysByPet[petId].ranges) {
                    for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
                        if (loadId !== this.loadId) return;
                        this.addDot(new Date(d), assignedColour, petId);
                    }
                }
            }

            Object.keys(this.guestColourMap).forEach(petId => {
                if (!activePetIds.has(petId)) delete this.guestColourMap[petId];
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Fetch aborted');
            } else {
                console.error('Error loading bookings:', error);
            }
        }
    }

    changeMonth(offset) {
        this.date.setMonth(this.date.getMonth() + offset);
        this.render();
    }

    async openDayModal(dateStr) {
        if (document.getElementById("day-modal-overlay")) return;

        const overlay = document.createElement("div");
        overlay.id = "day-modal-overlay";
        overlay.style.position = "fixed";
        overlay.style.inset = "0";
        overlay.style.background = "rgba(0,0,0,0.5)";
        overlay.style.display = "flex";
        overlay.style.justifyContent = "center";
        overlay.style.alignItems = "center";
        overlay.style.zIndex = "1000";

        const modal = document.createElement("div");
        modal.id = "day-modal-shell";

        document.body.classList.add("no-scroll");

        window.guestColourMap = this.guestColourMap;
        window.colourHistory = this.colourHistory;

        let html = "";

        try {
            const resp = await fetch("./dayView.html");

            if (!resp.ok) throw new Error("Failed to load dayView.html");

            html = await resp.text();
        } catch (err) {
            console.error("❌ Error loading modal content:", err);
            html = `<div id="day-modal" class="modal"><div class="modal-content"><h2 id="day-title">Bookings</h2><ul id="pet-list"></ul></div></div>`;
        }

        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        const backbone = tmp.querySelector("#day-modal") || tmp.firstElementChild;

        if (backbone) {
            backbone.style.display = "block";
            modal.appendChild(backbone);
        } else {
            modal.innerHTML = html;
        }

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const content = modal.querySelector(".modal-content") || modal;
        let closeEl = content.querySelector(".close");

        if (!closeEl) {
            closeEl = document.createElement("span");
            closeEl.className = "close";
            closeEl.textContent = "❌";
            content.style.position = content.style.position || "relative";
            content.appendChild(closeEl);
        }

        const prevUrl = window.location.href;
        const prevState = history.state;

        const closeModal = () => {
            overlay.remove();
            document.body.classList.remove("no-scroll");

            try {
                history.replaceState(prevState, "", prevUrl);
            } catch { }

            document.removeEventListener("keydown", onEsc);
        };

        const onEsc = (e) => {
            if (e.key === "Escape") closeModal();
        };

        closeEl.addEventListener("click", closeModal);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeModal();
        });
        document.addEventListener("keydown", onEsc);

        try {
            const u = new URL(window.location.href);
            u.searchParams.set("d", dateStr);
            history.replaceState(prevState, "", u);
        } catch { }

        const runLoader = () => {
            if (typeof window.loadDayView === "function") {
                try {
                    window.loadDayView();
                } catch (e) {
                    console.error("loadDayView() error:", e);
                }
            } else {
                console.error("dayView.js loaded but loadDayView() not found.");
            }
        };

        if (typeof window.loadDayView === "function") {
            runLoader();
        } else {
            const script = document.createElement("script");
            script.type = "module";
            script.src = "./dayView.js";
            script.onload = runLoader;
            script.onerror = () => console.error("Failed to load dayView.js");
            document.body.appendChild(script);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const calendar = new Calendar('calendar-container');
});
