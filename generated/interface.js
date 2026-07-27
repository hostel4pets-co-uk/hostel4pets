import { ChatApp } from "./chat.js";
const currencyPattern = /£\s*([0-9]+(?:\.[0-9]{1,2})?)/;
const taxiSectionPattern = /\n?PET TAXI\n• Journey estimate: £[0-9]+(?:\.[0-9]{2})?\n?/;
function parseCurrency(value) {
    const match = currencyPattern.exec(value);
    if (!match?.[1])
        return null;
    const parsed = Number.parseFloat(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
}
function formatCurrency(value) {
    return `£${value.toFixed(2)}`;
}
function setFooterYear() {
    const currentYear = String(new Date().getFullYear());
    document.querySelectorAll("[data-current-year]").forEach(element => {
        element.textContent = currentYear;
    });
}
function fitBreakdown(textarea) {
    textarea.style.blockSize = "auto";
    textarea.style.blockSize = `${textarea.scrollHeight + 2}px`;
}
function insertTaxiSection(breakdown, taxiPrice) {
    const clean = breakdown.replace(taxiSectionPattern, "\n");
    const taxiSection = `\nPET TAXI\n• Journey estimate: ${formatCurrency(taxiPrice)}\n`;
    const totalMarker = "\nTOTAL\n";
    const totalIndex = clean.indexOf(totalMarker);
    return totalIndex === -1
        ? `${clean.trimEnd()}${taxiSection}`
        : `${clean.slice(0, totalIndex)}${taxiSection}${clean.slice(totalIndex)}`;
}
function initialiseEstimatePresentation() {
    const calculateButton = document.getElementById("calculateButton");
    const totalInput = document.getElementById("totalPrice");
    const depositInput = document.getElementById("deposit");
    const breakdown = document.getElementById("priceBreakdown");
    if (!(calculateButton instanceof HTMLButtonElement)
        || !(totalInput instanceof HTMLInputElement)
        || !(depositInput instanceof HTMLInputElement)
        || !(breakdown instanceof HTMLTextAreaElement))
        return;
    const state = {
        baseTotal: parseCurrency(totalInput.value),
        baseBreakdown: breakdown.value,
        taxiPrice: typeof window.taxiPrice === "number" ? window.taxiPrice : null
    };
    const render = () => {
        if (state.baseTotal === null) {
            fitBreakdown(breakdown);
            return;
        }
        const taxiPrice = state.taxiPrice ?? 0;
        const total = state.baseTotal + taxiPrice;
        const deposit = total * 0.25;
        totalInput.value = formatCurrency(total);
        depositInput.value = formatCurrency(deposit);
        let content = state.baseBreakdown;
        if (state.taxiPrice !== null)
            content = insertTaxiSection(content, state.taxiPrice);
        content = content
            .replace(/• Amount due in total: £[0-9]+(?:\.[0-9]{2})?/, `• Amount due in total: ${formatCurrency(total)}`)
            .replace(/• Pay now \(25% of total\): £[0-9]+(?:\.[0-9]{2})?/, `• Pay now (25% of total): ${formatCurrency(deposit)}`);
        breakdown.value = content;
        fitBreakdown(breakdown);
    };
    const captureBookingResult = () => {
        const baseTotal = parseCurrency(totalInput.value);
        if (baseTotal !== null)
            state.baseTotal = baseTotal;
        state.baseBreakdown = breakdown.value.replace(taxiSectionPattern, "\n");
        render();
    };
    calculateButton.addEventListener("click", () => requestAnimationFrame(captureBookingResult));
    breakdown.addEventListener("input", () => fitBreakdown(breakdown));
    window.addEventListener("resize", () => fitBreakdown(breakdown));
    fitBreakdown(breakdown);
    const taxiForm = document.getElementById("taxi-form");
    const taxiResult = document.getElementById("taxi-result");
    const taxiSummaryStatus = document.getElementById("taxi-summary-status");
    if (!(taxiForm instanceof HTMLFormElement))
        return;
    taxiForm.addEventListener("submit", () => {
        delete window.taxiPrice;
        if (taxiResult)
            taxiResult.textContent = "Calculating taxi estimate…";
        const started = performance.now();
        const timer = window.setInterval(() => {
            const price = window.taxiPrice;
            if (typeof price === "number" && Number.isFinite(price)) {
                window.clearInterval(timer);
                state.taxiPrice = price;
                if (taxiResult)
                    taxiResult.textContent = `${formatCurrency(price)} added to the stay estimate.`;
                if (taxiSummaryStatus)
                    taxiSummaryStatus.textContent = `${formatCurrency(price)} added`;
                render();
                return;
            }
            if (performance.now() - started > 15_000) {
                window.clearInterval(timer);
                if (taxiResult)
                    taxiResult.textContent = "The taxi estimate could not be loaded. Please try again.";
            }
        }, 120);
    }, { capture: true });
}
function initialiseTaxiFlow() {
    const section = document.getElementById("pet-taxi");
    if (!(section instanceof HTMLDetailsElement))
        return;
    const openSection = () => {
        section.open = true;
        requestAnimationFrame(() => section.scrollIntoView({ behavior: "smooth", block: "center" }));
    };
    document.querySelectorAll("[data-taxi-open]").forEach(control => {
        control.addEventListener("click", event => {
            event.preventDefault();
            openSection();
        });
    });
    if (window.location.hash === "#pet-taxi")
        openSection();
}
function initialiseStandaloneChat() {
    const shell = document.querySelector("#chat-panel-shell.standalone-chat-shell");
    if (!shell || window.chatApp)
        return;
    window.ChatApp = ChatApp;
    window.chatApp = new ChatApp();
}
function initialiseInterface() {
    setFooterYear();
    initialiseEstimatePresentation();
    initialiseTaxiFlow();
    initialiseStandaloneChat();
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseInterface, { once: true });
}
else {
    initialiseInterface();
}
export {};
//# sourceMappingURL=interface.js.map