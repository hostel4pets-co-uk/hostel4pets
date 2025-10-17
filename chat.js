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
        this.muteBtn = document.getElementById("mute-btn");
        this.isMobile = !!(window.md && (window.md.mobile() || window.md.tablet()));
        let savedCollapse = localStorage.getItem("chatCollapsed");
        this.isMuted = localStorage.getItem("mute") === "true";

        if (savedCollapse === null) {
            localStorage.setItem("chatCollapsed", "true");
            savedCollapse = "true";
        }

        this.sessionKey = "chatSession";
        this.session = null;

        this.backendUrl = "https://api.kittycrypto.gg:5493";

        this.clearBtn = document.getElementById("clear-btn");
        this.collapseBtn = document.getElementById("collapse-btn");

        this.isCollapsed = false;

        // Header elements
        this.modalEl = document.querySelector(".chat-modal");
        this.shellEl = document.getElementById("chat-panel-shell");
        this.titleEl = document.querySelector(".chat-header .title");

        this.clearBtn.addEventListener("click", () => this.clearChat());
        this.collapseBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleCollapse();
        });
        this.muteBtn.addEventListener("click", () => this.toggleMute());

        // Clear "New Message(s)!" on hover or touch
        const clearTargets = [this.modalEl, this.chatroomEl, this.shellEl].filter(Boolean);
        clearTargets.forEach(el => {
            el.addEventListener("mouseenter", () => this.clearNewMessage());
            el.addEventListener("mousemove", () => this.clearNewMessage());
            el.addEventListener("touchstart", () => this.clearNewMessage(), { passive: true });
        });

        // Default collapsed on load
        this.setHeader("Chat");
        if (savedCollapse === "true") {
            this.collapseChat();
        } else {
            this.uncollapseChat();
        }

        const headerDiv = document.querySelector(".chat-header");
        if (headerDiv) {
            if (this.isMobile) headerDiv.addEventListener("click", () => this.toggleCollapse()); // single tap on mobile
            else headerDiv.addEventListener("dblclick", () => this.toggleCollapse()); // double click on desktop
        }

        this.updateMuteButton();

        window.addEventListener("resize", () => this.reflowToModalHeight(false));
        this._setupNotificationSound();
        this.init();
    }

    _setupNotificationSound() {
        this.notificationAudio = new Audio("/sounds/dogBark.mp3");
        this.notificationAudio.volume = 0.3;
    }

    updateMuteButton() {
        if (!this.muteBtn) return;
        this.muteBtn.textContent = this.isMuted ? "🔔" : "🔕";
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        localStorage.setItem("mute", this.isMuted.toString());
        this.updateMuteButton();
    }

    setHeader(text) {
        if (!this.titleEl) return;
        this.titleEl.textContent = text || "Chat";
    }

    markNewMessage() {
        this.setHeader("New Message(s)!");
    }

    clearNewMessage() {
        this.setHeader("Chat");
    }

    enableLivePreview() {
        if (!this.messageEl) return;

        // Avoid formatting mid-IME composition
        this.isComposing = false;
        this.messageEl.addEventListener("compositionstart", () => { this.isComposing = true; });
        this.messageEl.addEventListener("compositionend", () => { this.isComposing = false; this.applyLiveFormatting(); });

        // Format on every input
        this.messageEl.addEventListener("input", () => this.applyLiveFormatting());

        // Paste as plain text, then format
        this.messageEl.addEventListener("paste", (e) => this.handlePaste(e));

        // Initial pass (placeholder is handled via CSS)
        this.applyLiveFormatting();
    }

    applyLiveFormatting() {
        if (this.isComposing) return;

        // Get what the user actually typed (with literal < and new lines)
        const raw = this.messageEl.innerText;

        // Turn literal, whitelisted tags into real HTML + keep line breaks
        const rendered = this.parseTags(raw);

        // Final safety net
        const safe = DOMPurify.sanitize(rendered, {
            ALLOWED_TAGS: [
                "b", "strong", "i", "em", "u", "s", "sub", "sup", "code", "pre",
                "p", "br", "a", "ul", "ol", "li", "h1", "h2", "h3"
            ],
            ALLOWED_ATTR: ["href", "target", "rel"]
        });

        if (this.messageEl.innerHTML !== safe) {
            this.messageEl.innerHTML = safe;
            this.moveCaretToEnd(this.messageEl);
        }
    }

    moveCaretToEnd(el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    handlePaste(e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData("text/plain");
        // Insert plain text at caret
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) {
            this.messageEl.append(document.createTextNode(text));
        } else {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range); 
        }
        this.applyLiveFormatting();
    }

    parseTags(raw) {
        if (!raw) return "";

        let html = raw
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        html = html.replace(/\r\n|\r|\n/g, "<br>");

        // Helper to unescape simple paired tags like <b>, <i>, etc.
        const unescapePair = (tag) => {
            const re = new RegExp(`&lt;${tag}&gt;([\\s\\S]*?)&lt;\\/${tag}&gt;`, "gi");
            html = html.replace(re, `<${tag}>$1</${tag}>`);
        };

        // Simple singletons like <br>
        html = html.replace(/&lt;br\s*\/?&gt;/gi, "<br>");

        // Headings and paragraphs
        ["p", "h1", "h2", "h3"].forEach(unescapePair);

        // Inline formatting
        ["b", "strong", "i", "em", "u", "s", "sub", "sup", "code"].forEach(unescapePair);

        // Code blocks
        unescapePair("pre");

        ["ul", "ol"].forEach(unescapePair);
        unescapePair("li");

        // Links: allow http, https, mailto, tel. Everything else remains text.
        html = html.replace(
            /&lt;a\s+href=(["'])(.*?)\1(?:\s+target=(["'])(.*?)\3)?\s*&gt;([\s\S]*?)&lt;\/a&gt;/gi,
            (_m, _q1, href, _q2, target, text) => {
                const url = (href || "").trim();
                const ok = /^(https?:|mailto:|tel:)/i.test(url);
                if (!ok) return text; // drop the tag, keep text
                const tgt = /^(?:_blank|_self|_parent|_top)$/i.test(target || "") ? ` target="${target}"` : "";
                const rel = tgt ? ` rel="noopener noreferrer"` : "";
                return `<a href="${url}"${tgt}${rel}>${text}</a>`;
            }
        );

        return html;
    }

    init() {
        const stored = localStorage.getItem(this.sessionKey);
        if (stored) {
            this.session = JSON.parse(stored);
            // Ensure welcome exists server-side for older sessions that missed it
            this.sendWelcomeIfNeeded().finally(() => this.restoreSession());
            return;
        }
        // Pre-login state shows there is a message waiting
        this.setHeader("New Message!");
        this.prepareNicknameSetup();
    }

    prepareNicknameSetup() {
        this.chatroomEl.style.display = "none";
        this.messageEl.style.display = "none";
        this.sendBtn.style.display = "none";

        this.nicknameEl.hidden = false;
        this.submitBtn.hidden = false;

        // clear old listeners
        this.submitBtn.onclick = null;
        this.nicknameEl.onkeydown = null;

        // re-bind
        this.submitBtn.onclick = () => this.setNickname();

        if (!this.isMobile) {
            this.nicknameEl.onkeydown = (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this.setNickname();
                }
            };
        }

        this.reflowToModalHeight(!this.isCollapsed);
    }


    async setNickname() {
        const nickname = this.nicknameEl.value.trim();
        if (!nickname) return;

        const sessionId = await this.generateSessionId(nickname);
        this.session = { sessionId, nickname };

        localStorage.setItem(this.sessionKey, JSON.stringify(this.session));

        await this.sendWelcomeIfNeeded();

        this.restoreSession();
    }

    restoreSession() {
        this.chatroomEl.style.display = "flex";
        this.messageEl.style.display = "block";
        this.sendBtn.style.display = "block";

        this.nicknameEl.hidden = true;
        this.submitBtn.hidden = true;

        this.chatroomEl.innerHTML = "";

        // clear old listener first
        this.sendBtn.onclick = null;
        this.sendBtn.onclick = () => this.handleSend();

        this.reflowToModalHeight(!this.isCollapsed);

        // start SSE connection
        this.startStream();

        if (!this.isMobile) {
            this.messageEl.onkeydown = null;
            this.messageEl.onkeydown = (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSend();
                }
            };
        }

        this.enableLivePreview();

        if (window.shell) window.shell.style.height = "450px";
    }

    async handleSend() {
        let text = this.messageEl.innerHTML.trim();
        if (!text) return;

        text = text.replace(/<(?:div|p)><br><\/(?:div|p)>/gi, "<br>");

        // Convert user-entered newlines to <br> so they survive storage & rendering
        text = text.replace(/\n/g, "<br>");

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

        this.messageEl.innerHTML = "";
    }

    startStream() {
        const url = `${this.backendUrl}/chat/stream?sessionId=${this.session.sessionId}`;
        const evtSource = new EventSource(url);

        evtSource.onmessage = (event) => {
            try {
                const history = JSON.parse(event.data);
                this.chatroomEl.innerHTML = "";

                history.forEach(msg => {
                    this.addMessage(msg.text, msg.sender, msg.timestamp);
                });

                if (history.length) {
                    const last = history[history.length - 1];
                    if (last.sender !== this.session.nickname) {
                        this.markNewMessage();
                        this._playNotificationSound();
                        this.blinkBorder();
                    }
                }
            } catch (e) {
                console.error("SSE parse error:", e);
            }
        };

        evtSource.onerror = (err) => {
            console.error("SSE connection error:", err);
        };
    }

    _playNotificationSound() {
        if (this.isMuted) return; // skip if muted
        if (!this.notificationAudio) return;
        this.notificationAudio.currentTime = 0;
        this.notificationAudio.play().catch(err => {
            console.warn("Notification sound failed to play:", err);
        });
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
        textEl.innerHTML = DOMPurify.sanitize(
            text.replace(/\n/g, "<br>"),
            {
                ALLOWED_TAGS: [
                    "b", "strong", "i", "em", "u", "s", "sub", "sup", "code", "pre",
                    "p", "br", "a", "ul", "ol", "li", "h1", "h2", "h3"
                ],
                ALLOWED_ATTR: ["href", "target", "rel"]
            }
        );

        msgEl.appendChild(nickEl);
        msgEl.appendChild(textEl);

        const timeEl = document.createElement("div");
        timeEl.classList.add("timestamp");
        timeEl.textContent = this.formatTime(timestamp);

        if (author === this.session?.nickname) {
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

        // Only flag header for host messages
        if (author !== this.session?.nickname) {
            this.markNewMessage();
        }
    }

    // New: ensure shell height matches current modal
    reflowToModalHeight(captureAsOrig = false) {
        const modal = this.modalEl;
        const shell = this.shellEl;
        if (!modal || !shell) return;

        requestAnimationFrame(() => {
            const h = modal.offsetHeight;
            shell.style.height = `${h}px`;
            if (captureAsOrig) shell.dataset.origHeight = `${h}px`;
        });
    }

    blinkBorder() {
        if (!this.modalEl) return;
        this.modalEl.classList.add("blink");
        setTimeout(() => {
            this.modalEl.classList.remove("blink");
        }, 3000); // blink for 3 seconds
    }

    // New: post the welcome message to the server once per session
    async sendWelcomeIfNeeded() {
        try {
            if (!this.session?.sessionId) return;



            const key = `welcomeSent:${this.session.sessionId}`;
            if (localStorage.getItem(key)) return;

            const payload = {
                text: `Hello, ${this.session.nickname}! Welcome to Hostel4Pets, the Home away from Home for your four legged pals!\nFeel free to write to us in here if you have any queries!`.replace(/\n/g, "<br>"),
                sender: "Hostel4Pets",
                timestamp: Date.now(),
                sessionId: this.session.sessionId,
                messageID: 0,
                isWelcomeMessage: true
            };

            const res = await fetch(`${this.backendUrl}/chat/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                Object.keys(localStorage)
                    .filter(k => k.startsWith("welcomeSent:"))
                    .forEach(k => localStorage.removeItem(k));

                localStorage.setItem(key, "true");
            } else {
                console.error("Welcome send failed with status", res.status);
            }
        } catch (e) {
            console.error("Failed to send welcome:", e);
        }
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

        const timestamp = Date.now().toString();
        const input = `${nickname}|${timestamp}`;

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

        if (this.session?.sessionId) {
            const key = `welcomeSent:${this.session.sessionId}`;
            localStorage.removeItem(key);
        }

        localStorage.removeItem(this.sessionKey);
        this.session = null;
        this.chatroomEl.innerHTML = "";

        this.setHeader("New Message!");
        this.prepareNicknameSetup();
        this.reflowToModalHeight(!this.isCollapsed);
    }

    collapseChat() {
        const modal = this.modalEl;
        const shell = this.shellEl;
        if (!modal || !shell) return;

        if (!shell.dataset.origHeight) {
            shell.dataset.origHeight = getComputedStyle(shell).height;
        }

        modal.classList.add("collapsed");
        this.collapseBtn.textContent = "➕";
        this.isCollapsed = true;
        localStorage.setItem("chatCollapsed", "true");

        requestAnimationFrame(() => {
            const header = modal.querySelector(".chat-header");
            const h = header ? header.offsetHeight : modal.offsetHeight || 60;
            shell.style.height = `${h}px`;
        });
    }

    uncollapseChat() {
        const modal = this.modalEl;
        const shell = this.shellEl;
        if (!modal || !shell) return;

        modal.classList.remove("collapsed");
        this.collapseBtn.textContent = "➖";
        this.isCollapsed = false;
        localStorage.setItem("chatCollapsed", "false");

        // Recalculate from the now-expanded modal so the shell snaps to the correct Y.

        const restore = shell.dataset.origHeight || "306px";
        shell.style.height = restore;
    }

    toggleCollapse() {
        if (this.isCollapsed) {
            this.uncollapseChat();
            return;
        }
        this.collapseChat();
    }
}

window.ChatApp = ChatApp;