document.addEventListener('DOMContentLoaded', () => {
    const pickupSelect = document.getElementById('pickupLocation');
    const dropoffSelect = document.getElementById('dropoffLocation');
    const dropoffEnabled = document.getElementById('dropoffEnabled');
    const sameLocation = document.getElementById('sameLocation');

    if (!pickupSelect || !dropoffSelect || !dropoffEnabled || !sameLocation) {
        return;
    }

    const dropoffGroup = dropoffSelect.parentElement;

    const setDropoffFieldsVisible = (visible) => {
        if (!dropoffGroup) {
            return;
        }

        dropoffGroup.style.display = visible ? '' : 'none';
        dropoffSelect.disabled = !visible;
    };

    const syncDifferentLocationState = () => {
        if (!dropoffEnabled.checked) {
            sameLocation.disabled = true;
            sameLocation.checked = true;   // checked => fields hidden
            setDropoffFieldsVisible(false);
            return;
        }

        sameLocation.disabled = false;

        // when "different location" checkbox is checked, hide fields
        const shouldShowFields = !sameLocation.checked;
        setDropoffFieldsVisible(shouldShowFields);
    };

    const populateSelect = (selectEl, towns) => {
        selectEl.innerHTML = '';
        towns.forEach((town) => {
            const opt = document.createElement('option');
            opt.value = town;
            opt.textContent = town;
            selectEl.appendChild(opt);
        });
    };

    const loadCoverage = async () => {
        try {
            const res = await fetch('https://api.kittycrypto.gg:5493/taxiCoverage.json', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) {
                console.error('Failed to fetch taxi coverage', res.status, res.statusText);
                return;
            }

            const data = await res.json();

            if (!Array.isArray(data)) {
                console.error('Unexpected coverage payload, expected array');
                return;
            }

            const townsSet = new Set();

            data.forEach((item) => {
                if (!item || typeof item.town !== 'string') {
                    return;
                }
                const trimmed = item.town.trim();
                if (!trimmed) {
                    return;
                }
                townsSet.add(trimmed);
            });

            const towns = Array.from(townsSet).sort((a, b) => a.localeCompare(b));

            if (towns.length === 0) {
                console.warn('No towns found in coverage payload');
                return;
            }

            populateSelect(pickupSelect, towns);
            populateSelect(dropoffSelect, towns);
        } catch (err) {
            console.error('Error loading taxi coverage', err);
        }
    };

    dropoffEnabled.addEventListener('change', syncDifferentLocationState);
    sameLocation.addEventListener('change', syncDifferentLocationState);

    // initial state: respect current checkboxes
    syncDifferentLocationState();
    loadCoverage();
});