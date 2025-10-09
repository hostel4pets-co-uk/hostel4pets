window.md = new MobileDetect(window.navigator.userAgent);
if (window.md.mobile()) {
    document.querySelectorAll(".container").forEach(el => {
        el.classList.add("mobile");
    });
}

async function openChatPanel() {
    if (document.getElementById("chat-panel-shell")) return;

    const shell = document.createElement("div");
    shell.id = "chat-panel-shell";
    shell.style.position = "fixed";
    shell.style.bottom = "0";
    shell.style.right = "0";
    shell.style.width = "300px";
    shell.style.height = localStorage.getItem("chatSession") ? "450px" : "300px";
    shell.style.zIndex = "2000";
    shell.style.display = "flex";
    shell.style.flexDirection = "column";
    shell.style.overflow = "hidden";
    shell.style.background = "transparent";
    window.shell = shell;

    let html = "";
    try {
        // cache-bust while developing so you do not see a stale chat.html
        const resp = await fetch("./chat.html");
        if (!resp.ok) throw new Error("Failed to load chat.html");
        html = await resp.text();
    } catch (err) {
        console.error("❌ Error loading chat content:", err);
        html = `<div><p>Could not load chat.html</p></div>`;
    }

    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const backbone = tmp.querySelector(".chat-modal") || tmp.firstElementChild;
    if (backbone) {
        backbone.style.display = "flex";
        shell.appendChild(backbone);
    } else {
        shell.innerHTML = html;
    }

    document.body.appendChild(shell);
}

(async () => {
    await openChatPanel();
    const s = document.createElement("script");
    s.src = "./chat.js";
    s.onload = () => {
        if (window.ChatApp && !window.__chatApp) window.__chatApp = new ChatApp();
    };
    document.body.appendChild(s);
})();