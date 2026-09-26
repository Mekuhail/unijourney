import { config } from '../core/config.ts';

/**
 * AIIntentAdapter. Optional model-backed parsing/explanations. Every caller MUST provide a deterministic fallback and
 * must enforce business rules outside the model. Never send medical evidence text or personal identifiers.
 */
export function aiAvailable(): boolean {
  return !!config.anthropicKey;
}

export interface AiJsonResult<T> { data: T | null; provider: 'anthropic' | 'none'; error?: string }

/** Ask the model for a JSON object. Returns null data when unavailable or on any failure. */
export async function aiJson<T>(system: string, user: string, timeoutMs = 12000): Promise<AiJsonResult<T>> {
  if (!aiAvailable()) return { data: null, provider: 'none' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: config.anthropicModel,
        max_tokens: 1200,
        system: `${system}\nRespond with a single JSON object and nothing else.`,
        messages: [{ role: 'user', content: user }]
      })
    });
    if (!res.ok) return { data: null, provider: 'anthropic', error: `HTTP ${res.status}` };
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = json.content?.find((c) => c.type === 'text')?.text ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { data: null, provider: 'anthropic', error: 'no json' };
    return { data: JSON.parse(m[0]) as T, provider: 'anthropic' };
  } catch (e) {
    return { data: null, provider: 'anthropic', error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
