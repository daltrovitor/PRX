const KEY = "prx_push_prompt_seen";
const LEGACY = ["prx_push_popup_dismissed_at", "prx_push_banner_dismissed_at"];
let seenThisTab = false;
export function hasSeenPushPrompt(): boolean {
  if (seenThisTab) return true;
  try { return Boolean(localStorage.getItem(KEY) || LEGACY.some((key) => localStorage.getItem(key))); }
  catch { return seenThisTab; }
}
export function markPushPromptSeen(): void {
  seenThisTab = true;
  try { localStorage.setItem(KEY, "1"); } catch { /* private browsing: remember in this tab */ }
}
