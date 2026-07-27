import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "chat.html",
  "src/chat.ts",
  "src/contracts/chatContract.ts",
  "styles/styles.css",
  "styles/chat.css",
  "graphics/robin.png",
  "sounds/dogBark.mp3"
];

for (const file of requiredFiles) {
  await access(file);
}

const markup = await readFile("chat.html", "utf8");
const requiredHooks = [
  'id="chat-panel-shell"',
  'class="chat-modal"',
  'class="chat-header"',
  'id="chat-controls"',
  'id="chatroom"',
  'id="message"',
  'id="send-button"',
  'id="nickname"',
  'id="submit-button"',
  'id="mute-btn"',
  'id="clear-btn"',
  'id="collapse-btn"'
];

for (const hook of requiredHooks) {
  if (!markup.includes(hook)) {
    throw new Error(`Chat contract hook is missing from chat.html: ${hook}`);
  }
}

console.log("Chat package contract is valid.");
