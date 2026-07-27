import { requireElement } from "./dom.js";
export class ChatApp {
    chatroomEl;
    messageEl;
    sendBtn;
    submitBtn;
    nicknameEl;
    muteBtn;
    clearBtn;
    collapseBtn;
    modalEl;
    shellEl;
    titleEl;
    isMobile;
    sessionKey = "chatSession";
    backendUrl = "https://h4p.kittycrow.dev";
    session = null;
    isMuted;
    isCollapsed = false;
    notificationAudio = null;
    eventSource = null;
    typingTimeout = null;
    lastTyping = 0;
    isStartingSession = false;
    constructor() {
        this.chatroomEl = requireElement("chatroom");
        this.messageEl = requireElement("message");
        this.sendBtn = requireElement("send-button");
        this.submitBtn = requireElement("submit-button");
        this.nicknameEl = requireElement("nickname");
        this.muteBtn = requireElement("mute-btn");
        this.clearBtn = requireElement("clear-btn");
        this.collapseBtn = requireElement("collapse-btn");
        this.modalEl = document.querySelector(".chat-modal") ?? requireElement("chat-panel-shell");
        this.shellEl = requireElement("chat-panel-shell");
        this.titleEl = document.querySelector(".chat-header .title") ?? this.modalEl;
        this.isMobile = Boolean(window.md && (window.md.mobile() || window.md.tablet()));
        this.isMuted = localStorage.getItem("mute") === "true";
        let savedCollapse = localStorage.getItem("chatCollapsed");
        if (savedCollapse === null) {
            savedCollapse = "true";
            localStorage.setItem("chatCollapsed", savedCollapse);
        }
        this.clearBtn.addEventListener("click", () => this.clearChat());
        this.collapseBtn.addEventListener("click", event => {
            event.stopPropagation();
            this.toggleCollapse();
        });
        this.muteBtn.addEventListener("click", () => this.toggleMute());
        [this.modalEl, this.chatroomEl, this.shellEl].forEach(element => {
            element.addEventListener("mouseenter", () => this.clearNewMessage());
            element.addEventListener("mousemove", () => this.clearNewMessage());
            element.addEventListener("touchstart", () => this.clearNewMessage(), { passive: true });
        });
        this.setHeader("Chat");
        if (savedCollapse === "true")
            this.collapseChat();
        else
            this.uncollapseChat();
        const header = document.querySelector(".chat-header");
        if (header) {
            header.addEventListener("click", event => {
                if (event.target.closest("#chat-controls"))
                    return;
                if (this.isCollapsed)
                    this.uncollapseChat();
                requestAnimationFrame(() => this.modalEl.scrollIntoView({ behavior: "smooth", block: "start" }));
            });
        }
        this.updateMuteButton();
        this.setupNotificationSound();
        this.init();
    }
    setupNotificationSound() {
        this.notificationAudio = new Audio("/sounds/dogBark.mp3");
        this.notificationAudio.volume = 0.3;
    }
    updateMuteButton() {
        this.muteBtn.textContent = this.isMuted ? "🔔" : "🔕";
    }
    toggleMute() {
        this.isMuted = !this.isMuted;
        localStorage.setItem("mute", this.isMuted.toString());
        this.updateMuteButton();
    }
    setHeader(text) {
        this.titleEl.textContent = text || "Chat";
    }
    markNewMessage() {
        this.setHeader("New Message(s)!");
    }
    clearNewMessage() {
        this.setHeader("Chat");
    }
    init() {
        const stored = localStorage.getItem(this.sessionKey);
        if (stored) {
            try {
                this.session = JSON.parse(stored);
            }
            catch {
                localStorage.removeItem(this.sessionKey);
            }
            if (this.session) {
                this.restoreSession();
                void this.sendWelcomeIfNeeded();
                return;
            }
        }
        this.setHeader("New Message!");
        this.prepareNicknameSetup();
    }
    prepareNicknameSetup() {
        this.shellEl.classList.remove("has-session");
        this.chatroomEl.style.display = "none";
        this.messageEl.style.display = "none";
        this.sendBtn.style.display = "none";
        this.nicknameEl.hidden = false;
        this.submitBtn.hidden = false;
        this.submitBtn.onclick = () => void this.setNickname();
        this.nicknameEl.onkeydown = this.isMobile ? null : event => {
            if (event.key !== "Enter" || event.shiftKey)
                return;
            event.preventDefault();
            void this.setNickname();
        };
    }
    appendRobinIcon(textElement) {
        const icon = document.createElement("img");
        icon.src = "./graphics/robin.png";
        icon.alt = "AI bot";
        icon.classList.add("robin-icon");
        textElement.appendChild(icon);
    }
    showSystemMessage(className, nickname, markup) {
        if (this.chatroomEl.querySelector(`.${className}`))
            return null;
        const wrapper = document.createElement("div");
        wrapper.classList.add("message-wrapper", "host", className);
        const message = document.createElement("div");
        message.classList.add("message", "host");
        const nicknameStrip = document.createElement("div");
        nicknameStrip.classList.add("nickname-strip");
        nicknameStrip.textContent = nickname;
        const text = document.createElement("div");
        text.classList.add("message-text");
        text.innerHTML = markup;
        this.appendRobinIcon(text);
        message.append(nicknameStrip, text);
        wrapper.appendChild(message);
        this.chatroomEl.appendChild(wrapper);
        this.chatroomEl.scrollTop = this.chatroomEl.scrollHeight;
        requestAnimationFrame(() => wrapper.classList.add("show"));
        return wrapper;
    }
    showThinkingBubble() {
        return this.showSystemMessage("thinking-bubble", "Robin - Hostel4Pets", `<div class="typing-indicator" aria-label="Thinking"><p>Let me think about that
        <span class="dot"></span><span class="dot"></span><span class="dot"></span></p></div>`);
    }
    removeThinkingBubble() {
        this.chatroomEl.querySelector(".thinking-bubble")?.remove();
    }
    showUnavailableApi() {
        this.showSystemMessage("unavailable-api", "Robin - Hostel4Pets", "<p>We are so sorry for the inconvenience,<br>the chat is not available at the moment!</p>");
    }
    removeUnavailableApi() {
        this.chatroomEl.querySelector(".unavailable-api")?.remove();
    }
    showTypingSignal(agentName = "Agent") {
        if (this.shouldInsertHandoff(agentName))
            this.insertHandoffNotice(agentName);
        else
            this.removeHandoffNotice();
        if (this.chatroomEl.querySelector(".typing-signal"))
            return;
        this.removeTypingSignal();
        this.removeThinkingBubble();
        this.showSystemMessage("typing-signal", agentName, `<div class="typing-indicator" aria-label="Agent typing"><p>${agentName} is typing
        <span class="dot"></span><span class="dot"></span><span class="dot"></span></p></div>`);
    }
    removeTypingSignal() {
        this.chatroomEl.querySelector(".typing-signal")?.remove();
    }
    getHandoffKey() {
        return this.session?.sessionId ? `lastAgent:${this.session.sessionId}` : "lastAgent";
    }
    shouldInsertHandoff(agentName) {
        const key = this.getHandoffKey();
        if (localStorage.getItem(key) === agentName)
            return false;
        localStorage.setItem(key, agentName);
        return true;
    }
    insertHandoffNotice(agentName) {
        this.chatroomEl.querySelector(".handoff-notice")?.remove();
        const notice = document.createElement("div");
        notice.classList.add("system-notice", "handoff-notice");
        notice.setAttribute("aria-live", "polite");
        notice.innerHTML = `<span class="handoff-text">The chat has been handed off to agent: ${agentName}</span>`;
        this.chatroomEl.appendChild(notice);
        this.chatroomEl.scrollTop = this.chatroomEl.scrollHeight;
    }
    removeHandoffNotice() {
        this.chatroomEl.querySelector(".handoff-notice")?.remove();
    }
    sendTypingSignal() {
        const session = this.session;
        if (!session)
            return;
        if (this.typingTimeout !== null)
            window.clearTimeout(this.typingTimeout);
        const now = Date.now();
        if (this.lastTyping && now - this.lastTyping < 1000)
            return;
        this.lastTyping = now;
        const source = new URLSearchParams(window.location.search).get("source");
        if (!window.__isAgentApp) {
            const draft = this.messageEl.innerText.replace(/\u00A0/g, " ").replace(/\r/g, "");
            const guestPayload = {
                text: draft,
                sender: session.nickname,
                sessionId: session.sessionId,
                timestamp: now,
                isTypingSignal: true,
                source: source ?? "guestApp"
            };
            void this.postMessage(guestPayload, "Typing signal failed");
        }
        const payload = {
            text: `${session.nickname} is typing`,
            sender: session.nickname,
            sessionId: session.sessionId,
            timestamp: now,
            isTypingSignal: true,
            source
        };
        void this.postMessage(payload, "Typing signal failed");
        this.typingTimeout = window.setTimeout(() => { this.lastTyping = 0; }, 3000);
    }
    async postMessage(payload, failureMessage) {
        try {
            return await fetch(`${this.backendUrl}/chat/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }
        catch {
            console.warn(failureMessage);
            return null;
        }
    }
    async setNickname() {
        const nickname = this.nicknameEl.value.trim();
        if (!nickname || this.isStartingSession)
            return;
        this.isStartingSession = true;
        this.submitBtn.disabled = true;
        try {
            const sessionId = await this.generateSessionId(nickname);
            this.session = { sessionId, nickname };
            localStorage.setItem(this.sessionKey, JSON.stringify(this.session));
            this.restoreSession();
            void this.sendWelcomeIfNeeded();
        }
        catch {
            console.error("Failed to start chat session");
        }
        finally {
            this.isStartingSession = false;
            this.submitBtn.disabled = false;
        }
    }
    bindEnterKey() {
        this.messageEl.onkeydown = event => {
            if (event.key !== "Enter" || event.shiftKey)
                return;
            event.preventDefault();
            void this.handleSend();
        };
    }
    bindEnterOnMobile() {
        this.messageEl.onkeydown = event => {
            if (event.key !== "Enter")
                return;
            requestAnimationFrame(() => {
                const walker = document.createTreeWalker(this.messageEl, NodeFilter.SHOW_TEXT);
                const nodes = [];
                while (walker.nextNode()) {
                    const node = walker.currentNode;
                    if (node instanceof Text && node.nodeValue?.includes("\u00A0"))
                        nodes.push(node);
                }
                nodes.forEach(node => { node.nodeValue = node.nodeValue?.replace(/\u00A0/g, " ") ?? ""; });
            });
        };
    }
    initialiseEnterBinding() {
        if (this.isMobile)
            this.bindEnterOnMobile();
        else
            this.bindEnterKey();
        this.messageEl.addEventListener("keydown", event => {
            if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete")
                this.sendTypingSignal();
        });
    }
    restoreSession() {
        this.shellEl.classList.add("has-session");
        this.chatroomEl.style.display = "flex";
        this.messageEl.style.display = "block";
        this.sendBtn.style.display = "block";
        this.nicknameEl.hidden = true;
        this.submitBtn.hidden = true;
        this.chatroomEl.innerHTML = "";
        this.sendBtn.onclick = () => void this.handleSend();
        this.startStream();
        this.initialiseEnterBinding();
    }
    async handleSend() {
        const session = this.session;
        if (!session)
            return;
        const text = this.messageEl.innerText
            .replace(/\u00A0/g, " ")
            .replace(/\r/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        if (!text)
            return;
        const message = {
            text,
            sender: session.nickname,
            agent: null,
            timestamp: Date.now(),
            sessionId: session.sessionId
        };
        this.messageEl.innerHTML = "";
        this.lastTyping = 0;
        const response = await this.postMessage(message, "Failed to send message");
        if (!response)
            this.removeThinkingBubble();
    }
    startStream() {
        const session = this.session;
        if (!session)
            return;
        this.eventSource?.close();
        this.eventSource = new EventSource(`${this.backendUrl}/chat/stream?sessionId=${session.sessionId}`);
        this.eventSource.onmessage = event => {
            try {
                const data = JSON.parse(event.data);
                if (!Array.isArray(data))
                    return;
                if (data.length === 1 && data[0]?.isTypingSignal) {
                    const signal = data[0];
                    if (signal.sender !== session.nickname && signal.source === "agentApp")
                        this.showTypingSignal(signal.sender || "Agent");
                    return;
                }
                this.chatroomEl.innerHTML = "";
                data.forEach(message => this.addMessage(message.text, message.sender, message.timestamp, Boolean(message.isAIMessage), message.agent ?? null));
                if (data.length === 0)
                    return;
                this.removeTypingSignal();
                const handedOff = data.some(message => Boolean(message.handedOffToHuman));
                const last = data.at(-1);
                if (!last)
                    return;
                const shouldThink = !last.isAIMessage && !handedOff;
                if (shouldThink) {
                    const guests = this.chatroomEl.querySelectorAll(".message-wrapper.guest");
                    const lastGuest = guests.item(guests.length - 1);
                    const bubble = lastGuest ? this.showThinkingBubble() : null;
                    if (bubble)
                        lastGuest.after(bubble);
                }
                else
                    this.removeThinkingBubble();
                if (last.sender !== session.nickname) {
                    this.markNewMessage();
                    this.playNotificationSound();
                }
            }
            catch {
                console.error("SSE parse error");
            }
        };
        this.eventSource.onerror = () => {
            console.error("SSE connection error");
            this.showUnavailableApi();
        };
        this.eventSource.onopen = () => this.removeUnavailableApi();
    }
    playNotificationSound() {
        if (this.isMuted || !this.notificationAudio)
            return;
        this.notificationAudio.currentTime = 0;
        void this.notificationAudio.play().catch(() => console.warn("Notification sound failed to play"));
    }
    addMessage(text, author, timestamp, isAiMessage = false, agent = null) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("message-wrapper");
        const message = document.createElement("div");
        message.classList.add("message");
        const nickname = document.createElement("div");
        nickname.classList.add("nickname-strip");
        if (author === this.session?.nickname)
            nickname.textContent = author;
        else if (isAiMessage)
            nickname.textContent = "Robin - Hostel4Pets";
        else
            nickname.textContent = `${agent ? `${agent} - ` : ""}Hostel4Pets`;
        const messageText = document.createElement("div");
        messageText.classList.add("message-text");
        messageText.innerHTML = DOMPurify.sanitize(text.replace(/\n/g, "<br>"), {
            ALLOWED_TAGS: [
                "b", "strong", "i", "em", "u", "s", "sub", "sup", "code", "pre",
                "p", "br", "a", "ul", "ol", "li", "h1", "h2", "h3"
            ],
            ALLOWED_ATTR: ["href", "target", "rel"]
        });
        if (isAiMessage)
            this.appendRobinIcon(messageText);
        message.append(nickname, messageText);
        const time = document.createElement("div");
        time.classList.add("timestamp");
        time.textContent = this.formatTime(timestamp);
        const isGuest = author === this.session?.nickname;
        wrapper.classList.add(isGuest ? "guest" : "host");
        message.classList.add(isGuest ? "guest" : "host");
        time.classList.add(isGuest ? "guest" : "host");
        wrapper.append(message, time);
        this.chatroomEl.appendChild(wrapper);
        this.chatroomEl.scrollTop = this.chatroomEl.scrollHeight;
        requestAnimationFrame(() => wrapper.classList.add("show"));
        if (!isGuest)
            this.markNewMessage();
    }
    async sendWelcomeIfNeeded() {
        const session = this.session;
        if (!session)
            return;
        const key = `welcomeSent:${session.sessionId}`;
        if (localStorage.getItem(key))
            return;
        const payload = {
            text: `Hello, ${session.nickname}!\nWelcome to Hostel4Pets — your pet’s home away from home!\nI'm Robin, Hostel4Pets’ friendly AI assistant.\nIf you have questions, just let me know!`.replace(/\n/g, "<br>"),
            sender: "Robin - Hostel4Pets",
            timestamp: Date.now(),
            sessionId: session.sessionId,
            messageID: 0,
            isWelcomeMessage: true,
            isAIMessage: true
        };
        const response = await this.postMessage(payload, "Failed to send welcome");
        if (!response?.ok)
            return;
        Object.keys(localStorage)
            .filter(storageKey => storageKey.startsWith("welcomeSent:"))
            .forEach(storageKey => localStorage.removeItem(storageKey));
        localStorage.setItem(key, "true");
    }
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hour = String(date.getHours()).padStart(2, "0");
        const minute = String(date.getMinutes()).padStart(2, "0");
        return `${year}.${month}.${day} ${hour}:${minute}`;
    }
    async generateSessionId(nickname) {
        const input = `${nickname}|${Date.now().toString()}`;
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
        return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
    }
    clearChat() {
        const confirmed = confirm("Do you wish to clear the chat? Your session will be lost and you will not be able to recover the messages you have sent.");
        if (!confirmed)
            return;
        this.eventSource?.close();
        this.eventSource = null;
        if (this.session) {
            localStorage.removeItem(`welcomeSent:${this.session.sessionId}`);
            localStorage.removeItem(`lastAgent:${this.session.sessionId}`);
        }
        localStorage.removeItem(this.sessionKey);
        this.session = null;
        this.chatroomEl.innerHTML = "";
        this.setHeader("New Message!");
        this.prepareNicknameSetup();
    }
    collapseChat() {
        this.modalEl.classList.add("collapsed");
        this.shellEl.classList.remove("is-expanded");
        this.collapseBtn.textContent = "➕";
        this.isCollapsed = true;
        localStorage.setItem("chatCollapsed", "true");
    }
    uncollapseChat() {
        this.modalEl.classList.remove("collapsed");
        this.shellEl.classList.add("is-expanded");
        this.collapseBtn.textContent = "➖";
        this.isCollapsed = false;
        localStorage.setItem("chatCollapsed", "false");
    }
    toggleCollapse() {
        if (this.isCollapsed)
            this.uncollapseChat();
        else
            this.collapseChat();
    }
}
window.ChatApp = ChatApp;
//# sourceMappingURL=chat.js.map