class Calendar {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.date = new Date();

        this.dotColours = Object.freeze({
            RED: 'red', GREEN: 'green', DARK_BLUE: '#00008b', YELLOW: '#d4a017',
            PURPLE: 'purple', ORANGE: 'orange', HOT_PINK: '#ff69b4', MAROON: 'maroon',
            GOLD: 'gold', DARK_GREEN: '#006400', MAGENTA: 'magenta', NAVY: 'navy',
            BROWN: '#8b4513', INDIGO: 'indigo', OLIVE: 'olive', CRIMSON: 'crimson',
            BLACK: 'black', DARK_ORANGE: '#ff8c00', CORAL: 'coral', GREY: 'grey',
        });

        this.backgroundColours = Object.freeze({
            PAST: '#d3d3d3',
            TODAY: '#add8e6',
            BUSY: '#ffebcd',
            BOOKED: '#ffc0cb',
            BANKHOLIDAY: '#e6ccff',
            NOT_AVAILABLE: '#a9a9a9'
        });

        this.dots = [];
        this.texts = {};
        this.bankHolidays = {};

        this.render();
    }

    // ...

    async loadBookings() {
        try {
            const response = await fetch('https://kittycrypto.ddns.net:5493/calendar.json');
            if (!response.ok) throw new Error('Failed to fetch calendar.json');

            /** @type {Array<{ type: string[], petId: string, start: string, end: string }>} */
            const events = await response.json();

            const petStays = {};

            for (const ev of events) {
                const types = Array.isArray(ev.type) ? ev.type : [ev.type];

                // Handle Not available events
                if (types.includes("Not available")) {
                    const start = new Date(ev.start);
                    const end = new Date(ev.end);
                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        const dotDate = new Date(d);
                        this.highlightNotAvailable(dotDate);
                    }
                    continue; // skip further pet processing
                }

                if (!ev.petId || ev.petId === "Unknown") continue;

                if (types.includes("Check-in")) {
                    if (!petStays[ev.petId]) petStays[ev.petId] = {};
                    petStays[ev.petId].checkIn = new Date(ev.start);
                }

                if (types.includes("Check-out")) {
                    if (!petStays[ev.petId]) petStays[ev.petId] = {};
                    petStays[ev.petId].checkOut = new Date(ev.end);
                }
            }

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

    highlightNotAvailable(date) {
        if (date.getMonth() !== this.date.getMonth() || date.getFullYear() !== this.date.getFullYear()) {
            return;
        }
        const firstDay = new Date(this.date.getFullYear(), this.date.getMonth(), 1).getDay();
        const cellIndex = firstDay + date.getDate() - 1;
        const row = Math.floor(cellIndex / 7);
        const column = cellIndex % 7;
        const table = document.getElementById('Calendar');
        const cell = table.querySelector(`td[data-week="${row}"][data-day="${column}"]`);
        if (cell) {
            cell.style.backgroundColor = this.backgroundColours.NOT_AVAILABLE;
        }
    }

    addLegend() {
        const legend = document.createElement('div');
        legend.style.marginTop = '20px';
        legend.innerHTML = `
        <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
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
}
