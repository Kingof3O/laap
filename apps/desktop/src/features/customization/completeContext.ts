export interface LocalProfileContext {
  id: string;
  name: string;
}
export function resolveProfileContext(
  id: string | null,
  profiles: LocalProfileContext[],
): LocalProfileContext | undefined {
  return id ? profiles.find((profile) => profile.id === id) : undefined;
}
export const CONTEXT_KEY = "laap_complete_preset_context_v1";
export function readContextId(): string | null {
  try {
    const value = localStorage.getItem(CONTEXT_KEY);
    return value && value.length <= 128 ? value : null;
  } catch {
    return null;
  }
}
export function saveContextId(id: string | null) {
  try {
    if (id) localStorage.setItem(CONTEXT_KEY, id);
    else localStorage.removeItem(CONTEXT_KEY);
  } catch {
    /* Context remains usable for this session. */
  }
}
