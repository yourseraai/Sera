// lib/memory.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --------- BASIC MEMORY OPS ---------

export async function getMemory(chatId, key) {
  const { data } = await supabase
    .from("memories")
    .select("value")
    .eq("chat_id", String(chatId))
    .eq("key", key)
    .single();

  return data?.value ?? null;
}

export async function setMemory(chatId, key, value, tags = []) {
  await supabase.from("memories").insert({
    chat_id: String(chatId),
    key,
    value,
    tags,
    source: "sera"
  });
}

export async function hasMemory(chatId, key) {
  const { data } = await supabase
    .from("memories")
    .select("id")
    .eq("chat_id", String(chatId))
    .eq("key", key)
    .limit(1);

  return data && data.length > 0;
}

export async function getAllNotes(chatId) {
  const { data } = await supabase
    .from("memories")
    .select("*")
    .eq("chat_id", String(chatId))
    .eq("key", "note")
    .order("created_at", { ascending: false });

  return data || [];
}

export async function deleteLastNote(chatId) {
  const notes = await getAllNotes(chatId);
  if (!notes.length) return null;

  await supabase.from("memories").delete().eq("id", notes[0].id);
  return notes[0];
}
