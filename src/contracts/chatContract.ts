export type { ChatMessageRecord, ChatSession } from "../contracts.js";

export const chatDom = {
  shell: "#chat-panel-shell",
  modal: ".chat-modal",
  header: ".chat-header",
  title: ".chat-header .title",
  controls: "#chat-controls",
  room: "#chatroom",
  composer: "#message",
  send: "#send-button",
  nickname: "#nickname",
  start: "#submit-button",
  mute: "#mute-btn",
  clear: "#clear-btn",
  collapse: "#collapse-btn"
} as const;

export const chatStorage = {
  session: "chatSession",
  welcomePrefix: "welcomeSent:",
  agentPrefix: "lastAgent:"
} as const;
