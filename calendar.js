class Calendar {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.date = new Date(); // default current date

        // Check for ?m=YYYYMM in query string
        const params = new URLSearchParams(window.location.search);
        const m = params.get("m");
        if (m && /^\d{6}$/.test(m)) {
            const year = parseInt(m.slice(0, 4), 10);
            const month = parseInt(m.slice(4, 6), 10);
            if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                this.date = new Date(year, month - 1, 1);
            }
        }

        this.dotColours = Object.freeze({
            RED: 'red', GREEN: 'green', DARK_BLUE: '#00008b', YELLOW: '#d4a017',
            PURPLE: 'purple', ORANGE: 'orange', HOT_PINK: '#ff69b4', MAROON: 'maroon',
            GOLD: 'gold', DARK_GREEN: '#006400', MAGENTA: 'magenta', NAVY: 'navy',
            BROWN: '#8b4513', INDIGO: 'indigo', OLIVE: 'olive', CRIMSON: 'crimson',
            BLACK: 'black', DARK_ORANGE: '#ff8c00', CORAL: 'coral', GREY: 'grey',
        });

        this.backgroundColours = Object.freeze({
            PAST: '#d3d3d3', TODAY: '#add8e6', BUSY: '#ffebcd', BOOKED: '#ffc0cb',
            BANKHOLIDAY: '#e6ccff', NOT_AVAILABLE: '#a9a9a9'
        });

        this.dots = [];
        this.texts = {};
        this.bankHolidays = {};

        this.render();
    }

    // Render the entire calendar UI
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

    // Create the header with navigation buttons and a month picker
    createHeader() {
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '10px';

        const backButton = document.createElement('button');
        backButton.innerText = '<';
        backButton.addEventListener('click', () => this.changeMonth(-1));

        const forwardButton = document.createElement('button');
        forwardButton.innerText = '>';
        forwardButton.addEventListener('click', () => this.changeMonth(1));

        // Always visible month picker
        const monthPicker = document.createElement('input');
        monthPicker.type = 'month';
        monthPicker.value = `${this.date.getFullYear()}-${String(this.date.getMonth() + 1).padStart(2, '0')}`;
        monthPicker.style.margin = '0 10px';
        monthPicker.addEventListener('change', () => {
            const [year, month] = monthPicker.value.split('-').map(Number);
            this.date.setFullYear(year);
            this.date.setMonth(month - 1);

            // Update query string with ?m=YYYYMM
            const newM = `${year}${String(month).padStart(2, '0')}`;
            const url = new URL(window.location.href);
            url.searchParams.set("m", newM);
            window.history.replaceState({}, "", url); // Update URL without reload

            this.render(); // Re-render the calendar
        });


        header.appendChild(backButton);
        header.appendChild(monthPicker);
        header.appendChild(forwardButton);

        this.container.appendChild(header);
    }

    // Create the calendar table
    createTable() {
        const table = document.createElement('table');
        table.id = 'Calendar';
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';

        // Create table header for days of the week
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (const day of daysOfWeek) {
            const th = document.createElement('th');
            th.innerText = day;
            th.style.border = '1px solid #ddd';
            th.style.padding = '8px';
            th.style.textAlign = 'center';
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create table body for the calendar dates
        const tbody = document.createElement('tbody');

        // Dynamically calculate the number of weeks (rows)
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

        // Append rows to tbody
        rows.forEach(row => tbody.appendChild(row));

        table.appendChild(tbody);
        this.container.appendChild(table);
    }

    // Update the calendar table with the current month
    updateTable() {
        const table = document.getElementById('Calendar');
        const tbody = table.querySelector('tbody');
        const cells = tbody.querySelectorAll('td');

        cells.forEach(cell => {
            const preservedBg = cell.style.backgroundColor;
            cell.innerText = '';
            cell.className = '';
            cell.style.backgroundColor = preservedBg;
            cell.style.fontWeight = '';
            cell.style.position = '';
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

            cell.innerText = day;
            cell.style.textAlign = 'left';
            cell.style.verticalAlign = 'top';
            cell.style.fontSize = '0.85em';

            const cellDate = new Date(this.date.getFullYear(), this.date.getMonth(), day);
            const isToday = cellDate.toDateString() === today.toDateString();
            const isPast = cellDate < today && !isToday;
            const dotsCount = this.dots.filter(dot => dot.date.toDateString() === cellDate.toDateString()).length;

            if (!preservedBg) {
                this.updateCellBackground(cell, isToday, isPast, dotsCount);
            }

            // Re-add dots for this date
            const dotsForDate = this.dots.filter(dot => dot.date.toDateString() === cellDate.toDateString());
            dotsForDate.forEach(dot => this.addDot(cellDate, dot.colour));
        }
    }

    // Helper to update background colour of a single cell
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
            cell.style.backgroundColor = ''; // Default
        }
    }


    // Fetch and return bank holidays for Scotland, England, and Wales
    async fetchBankHolidays() {
        // If we already have them, do not refetch
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

                    // Discard holidays more than one year ago
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

    // Convert bank holidays into texts, but check for duplicates
    // Updated bankHolidaysToTexts to strip year from holiday titles using regex
    async bankHolidaysToTexts() {
        const bankHolidays = await this.fetchBankHolidays();
        if (!bankHolidays) return;

        for (const holiday in bankHolidays) {
            const holidayDate = bankHolidays[holiday].date;
            const dateKey = this.getDateKey(holidayDate);

            // Remove year from holiday title using regex
            const holidayName = holiday.replace(/\s*\(\d{4}\)$/, '').trim();

            // Only add holiday text if it's not already present
            if (!this.texts[dateKey]) {
                this.texts[dateKey] = [];
            }
            if (!this.texts[dateKey].includes(holidayName)) {
                this.texts[dateKey].push(holidayName);
            }

            // Restore the call that highlights the cell for the current month
            await this.updateCellForHoliday(holidayDate);
        }
    }

    async updateCellForHoliday(date) {
        const table = document.getElementById('Calendar');
        const tbody = table.querySelector('tbody');

        const day = date.getDate();
        const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();

        // Only update cells in the current month
        if (date.getFullYear() === this.date.getFullYear() && date.getMonth() === this.date.getMonth()) {
            const cellIndex = firstDay + day - 1;
            const row = Math.floor(cellIndex / 7);
            const column = cellIndex % 7;
            const cell = tbody.querySelector(`td[data-week="${row}"][data-day="${column}"]`);

            if (cell) {
                const isToday = date.toDateString() === new Date().toDateString();
                const isPast = date < new Date() && !isToday;
                const dots = this.dots.filter(d => d.date.toDateString() === date.toDateString()).length;

                // Call the updated updateCellBackground method
                await this.updateCellBackground(cell, isToday, isPast, dots, true);
            }
        }
    }

    // Add a coloured dot to a date
    addDot(date, colour) {
        // Normalise the date to ensure consistent format (strip time)
        const dotDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        // Ensure the colour is provided or determine an available colour
        if (!colour) {
            const usedColours = this.dots
                .filter(d => d.date.getTime() === dotDate.getTime())
                .map(d => d.colour);

            colour = Object.values(this.dotColours).find(c => !usedColours.includes(c));
            if (!colour) return; // No available colours
        } else if (!Object.values(this.dotColours).includes(colour)) {
            return; // Ignore invalid colours
        }

        // Add the dot to the dots array (prevent duplicates)
        if (!this.dots.some(d => d.date.getTime() === dotDate.getTime() && d.colour === colour)) {
            this.dots.push({ date: dotDate, colour });
        }

        // Only render the dot if the date belongs to the currently displayed month
        if (dotDate.getMonth() !== this.date.getMonth() || dotDate.getFullYear() !== this.date.getFullYear()) {
            return;
        }

        // Render dot in the current month's table
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
        if (dotsInCell.length >= maxDots) return; // Prevent adding dots beyond available space

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
        cell.appendChild(dot);

        // Update the cell's background dynamically
        const isToday = dotDate.toDateString() === new Date().toDateString();
        const isPast = dotDate < new Date() && !isToday;
        const totalDots = this.dots.filter(d => d.date.toDateString() === dotDate.toDateString()).length;
        this.updateCellBackground(cell, isToday, isPast, totalDots);
    }

    // Add a legend to the calendar
    addLegend() {
        const legend = document.createElement('div');
        legend.style.marginTop = '20px';
        legend.innerHTML = `
        <div style="display: flex; gap: 15px; align-items: center;">
            <div>
                <span style="display: inline-block; width: 20px; height: 20px;
                background-color: ${this.backgroundColours.PAST}; margin-right: 5px;"></span>Past Day
            </div>
            <div>
                <span style="display: inline-block; width: 20px; height: 20px;
                background-color: ${this.backgroundColours.TODAY}; margin-right: 5px;"></span>Today
            </div>
            <div>
                <span style="display: inline-block; width: 20px; height: 20px;
                background-color: ${this.backgroundColours.BUSY}; margin-right: 5px;"></span>Busy
            </div>
            <div>
                <span style="display: inline-block; width: 20px; height: 20px;
                background-color: ${this.backgroundColours.BOOKED}; margin-right: 5px;"></span>Completely Booked
            </div>
            <div>
                <span style="display: inline-block; width: 20px; height: 20px;
                background-color: ${this.backgroundColours.BANKHOLIDAY}; margin-right: 5px;"></span>Bank Holiday
            </div>
            <div>
                <span style="display: inline-block; width: 20px; height: 20px;
                background-color: ${this.backgroundColours.NOT_AVAILABLE}; margin-right: 5px;"></span>Not Available
            </div>
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

    // Simplified addToTexts
    addToTexts(date, text) {
        const dateKey = this.getDateKey(date);
        if (!this.texts[dateKey]) {
            this.texts[dateKey] = [];
        }
        this.texts[dateKey].push(text);
    }


    // In addTexts, also use getDateKey
    addTexts() {
        const table = document.getElementById('Calendar');
        const tbody = table.querySelector('tbody');
        const cells = tbody.querySelectorAll('td');

        cells.forEach(cell => {
            const dayString = cell.innerText.trim();
            if (!dayString) return; // Skip empty cells

            const day = parseInt(dayString, 10);
            const cellDate = new Date(this.date.getFullYear(), this.date.getMonth(), day);
            const dateKey = this.getDateKey(cellDate);

            // Remove old text
            const existingText = cell.querySelector('.texts');
            if (existingText) {
                existingText.remove();
            }

            // Now add text from this.texts if present
            if (this.texts[dateKey] && this.texts[dateKey].length > 0) {
                const textContainer = document.createElement('p');
                textContainer.className = 'texts';
                textContainer.style.margin = '5px 0 0 0';
                textContainer.style.fontSize = '0.75em'; // Smaller font size
                textContainer.innerHTML = this.texts[dateKey].join('<br>');
                cell.appendChild(textContainer);
            }
        });
    }

    // Load bookings from bookings.json and add dots to the calendar
    async loadBookings() {
        try {
            const response = await fetch('https://kittycrypto.ddns.net:5493/calendar.json');
            if (!response.ok) throw new Error('Failed to fetch calendar.json');

            /** @type {Array<{ type: string[], petId: string, start: string, end: string }>} */
            const events = await response.json();

            const petStays = {};

            for (const ev of events) {
                if (!ev.petId || ev.petId === "Unknown") continue;

                const types = Array.isArray(ev.type) ? ev.type : [ev.type];

                if (types.includes("Not available")) {
                    const start = new Date(ev.start);
                    const end = new Date(ev.end);

                    // Fill entire range with grey background
                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        const table = document.getElementById('Calendar');
                        const tbody = table.querySelector('tbody');

                        const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
                        if (d.getMonth() === this.date.getMonth() && d.getFullYear() === this.date.getFullYear()) {
                            const cellIndex = firstDay + d.getDate() - 1;
                            const row = Math.floor(cellIndex / 7);
                            const column = cellIndex % 7;
                            const cell = tbody.querySelector(`td[data-week="${row}"][data-day="${column}"]`);
                            if (cell) {
                                cell.style.backgroundColor = this.backgroundColours.NOT_AVAILABLE;
                            }
                        }
                    }
                    continue;
                }

                // Normal events
                if (types.includes("Check-in")) {
                    if (!petStays[ev.petId]) petStays[ev.petId] = {};
                    petStays[ev.petId].checkIn = new Date(ev.start);
                }

                if (types.includes("Check-out")) {
                    if (!petStays[ev.petId]) petStays[ev.petId] = {};
                    petStays[ev.petId].checkOut = new Date(ev.end);
                }
            }

            // Render check-in / check-out events as before
            for (const petId in petStays) {
                const stay = petStays[petId];
                if (!stay.checkIn || !stay.checkOut) continue;

                for (let d = new Date(stay.checkIn); d <= stay.checkOut; d.setDate(d.getDate() + 1)) {
                    this.addDot(new Date(d));
                }
            }
        } catch (error) {
            console.error('Error loading bookings:', error);
        }
    }

    // Change the current month
    changeMonth(offset) {
        this.date.setMonth(this.date.getMonth() + offset);
        this.render();
    }
}

// Usage
document.addEventListener('DOMContentLoaded', () => {
    const calendar = new Calendar('calendar-container');
});
