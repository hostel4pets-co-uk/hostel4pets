document.addEventListener('DOMContentLoaded', initialise);

async function initialise() {
    const modal = document.getElementById('taxi-modal');
    if (!modal) return;

    const pickupSelect = modal.querySelector('#pickupLocation');
    const dropoffSelect = modal.querySelector('#dropoffLocation');
    const sameLocation = modal.querySelector('#sameLocation');
    const dropoffEnabled = modal.querySelector('#dropoffEnabled');
    const dropoffLabel = modal.querySelector('label[for="dropoffLocation"]');

    await loadLocations(pickupSelect, dropoffSelect);
    wireEvents();
    applyVisibility();

    async function loadLocations(pickup, dropoff) {
        const res = await fetch('https://api.kittycrypto.gg:5493/taxiCoverage.json');
        const json = await res.json();

        const locations = Object.keys(json);

        const fill = (select, list) => {
            select.innerHTML = '';
            for (const loc of list) {
                const opt = document.createElement('option');
                opt.value = opt.textContent = loc;
                select.appendChild(opt);
            }
        };

        fill(pickup, locations);
        fill(dropoff, locations);
    }

    function wireEvents() {
        sameLocation.addEventListener('change', applyVisibility);
        dropoffEnabled.addEventListener('change', applyVisibility);
    }

    function applyVisibility() {
        if (!dropoffEnabled.checked) {
            sameLocation.checked = false;
            sameLocation.disabled = true;
        }

        if (dropoffEnabled.checked) {
            sameLocation.disabled = false;
        }

        const different = dropoffEnabled.checked && !sameLocation.checked;

        dropoffSelect.disabled = !different;
        dropoffLabel.style.display = different ? 'block' : 'none';
        dropoffSelect.style.display = different ? 'block' : 'none';
    }
}