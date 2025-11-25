// Fetch and prepare towns
async function loadCoverage() {
    const res = await fetch('https://h4p.api.kittycrypto.gg/taxiCoverage.json', {
        headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const arr = await res.json();
    if (!Array.isArray(arr)) throw new Error('Coverage payload is not an array');

    const towns = new Set();
    for (const item of arr) {
        const t = item?.town?.trim();
        if (t) towns.add(t);
    }

    return Array.from(towns).sort((a, b) => a.localeCompare(b));
}

function populateSelect(selectEl, towns) {
    selectEl.innerHTML = '';
    for (const t of towns) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        selectEl.appendChild(opt);
    }
}

function showDropoffFields(dropoffGroup, dropoff) {
    dropoffGroup.style.display = '';
    dropoff.disabled = false;
}

function hideDropoffFields(dropoffGroup, dropoff) {
    dropoffGroup.style.display = 'none';
    dropoff.disabled = true;
}

function updateDropoffVisibility({ pickupEnabled, dropoffEnabled, different, dropoffGroup, dropoff }) {
    if (!pickupEnabled.checked || !dropoffEnabled.checked) {
        different.disabled = true;
        different.checked = false;
        hideDropoffFields(dropoffGroup, dropoff);
        return;
    }

    if (!dropoffEnabled.checked) {
        different.disabled = true;
        different.checked = false;
        hideDropoffFields(dropoffGroup, dropoff);
        return;
    }

    different.disabled = false;
    different.checked ? showDropoffFields(dropoffGroup, dropoff)
        : hideDropoffFields(dropoffGroup, dropoff);
}

function wireTaxiEvents(elems) {
    const handler = () => updateDropoffVisibility(elems);
    elems.dropoffEnabled.addEventListener('change', handler);
    elems.different.addEventListener('change', handler);
}

// Form setup
async function initTaxiForm() {
    const pickup = document.getElementById('pickupLocation');
    const dropoff = document.getElementById('dropoffLocation');
    const pickupEnabled = document.getElementById('pickupEnabled');
    const dropoffEnabled = document.getElementById('dropoffEnabled');
    const different = document.getElementById('sameLocation');
    const dropoffGroup = dropoff?.closest('.form-group');

    if (!pickup || !dropoff || !pickupEnabled || !dropoffEnabled || !different || !dropoffGroup) return;

    const towns = await loadCoverage();
    populateSelect(pickup, towns);
    populateSelect(dropoff, towns);

    const elems = { pickupEnabled, dropoffEnabled, different, dropoffGroup, dropoff };
    updateDropoffVisibility(elems);
    wireTaxiEvents(elems);

    const form = document.getElementById('taxi-form');
    if (form) {
        form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            try {
                const data = {
                    pickupTown: pickupEnabled.checked ? pickup.value : undefined,
                    dropoffTown: dropoffEnabled.checked
                        ? (different.checked ? dropoff.value : pickup.value)
                        : undefined,
                    isReturn: dropoffEnabled.checked
                };

                const query = new URLSearchParams();
                if (data.pickupTown) query.append('pickupTown', data.pickupTown);
                if (data.dropoffTown) query.append('dropoffTown', data.dropoffTown);
                query.append('isReturn', data.isReturn ? 'true' : 'false');

                const res = await fetch(`https://h4p.api.kittycrypto.gg/taxi?${query.toString()}`, {
                    headers: { Accept: 'application/json' }
                });

                if (!res.ok) throw new Error(`Taxi endpoint failed: ${res.status} ${res.statusText}`);

                const body = await res.json();
                const price = Number(body?.price);
                if (isNaN(price)) throw new Error('Taxi endpoint returned invalid price');

                console.log('[debug] Final taxi price = £' + price.toFixed(2));
                window.taxiPrice = price;

            } catch (err) {
                console.error('[debug] Price calculation failed:', err);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initTaxiForm().catch(err => console.error('Taxi form init failed:', err));
});