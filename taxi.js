async function loadCoverage() {
    const res = await fetch('https://api.kittycrypto.gg:5493/taxiCoverage.json', {
        headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const arr = await res.json();
    if (!Array.isArray(arr)) throw new Error('Coverage payload is not an array');

    const towns = new Set();
    for (const item of arr) {
        const t = item && typeof item.town === 'string' ? item.town.trim() : '';
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


function updateDropoffVisibility({ dropoffEnabled, different, dropoffGroup, dropoff }) {

    if (!dropoffEnabled.checked) {
        different.disabled = true;
        different.checked = false;    // false = hidden
        hideDropoffFields(dropoffGroup, dropoff);
        return;
    }
    different.disabled = false;

    if (different.checked) {
        showDropoffFields(dropoffGroup, dropoff);
    } else {
        hideDropoffFields(dropoffGroup, dropoff);
    }
}

function wireTaxiEvents(elems) {
    const handler = () => updateDropoffVisibility(elems);
    elems.dropoffEnabled.addEventListener('change', handler);
    elems.different.addEventListener('change', handler);
}

// Single entry point, called at file load
async function initTaxiForm() {
    const pickup = document.getElementById('pickupLocation');
    const dropoff = document.getElementById('dropoffLocation');
    const dropoffEnabled = document.getElementById('dropoffEnabled');
    const different = document.getElementById('sameLocation'); // checked = hide
    const dropoffGroup = dropoff ? dropoff.closest('.form-group') : null;

    if (!pickup || !dropoff || !dropoffEnabled || !different || !dropoffGroup) return;

    const towns = await loadCoverage();
    populateSelect(pickup, towns);
    populateSelect(dropoff, towns);

    const elems = { dropoffEnabled, different, dropoffGroup, dropoff };
    updateDropoffVisibility(elems);
    wireTaxiEvents(elems);
}

document.addEventListener('DOMContentLoaded', () => {
    initTaxiForm().catch(err => console.error('Taxi form init failed:', err));
});