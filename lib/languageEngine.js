// lib/languageEngine.js

export function resolveLanguage(text, user = {}) {
  const t = text.toLowerCase();

  // Explicit English
  if (/[a-z]/i.test(text) && !/[अ-ह]/.test(text)) {
    return "english";
  }

  // Hindi / Hinglish
  if (/[अ-ह]/.test(text) || /kya|kaise|kyun|hai|batao|samajh/i.test(t)) {
    return "hinglish";
  }

  // Default fallback
  return user.language || "hinglish";
}
