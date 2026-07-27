import { ChatApp } from "./chat.js";
function arrangeLayout() {
    const wrapper = document.querySelector(".flex-wrapper");
    if (!wrapper)
        return;
    if (window.innerWidth >= 900) {
        wrapper.style.flexDirection = "row";
        wrapper.style.alignItems = "flex-start";
    }
    else {
        wrapper.style.flexDirection = "column";
        wrapper.style.alignItems = "stretch";
    }
}
function applyMobileLayout() {
    window.md = new MobileDetect(window.navigator.userAgent);
    if (!window.md.mobile())
        return;
    document.querySelectorAll(".container").forEach(element => element.classList.add("mobile"));
}
async function openChatPanel() {
    if (document.getElementById("chat-panel-shell"))
        return;
    const shell = document.createElement("div");
    shell.id = "chat-panel-shell";
    Object.assign(shell.style, {
        position: "fixed",
        bottom: "0",
        right: "0",
        width: "300px",
        height: localStorage.getItem("chatSession") ? "450px" : "300px",
        zIndex: "2000",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "transparent"
    });
    window.shell = shell;
    let html = "";
    try {
        const response = await fetch("./chat.html");
        if (!response.ok)
            throw new Error("Failed to load chat.html");
        html = await response.text();
    }
    catch {
        console.error("Error loading chat content");
        html = "<div><p>Could not load chat.html</p></div>";
    }
    const temporary = document.createElement("div");
    temporary.innerHTML = html;
    const backbone = temporary.querySelector(".chat-modal") ?? temporary.firstElementChild;
    if (backbone) {
        backbone.style.display = "flex";
        shell.appendChild(backbone);
    }
    else {
        shell.innerHTML = html;
    }
    document.body.appendChild(shell);
    window.ChatApp = ChatApp;
    if (!window.chatApp)
        window.chatApp = new ChatApp();
}
async function initialise() {
    applyMobileLayout();
    arrangeLayout();
    window.addEventListener("resize", arrangeLayout);
    await openChatPanel();
}
document.addEventListener("DOMContentLoaded", () => {
    initialise().catch(() => console.error("Page initialisation failed"));
});
//# sourceMappingURL=main.js.map