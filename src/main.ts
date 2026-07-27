import { ChatApp } from "./chat.js";

function applyMobileLayout(): void {
  window.md = new MobileDetect(window.navigator.userAgent);
  if (!window.md.mobile()) return;
  document.querySelectorAll<HTMLElement>(".container").forEach(element => element.classList.add("mobile"));
}

async function openChatPanel(): Promise<void> {
  if (document.getElementById("chat-panel-shell")) return;

  const shell = document.createElement("div");
  shell.id = "chat-panel-shell";
  shell.classList.toggle("has-session", Boolean(localStorage.getItem("chatSession")));
  window.shell = shell;

  let html = "";
  try {
    const response = await fetch("./chat.html");
    if (!response.ok) throw new Error("Failed to load chat.html");
    html = await response.text();
  } catch {
    console.error("Error loading chat content");
    html = "<div><p>Could not load chat.html</p></div>";
  }

  const temporary = document.createElement("div");
  temporary.innerHTML = html;
  const backbone = temporary.querySelector<HTMLElement>(".chat-modal") ?? temporary.firstElementChild as HTMLElement | null;

  if (backbone) {
    shell.appendChild(backbone);
  } else {
    shell.innerHTML = html;
  }

  document.body.appendChild(shell);
  window.ChatApp = ChatApp;
  if (!window.chatApp) window.chatApp = new ChatApp();
}

async function initialise(): Promise<void> {
  applyMobileLayout();
  await openChatPanel();
}

document.addEventListener("DOMContentLoaded", () => {
  initialise().catch(() => console.error("Page initialisation failed"));
});
