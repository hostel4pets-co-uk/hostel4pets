(function initMobileDetect() {
    if (typeof window.MobileDetect !== "undefined") {
        window.md = new window.MobileDetect(window.navigator.userAgent);
        return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mobile-detect@1.4.5/mobile-detect.min.js";
    script.async = true;
    script.onload = () => {
        window.md = new window.MobileDetect(window.navigator.userAgent);
    };
    document.head.appendChild(script);
})();

class ChatApp {
    constructor() {
        this.chatroomEl = document.getElementById("chatroom");
        this.messageEl = document.getElementById("message");
        this.sendBtn = document.getElementById("send-button");
        this.submitBtn = document.getElementById("submit-button");
        this.nicknameEl = document.getElementById("nickname");
        this.isMobile = !!(window.md && (window.md.mobile() || window.md.tablet()));

        this.sessionKey = "chatSession";
        this.session = null;

        this.backendUrl = "https://kittycrypto.ddns.net:5493";
        this.init();

        this.clearBtn = document.getElementById("clear-btn");
        this.collapseBtn = document.getElementById("collapse-btn");

        this.isCollapsed = false;

        this.clearBtn.addEventListener("click", () => this.clearChat());
        this.collapseBtn.addEventListener("click", () => this.toggleCollapse());

    }

    init() {
        const stored = localStorage.getItem(this.sessionKey);
        if (stored) {
            this.session = JSON.parse(stored);
            this.restoreSession();
        } else {
            this.prepareNicknameSetup();
        }
    }

    prepareNicknameSetup() {
        this.chatroomEl.style.display = "none";
        this.messageEl.style.display = "none";
        this.sendBtn.style.display = "none";

        this.nicknameEl.hidden = false;
        this.submitBtn.hidden = false;

        this.submitBtn.addEventListener("click", () => this.setNickname());

        if (this.isMobile) return;

        this.nicknameEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.setNickname();
            }
        });
    }

    async setNickname() {
        const nickname = this.nicknameEl.value.trim();
        if (!nickname) return;

        const sessionId = await this.generateSessionId(nickname);
        this.session = { sessionId, nickname };

        localStorage.setItem(this.sessionKey, JSON.stringify(this.session));
        this.restoreSession();
    }

    restoreSession() {
        this.chatroomEl.style.display = "flex";
        this.messageEl.style.display = "block";
        this.sendBtn.style.display = "block";

        this.nicknameEl.hidden = true;
        this.submitBtn.hidden = true;

        this.chatroomEl.innerHTML = "";

        this.sendBtn.addEventListener("click", () => this.handleSend());

        // start SSE connection
        this.startStream();

        if (this.isMobile) return;

        this.messageEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

    }

    async handleSend() {
        const text = this.messageEl.value.trim();
        if (!text) return;

        const msg = {
            text,
            sender: this.session.nickname,
            timestamp: Date.now(),
            sessionId: this.session.sessionId
        };

        try {
            await fetch(`${this.backendUrl}/chat/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(msg)
            });
        } catch (err) {
            console.error("Failed to send:", err);
        }

        this.messageEl.value = "";
    }

    startStream() {
        const url = `${this.backendUrl}/chat/stream?sessionId=${this.session.sessionId}`;
        const evtSource = new EventSource(url);

        evtSource.onmessage = (event) => {
            try {
                const history = JSON.parse(event.data);
                this.chatroomEl.innerHTML = "";
                history.forEach(msg =>
                    this.addMessage(msg.text, msg.sender, msg.timestamp)
                );
            } catch (e) {
                console.error("SSE parse error:", e);
            }
        };

        evtSource.onerror = (err) => {
            console.error("SSE connection error:", err);
        };
    }

    addMessage(text, author, timestamp) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("message-wrapper");

        const msgEl = document.createElement("div");
        msgEl.classList.add("message");

        const nickEl = document.createElement("div");
        nickEl.classList.add("nickname-strip");
        nickEl.textContent = author;

        const textEl = document.createElement("div");
        textEl.classList.add("message-text");
        textEl.textContent = text;

        msgEl.appendChild(nickEl);
        msgEl.appendChild(textEl);

        const timeEl = document.createElement("div");
        timeEl.classList.add("timestamp");
        timeEl.textContent = this.formatTime(timestamp);

        if (author === this.session.nickname) {
            wrapper.classList.add("guest");
            msgEl.classList.add("guest");
            timeEl.classList.add("guest");
        } else {
            wrapper.classList.add("host");
            msgEl.classList.add("host");
            timeEl.classList.add("host");
        }

        wrapper.appendChild(msgEl);
        wrapper.appendChild(timeEl);

        this.chatroomEl.appendChild(wrapper);
        this.chatroomEl.scrollTop = this.chatroomEl.scrollHeight;
    }


    formatTime(timestamp) {
        const date = new Date(timestamp);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const HH = String(date.getHours()).padStart(2, "0");
        const min = String(date.getMinutes()).padStart(2, "0");
        return `${yyyy}.${mm}.${dd} ${HH}:${min}`;
    }

    async generateSessionId(nickname) {
        let ip = "0.0.0.0";
        try {
            const res = await fetch("https://kittycrypto.ddns.net:7619/get-ip");
            if (res.ok) {
                const data = await res.json();
                ip = data.ip || "0.0.0.0";
            }
        } catch (e) {
            console.error("Could not retrieve IP:", e);
        }

        const timestamp = Date.now().toString();
        const input = `${nickname}|${timestamp}|${ip}`;

        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);

        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");
    }

    clearChat() {
        const confirmClear = confirm(
            "Do you wish to clear the chat? Your session will be lost and you will not be able to recover the messages you have sent."
        );
        if (!confirmClear) return;

        localStorage.removeItem(this.sessionKey);
        this.session = null;
        this.chatroomEl.innerHTML = "";
        this.prepareNicknameSetup();
    }

    collapseChat() {
        const modal = document.querySelector(".chat-modal");
        const shell = document.getElementById("chat-panel-shell");

        if (!modal || !shell) return;

        // remember original shell height once
        if (!shell.dataset.origHeight) {
            shell.dataset.origHeight = getComputedStyle(shell).height; // e.g. "400px"
        }

        modal.classList.add("collapsed");
        this.collapseBtn.textContent = "➕";
        this.isCollapsed = true;

        // after styles apply, size shell so the header sits flush at the bottom
        requestAnimationFrame(() => {
            const header = modal.querySelector(".chat-header");
            const h = header ? header.offsetHeight : modal.offsetHeight || 60;
            shell.style.height = `${h}px`;
        });
    }

    uncollapseChat() {
        const modal = document.querySelector(".chat-modal");
        const shell = document.getElementById("chat-panel-shell");

        if (!modal || !shell) return;

        modal.classList.remove("collapsed");
        this.collapseBtn.textContent = "➖";
        this.isCollapsed = false;

        // restore the shell height to what it was before collapsing
        const restore = shell.dataset.origHeight || "400px";
        shell.style.height = restore;
    }



    toggleCollapse() {
        if (this.isCollapsed) {
            this.uncollapseChat();
        } else {
            this.collapseChat();
        }
    }

}

window.ChatApp = ChatApp;