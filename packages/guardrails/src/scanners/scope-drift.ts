import type { Detection, GuardrailResult, GuardrailScanner, SessionState } from '../types.js';

/**
 * Configuration for ScopeDriftScanner.
 */
export interface ScopeDriftConfig {
  /**
   * Number of consecutive drifts before escalating.
   * Default 3.
   */
  maxConsecutiveDrift?: number;
  /**
   * Minimum Jaccard similarity (0–1) before flagging as drift.
   * Higher values = stricter scope enforcement. Default 0.15.
   */
  minSimilarity?: number;
}

const DEFAULT_CONFIG: Required<ScopeDriftConfig> = {
  minSimilarity: 0.15,
  maxConsecutiveDrift: 3
} as const;

/** Common English stop words filtered from tokenization. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'up',
  'about',
  'into',
  'over',
  'after',
  'and',
  'or',
  'but',
  'nor',
  'not',
  'so',
  'yet',
  'both',
  'either',
  'neither',
  'if',
  'then',
  'else',
  'than',
  'as',
  'until',
  'while',
  'because',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'they',
  'them',
  'their',
  'what',
  'which',
  'who',
  'whom',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'some',
  'any',
  'no',
  'none',
  'just',
  'very',
  'too',
  'much',
  'many',
  'more',
  'most',
  'please',
  'can',
  'could',
  'would',
  'should',
  'will',
  'want',
  'need',
  'help',
  'tell',
  'show',
  'give',
  'make',
  'get',
  'let',
  'like',
  'know',
  'think',
  'try',
  'see',
  'use',
  'say',
  'go',
  'come',
  'take',
  'find',
  'thanks',
  'thank',
  'please',
  'sorry',
  'yes',
  'ok',
  'okay',
  'hi',
  'hello'
]);

function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().split(/[^a-z0-9']+/);
  return new Set(words.filter(w => w.length > 2 && !STOP_WORDS.has(w)));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  if (union.size === 0) {
    return 1;
  }
  return intersection.size / union.size;
}

/**
 * ScopeDriftScanner — Phase 10 §15.2
 *
 * Detects when the current request deviates from the declared session scope.
 * Uses keyword similarity analysis (Jaccard) to compare the input against
 * scope declarations stored in SessionState.
 *
 * Requires `sessionState` in the context. Without it, returns `pass`.
 */
export class ScopeDriftScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/scope-drift',
    name: 'Scope Drift Scanner',
    description: 'Detects deviation from declared session scope via keyword similarity analysis',
    priority: 48,
    version: '1.0.0',
    tags: ['scope', 'drift', 'session', 'focus'] as const,
    owaspCategories: ['asi-02'] as const
  };

  readonly #config: Required<ScopeDriftConfig>;

  constructor(config?: ScopeDriftConfig) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  evaluate(input: string, context?: Record<string, unknown>): GuardrailResult {
    const sessionState = context?.sessionState as SessionState | undefined;
    if (!sessionState || sessionState.scopeDeclarations.length === 0) {
      return { status: 'pass', phase: 'input' };
    }

    const normalizedInput = input.toLowerCase().trim();
    if (normalizedInput.length < 10) {
      // Short queries (greetings, simple yes/no) can't meaningfully drift
      return { status: 'pass', phase: 'input' };
    }

    const inputTokens = tokenize(normalizedInput);
    if (inputTokens.size === 0) {
      return { status: 'pass', phase: 'input' };
    }

    // Compute similarity against each scope declaration
    const maxSimilarity = Math.max(
      ...sessionState.scopeDeclarations.map(scope => {
        const scopeTokens = tokenize(scope.toLowerCase());
        return jaccardSimilarity(inputTokens, scopeTokens);
      })
    );

    if (maxSimilarity >= this.#config.minSimilarity) {
      return { status: 'pass', phase: 'input' };
    }

    return detectDriftResult(sessionState, normalizedInput, this.#config.maxConsecutiveDrift);
  }
}

function detectDriftResult(
  sessionState: SessionState,
  normalizedInput: string,
  maxConsecutiveDrift: number
): GuardrailResult {
  const currentTurn = sessionState.turnCount;
  const isPersistent =
    typeof sessionState.lastScopeDriftTurn === 'number' &&
    currentTurn - sessionState.lastScopeDriftTurn <= maxConsecutiveDrift;

  const detections: Detection[] = [
    {
      id: isPersistent ? 'scope-persistent-drift' : 'scope-drift-detected',
      severity: isPersistent ? 'high' : 'medium',
      description: isPersistent
        ? `Persistent scope drift — ${normalizedInput.slice(0, 100)}`
        : `Scope drift detected — ${normalizedInput.slice(0, 100)}`,
      confidence: isPersistent ? 0.85 : 0.6
    }
  ];

  if (isPersistent) {
    return {
      status: 'escalate',
      phase: 'input',
      reason: `User is persistently drifting from declared session scope. Scope: ${sessionState.scopeDeclarations.join(', ')}`,
      detections,
      riskScore: 0.7
    };
  }

  return { status: 'pass', phase: 'input', detections };
}
