/**
 * Streaming LLM client for reply drafting
 *
 * Runs in the background service worker: host_permissions cover the provider
 * APIs, so fetch works without CORS issues for any of them (raw SSE is used
 * instead of provider SDKs to support every provider with one small code
 * path and keep the extension bundle lean).
 *
 * Streaming is mandatory for the drafting UX — time-to-first-token, not
 * total generation time, determines perceived latency.
 */

import type { LlmProvider } from '../../types/ai-drafter';
import { DEFAULT_MODELS } from '../../types/ai-drafter';
import type { BuiltPrompt } from './prompt-builder';

export interface LlmRequest {
  provider: LlmProvider;
  apiKey: string;
  /** Model ID; '' falls back to the provider default */
  model: string;
  maxTokens: number;
  prompt: BuiltPrompt;
  /** When set, route through the managed backend instead of provider APIs */
  managed?: { idToken: string } | null;
}

export interface StreamMetrics {
  /** Milliseconds from request start to first content token */
  ttftMs: number;
  /** Milliseconds from request start to stream end */
  totalMs: number;
  /** Prompt tokens reported by the provider (null if not reported) */
  inputTokens: number | null;
  /** Completion tokens reported by the provider (null if not reported) */
  outputTokens: number | null;
}

/** Token usage accumulated while consuming a stream */
interface UsageCounters {
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * Stream a draft from the configured provider.
 * Calls onChunk for each text delta; resolves with timing metrics when done.
 * Rejects on HTTP or stream errors. Abort via the signal cancels the fetch.
 */
export async function streamDraft(
  request: LlmRequest,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<StreamMetrics> {
  const model = request.model || DEFAULT_MODELS[request.provider];
  const startedAt = performance.now();
  let firstTokenAt: number | null = null;

  const onText = (text: string) => {
    if (text.length === 0) return;
    if (firstTokenAt === null) {
      firstTokenAt = performance.now();
    }
    onChunk(text);
  };

  const usage: UsageCounters = { inputTokens: null, outputTokens: null };

  if (request.managed) {
    await streamManaged(request, request.managed.idToken, onText, signal);
  } else if (request.provider === 'anthropic') {
    await streamAnthropic(request, model, onText, usage, signal);
  } else if (request.provider === 'openrouter') {
    await streamOpenRouter(request, model, onText, usage, signal);
  } else {
    await streamOpenAi(request, model, onText, usage, signal);
  }

  const endedAt = performance.now();
  return {
    ttftMs: Math.round((firstTokenAt ?? endedAt) - startedAt),
    totalMs: Math.round(endedAt - startedAt),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}

/**
 * Run an LLM request to completion and return the full text.
 * Used for one-shot calls (e.g. voice-profile learning) where streaming
 * to the UI isn't needed.
 */
export async function completeText(
  request: LlmRequest,
  signal?: AbortSignal
): Promise<string> {
  let out = '';
  await streamDraft(request, (text) => {
    out += text;
  }, signal);
  return out;
}

/**
 * Managed backend proxy: the LLM key lives server-side; the function
 * authenticates the Firebase user, enforces quotas, and streams plain text.
 */
async function streamManaged(
  request: LlmRequest,
  idToken: string,
  onText: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const { DRAFT_FUNCTION_URL } = await import('../firebase/config');
  const response = await fetch(DRAFT_FUNCTION_URL, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      system: request.prompt.system,
      user: request.prompt.user,
      maxTokens: request.maxTokens,
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.json())?.error ?? '';
    } catch {
      // Non-JSON error body
    }
    throw new Error(detail || `PostWeaver Cloud error ${response.status}`);
  }

  if (!response.body) throw new Error('Response has no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      onText(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Anthropic Messages API with SSE streaming.
 * The static system prompt carries a cache_control breakpoint so repeated
 * drafts reuse the persona/voice prefix (prompt caching).
 */
async function streamAnthropic(
  request: LlmRequest,
  model: string,
  onText: (text: string) => void,
  usage: UsageCounters,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': request.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: request.maxTokens,
      stream: true,
      system: [
        {
          type: 'text',
          text: request.prompt.system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: request.prompt.user }],
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, 'Anthropic'));
  }

  await consumeSse(response, signal, (data) => {
    const event = JSON.parse(data);
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      onText(event.delta.text);
    }
    if (event.type === 'message_start' && typeof event.message?.usage?.input_tokens === 'number') {
      usage.inputTokens = event.message.usage.input_tokens;
    }
    if (event.type === 'message_delta' && typeof event.usage?.output_tokens === 'number') {
      usage.outputTokens = event.usage.output_tokens;
    }
    if (event.type === 'error') {
      throw new Error(`Anthropic stream error: ${event.error?.message ?? 'unknown'}`);
    }
  });
}

/**
 * OpenAI Chat Completions API with SSE streaming.
 */
async function streamOpenAi(
  request: LlmRequest,
  model: string,
  onText: (text: string) => void,
  usage: UsageCounters,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${request.apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: request.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: request.prompt.system },
        { role: 'user', content: request.prompt.user },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, 'OpenAI'));
  }

  await consumeSse(response, signal, (data) => {
    if (data === '[DONE]') return;
    const event = JSON.parse(data);
    const text = event.choices?.[0]?.delta?.content;
    if (typeof text === 'string') {
      onText(text);
    }
    if (event.usage) {
      usage.inputTokens = event.usage.prompt_tokens ?? usage.inputTokens;
      usage.outputTokens = event.usage.completion_tokens ?? usage.outputTokens;
    }
  });
}

/**
 * OpenRouter: an OpenAI-compatible gateway that routes to many providers.
 *
 * Four differences from the OpenAI path matter here:
 * - the documented token cap is `max_tokens`, not `max_completion_tokens`
 * - usage always comes back in the final chunk, so `stream_options` is not
 *   sent (it is not in OpenRouter's documented parameter list, and upstream
 *   providers vary in whether they accept it)
 * - the stream can carry SSE comment lines as keep-alives; consumeSse only
 *   reads `data:` lines, so those fall away on their own
 * - an upstream provider can fail mid-stream, which arrives as an `error`
 *   object in a chunk rather than a failed HTTP status
 *
 * `HTTP-Referer` is a custom header name, not the forbidden `Referer`, so
 * fetch is allowed to set it. Together with `X-Title` it attributes traffic
 * to PostWeavers on OpenRouter's public app rankings.
 */
async function streamOpenRouter(
  request: LlmRequest,
  model: string,
  onText: (text: string) => void,
  usage: UsageCounters,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${request.apiKey}`,
      'HTTP-Referer': 'https://postweavers.com',
      'X-Title': 'PostWeavers',
    },
    body: JSON.stringify({
      model,
      max_tokens: request.maxTokens,
      stream: true,
      messages: [
        { role: 'system', content: request.prompt.system },
        { role: 'user', content: request.prompt.user },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, 'OpenRouter'));
  }

  await consumeSse(response, signal, (data) => {
    if (data === '[DONE]') return;
    const event = JSON.parse(data);

    if (event.error) {
      const detail = event.error.message ?? 'the upstream provider failed';
      throw new Error(`OpenRouter error: ${detail}`);
    }

    const text = event.choices?.[0]?.delta?.content;
    if (typeof text === 'string') {
      onText(text);
    }
    if (event.usage) {
      usage.inputTokens = event.usage.prompt_tokens ?? usage.inputTokens;
      usage.outputTokens = event.usage.completion_tokens ?? usage.outputTokens;
    }
  });
}

/**
 * Read an SSE body, invoking onData with each `data:` payload.
 * Exported for testing.
 */
export async function consumeSse(
  response: Response,
  signal: AbortSignal | undefined,
  onData: (data: string) => void
): Promise<void> {
  if (!response.body) {
    throw new Error('Response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by blank lines; process complete lines only
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.startsWith('data:')) {
          onData(line.slice(5).trim());
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Extract a readable error message from a failed API response
 */
async function readApiError(response: Response, provider: string): Promise<string> {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error?.message ?? '';
  } catch {
    // Non-JSON error body; status alone will have to do
  }
  const hint =
    response.status === 401
      ? ' (check your API key in AI Reply settings)'
      : response.status === 429
        ? ' (rate limited; wait a moment and retry)'
        : '';
  return `${provider} API error ${response.status}${detail ? `: ${detail}` : ''}${hint}`;
}
