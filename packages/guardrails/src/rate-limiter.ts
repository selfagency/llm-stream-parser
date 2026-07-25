import type { GuardrailResult, GuardrailScanner } from './types.js';

/**
 * Time window configuration for rate limiting.
 *
 * @internal
 */
interface RateWindow {
  maxRequests: number;
  windowMs: number;
}

/**
 * Per-key rate limit entry.
 *
 * @internal
 */
interface RateEntry {
  count: number;
  resetAt: number;
}

/**
 * Key type discriminator for per-type default limits.
 */
export type KeyType = 'tool' | 'user' | 'agent';

/**
 * Default per-key-type rate limits.
 *
 * - tool calls: 20/min (prevent runaway tool execution)
 * - user messages: 30/min (reasonable human typing speed)
 * - agent-to-agent calls: 50/min (higher throughput for trusted agents)
 */
const DEFAULT_KEY_TYPE_LIMITS: Record<KeyType, RateWindow> = {
  tool: { maxRequests: 20, windowMs: 60_000 },
  user: { maxRequests: 30, windowMs: 60_000 },
  agent: { maxRequests: 50, windowMs: 60_000 }
};

/**
 * Scanner that enforces per-key rate limits.
 *
 * @remarks
 * Tracks request counts per key within a sliding window. Designed to
 * prevent runaway tool execution and abuse.
 *
 * Default limits vary by key type (tool, user, agent) and are
 * configurable per agent via the constructor.
 *
 * OWASP: ASI-03 (Excessive Agency)
 */
export class RateLimiterScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/rate-limiter',
    name: 'Rate Limiter Scanner',
    version: '1.1.0',
    description: 'Enforces per-key rate limits to prevent runaway tool execution',
    priority: 5,
    owaspCategories: ['asi-03'] as const,
    tags: ['rate-limiting', 'dos-prevention', 'resource-control']
  };

  readonly #entries = new Map<string, RateEntry>();
  readonly #customLimits = new Map<string, number>();
  readonly #keyDefaults: Record<string, RateWindow>;

  constructor(config?: {
    /** Per-key-type default overrides. */
    defaults?: Partial<Record<KeyType, { maxRequests: number; windowMs: number }>>;
    /** Legacy: overrides maxRequests for ALL key types. */
    maxRequests?: number;
    /** Legacy: overrides windowMs for ALL key types. */
    windowMs?: number;
  }) {
    const flatMax = config?.maxRequests;
    const flatWin = config?.windowMs ?? 60_000;

    this.#keyDefaults = {
      tool: {
        maxRequests: flatMax ?? config?.defaults?.tool?.maxRequests ?? DEFAULT_KEY_TYPE_LIMITS.tool.maxRequests,
        windowMs: config?.defaults?.tool?.windowMs ?? flatWin
      },
      user: {
        maxRequests: flatMax ?? config?.defaults?.user?.maxRequests ?? DEFAULT_KEY_TYPE_LIMITS.user.maxRequests,
        windowMs: config?.defaults?.user?.windowMs ?? flatWin
      },
      agent: {
        maxRequests: flatMax ?? config?.defaults?.agent?.maxRequests ?? DEFAULT_KEY_TYPE_LIMITS.agent.maxRequests,
        windowMs: config?.defaults?.agent?.windowMs ?? flatWin
      }
    };
  }

  /**
   * Set a specific rate limit cap for a key (overrides the default maxRequests).
   */
  setLimit(key: string, maxRequests: number): void {
    const existing = this.#entries.get(key);
    this.#entries.set(key, {
      count: existing?.count ?? 0,
      resetAt: existing?.resetAt ?? Date.now() + this.#keyDefaults.tool.windowMs
    });
    this.#customLimits.set(key, maxRequests);
  }

  /**
   * Reset the rate counter for a key.
   */
  resetKey(key: string): void {
    this.#entries.delete(key);
    this.#customLimits.delete(key);
  }

  /**
   * Reset all rate counters.
   */
  reset(): void {
    this.#entries.clear();
    this.#customLimits.clear();
  }

  /**
   * Reset all rate counters (alias).
   */
  resetAll(): void {
    this.#entries.clear();
    this.#customLimits.clear();
  }

  /**
   * Infer the key type from context.
   */
  #resolveKeyType(context?: Record<string, unknown>): KeyType {
    if (context?.toolName !== undefined) {
      return 'tool';
    }
    const key = (context?.rateLimitKey as string) ?? '';
    if (key.startsWith('agent_')) {
      return 'agent';
    }
    return 'user';
  }

  evaluate(_input: string, context?: Record<string, unknown>): Promise<GuardrailResult> {
    const key = (context?.rateLimitKey as string) ?? (context?.toolName as string) ?? 'default';
    const keyType = this.#resolveKeyType(context);
    const typeDefault = this.#keyDefaults[keyType];
    const maxRequests = this.#customLimits.get(key) ?? (context?.rateLimitMax as number) ?? typeDefault.maxRequests;
    const now = Date.now();

    let entry = this.#entries.get(key);

    // If no entry or window expired, start fresh
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + typeDefault.windowMs };
      this.#entries.set(key, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const resetIn = Math.ceil((entry.resetAt - now) / 1000);
      return Promise.resolve({
        status: 'block',
        phase: 'tool-input',
        reason: `Rate limit exceeded for key "${key}": ${entry.count - maxRequests} over limit (resets in ${resetIn}s)`,
        detections: [
          {
            id: 'rate-limit-exceeded',
            description: `Rate limit exceeded for key "${key}": ${entry.count}/${maxRequests}`,
            severity: 'high'
          }
        ]
      });
    }

    return Promise.resolve({ status: 'pass', phase: 'tool-input' });
  }
}
