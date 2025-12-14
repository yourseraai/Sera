// lib/memory.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ---------------- USER MEMORY ---------------- */

export async function getUserMemory(chatId) {
  const { data } = await supabase
    .from("memories")
    .select("*")
    .eq("chat_id", chatId)
    .eq("key", "profile")
    .single();

  return data?.value || {
    state: "NEW_USER",
    name: null,
    addressAs: null,
    tone: "professional",
    timezone: "Asia/Kolkata",
  };
}

export async function saveUserMemory(chatId, value) {
  await supabase.from("memories").upsert({
    chat_id: chatId,
    key: "profile",
    value,
    source: "system",
  });
}

/* ---------------- NOTES ---------------- */

export async function saveNote(chatId, text) {
  await supabase.from("memories").insert({
    chat_id: chatId,
    key: "note",
    value: { text },
    source: "user",
  });
}

export async function getLastNote(chatId) {
  const { data } = await supabase
    .from("memories")
    .select("*")
    .eq("chat_id", chatId)
    .eq("key", "note")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data?.value?.text || null;
}

/* ---------------- CONVERSATION LOG ---------------- */

export async function logConversation(chatId, role, content) {
  await supabase.from("conv_log").insert({
    chat_id: chatId,
    role,
    content,
  });
}
