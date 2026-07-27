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
function setTaxiPanelState(panel, expanded) {
    panel.classList.toggle("is-collapsed", !expanded);
    panel.classList.remove("is-hidden");
    const minimise = panel.querySelector("[data-taxi-minimise]");
    if (minimise) {
        minimise.setAttribute("aria-expanded", String(expanded));
        minimise.setAttribute("aria-label", expanded ? "Minimise pet taxi" : "Open pet taxi");
        minimise.textContent = expanded ? "−" : "+";
    }
    if (expanded) {
        const chatModal = document.querySelector("#chat-panel-shell .chat-modal:not(.collapsed)");
        chatModal?.querySelector("#collapse-btn")?.click();
        requestAnimationFrame(() => panel.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
}
function initialiseTaxiPanel() {
    const panel = document.getElementById("taxi-panel-shell");
    if (!panel)
        return;
    document.querySelectorAll("[data-taxi-open]").forEach(control => {
        control.addEventListener("click", event => {
            event.preventDefault();
            setTaxiPanelState(panel, true);
        });
    });
    panel.querySelector(".taxi-panel__header")?.addEventListener("click", event => {
        if (event.target.closest("button"))
            return;
        setTaxiPanelState(panel, true);
    });
    panel.querySelector("[data-taxi-minimise]")?.addEventListener("click", () => {
        setTaxiPanelState(panel, panel.classList.contains("is-collapsed"));
    });
    panel.querySelector("[data-taxi-close]")?.addEventListener("click", () => {
        panel.classList.add("is-hidden");
    });
    if (window.location.hash === "#pet-taxi")
        setTaxiPanelState(panel, true);
}
function syncChatSessionUi(modal) {
    const shell = modal.closest("#chat-panel-shell");
    const submit = modal.querySelector("#submit-button");
    const nickname = modal.querySelector("#nickname");
    const send = modal.querySelector("#send-button");
    const hasSession = Boolean(localStorage.getItem("chatSession"));
    shell?.classList.toggle("has-session", hasSession);
    if (!hasSession)
        return;
    if (submit)
        submit.hidden = true;
    if (nickname)
        nickname.hidden = true;
    if (send)
        send.hidden = false;
}
function bindChatPresentation(modal) {
    if (modal.dataset.presentationBound === "true")
        return;
    modal.dataset.presentationBound = "true";
    const header = modal.querySelector(".chat-header");
    const collapse = modal.querySelector("#collapse-btn");
    if (!header || !collapse)
        return;
    header.addEventListener("click", event => {
        if (event.target.closest("#chat-controls"))
            return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (modal.classList.contains("collapsed")) {
            document.getElementById("taxi-panel-shell")?.classList.add("is-collapsed");
            collapse.click();
        }
        requestAnimationFrame(() => modal.scrollIntoView({ behavior: "smooth", block: "start" }));
    }, { capture: true });
    const observer = new MutationObserver(() => syncChatSessionUi(modal));
    observer.observe(modal, {
        attributes: true,
        subtree: true,
        attributeFilter: ["class", "hidden", "style"]
    });
    syncChatSessionUi(modal);
}
function initialiseChatPresentation() {
    const bindAvailable = () => {
        const modals = document.querySelectorAll(".chat-modal");
        modals.forEach(bindChatPresentation);
        const standalone = document.querySelector(".standalone-chat-shell .chat-modal");
        if (standalone && !window.chatApp) {
            window.ChatApp = ChatApp;
            window.chatApp = new ChatApp();
        }
    };
    bindAvailable();
    const observer = new MutationObserver(bindAvailable);
    observer.observe(document.body, { childList: true, subtree: true });
}
function initialiseInterface() {
    setFooterYear();
    initialiseEstimatePresentation();
    initialiseTaxiPanel();
    initialiseChatPresentation();
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiseInterface, { once: true });
}
else {
    initialiseInterface();
}
export {};
//# sourceMappingURL=interface.js.map