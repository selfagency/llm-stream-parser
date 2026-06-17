import type {
  Detection,
  GuardrailDecisionReceipt,
  GuardrailPhase,
  GuardrailResult,
  GuardrailScanner,
  PipelineConfig
} from './types.js';

/**
 * A sequential guardrail evaluation pipeline.
 *
 * Scanners are sorted by `metadata.priority` (ascending) at registration.
 * By default the pipeline short-circuits on the first `block` result.
 */
export class GuardrailPipeline {
  readonly #scanners: GuardrailScanner[] = [];
  #config: PipelineConfig;

  constructor(config?: PipelineConfig) {
    this.#config = { shortCircuitOnBlock: true, promptOnEscalate: false, maxDetections: 50, ...config };
  }

  // ===========================================================================
  // Registration
  // ===========================================================================

  /**
   * Register one or more scanners. They are inserted in priority order.
   */
  add(...scanners: GuardrailScanner[]): void {
    for (const scanner of scanners) {
      this.#scanners.push(scanner);
    }
    this.#scanners.sort((a, b) => a.metadata.priority - b.metadata.priority);
  }

  /**
   * Remove a scanner by its metadata id.
   */
  remove(id: string): boolean {
    const idx = this.#scanners.findIndex(s => s.metadata.id === id);
    if (idx === -1) {
      return false;
    }
    this.#scanners.splice(idx, 1);
    return true;
  }

  /**
   * Replace the pipeline configuration at runtime.
   */
  configure(config: Partial<PipelineConfig>): void {
    this.#config = { ...this.#config, ...config };
  }

  // ===========================================================================
  // Evaluation
  // ===========================================================================

  /**
   * Evaluate all registered scanners against the given input for a phase.
   *
   * Returns `{ result, receipt }` — the most severe result and a full audit
   * receipt. Short-circuits on the first `block` result if configured.
   */
  async evaluate(
    input: string,
    phase: GuardrailPhase,
    context?: Record<string, unknown>
  ): Promise<{ result: GuardrailResult; receipt: GuardrailDecisionReceipt }> {
    const detections: Detection[] = [];
    let currentInput = input;
    let blockResult: GuardrailResult | undefined;
    let transformResult: GuardrailResult | undefined;
    let escalateResult: GuardrailResult | undefined;
    let quarantineResult: GuardrailResult | undefined;
    let approvalResult: GuardrailResult | undefined;

    for (const scanner of this.#scanners) {
      const result = await scanner.evaluate(currentInput, context);
      this.#collectResult(result, detections);

      const ps = this.#applyResult(
        result,
        blockResult,
        transformResult,
        escalateResult,
        quarantineResult,
        approvalResult,
        currentInput
      );
      blockResult = ps.blockResult;
      transformResult = ps.transformResult;
      escalateResult = ps.escalateResult;
      quarantineResult = ps.quarantineResult;
      approvalResult = ps.approvalResult;
      currentInput = ps.input;

      if (result.status === 'block' && (this.#config.shortCircuitOnBlock ?? true)) {
        const receipt = this.#buildReceipt(result, detections, context);
        return { result, receipt };
      }
    }

    const result = this.#resolvePriority(
      blockResult,
      transformResult,
      escalateResult,
      quarantineResult,
      approvalResult,
      detections,
      phase
    );
    const receipt = this.#buildReceipt(result, detections, context);
    return { result, receipt };
  }

  /**
   * Apply a single scanner result, updating priority accumulators and chaining transforms.
   */
  #applyResult(
    result: GuardrailResult,
    blockResult: GuardrailResult | undefined,
    transformResult: GuardrailResult | undefined,
    escalateResult: GuardrailResult | undefined,
    quarantineResult: GuardrailResult | undefined,
    approvalResult: GuardrailResult | undefined,
    currentInput: string
  ): {
    blockResult: GuardrailResult | undefined;
    transformResult: GuardrailResult | undefined;
    escalateResult: GuardrailResult | undefined;
    quarantineResult: GuardrailResult | undefined;
    approvalResult: GuardrailResult | undefined;
    input: string;
  } {
    let escalated = escalateResult;
    let transformed = transformResult;
    let blocked = blockResult;
    let quarantined = quarantineResult;
    let approved = approvalResult;
    let nextInput = currentInput;

    if (result.status === 'block') {
      blocked ??= result;
    }
    if (result.status === 'transform') {
      transformed = result;
      if (result.sanitized !== undefined) {
        nextInput = result.sanitized;
      }
    }
    if (result.status === 'quarantine') {
      quarantined ??= result;
    }
    if (result.status === 'allow-with-approval') {
      approved ??= result;
    }
    if (
      result.status === 'escalate' &&
      (result.riskScore ?? 0) > ((escalated?.status === 'escalate' ? escalated.riskScore : 0) ?? 0)
    ) {
      escalated = result;
    }

    return {
      blockResult: blocked,
      input: nextInput,
      transformResult: transformed,
      escalateResult: escalated,
      quarantineResult: quarantined,
      approvalResult: approved
    };
  }

  /**
   * Resolve the most severe result across all scanners.
   * Priority: block > quarantine > transform > escalate > allow-with-approval > pass.
   */
  #resolvePriority(
    blockResult: GuardrailResult | undefined,
    transformResult: GuardrailResult | undefined,
    escalateResult: GuardrailResult | undefined,
    quarantineResult: GuardrailResult | undefined,
    approvalResult: GuardrailResult | undefined,
    detections: Detection[],
    phase: GuardrailPhase
  ): GuardrailResult {
    if (blockResult) {
      return detections.length > 0 ? { ...blockResult, detections } : blockResult;
    }
    if (quarantineResult) {
      return detections.length > 0 ? { ...quarantineResult, detections } : quarantineResult;
    }
    if (transformResult) {
      return detections.length > 0 ? { ...transformResult, detections } : transformResult;
    }
    if (escalateResult) {
      return detections.length > 0 ? { ...escalateResult, detections } : escalateResult;
    }
    if (approvalResult) {
      return detections.length > 0 ? { ...approvalResult, detections } : approvalResult;
    }
    return { status: 'pass', phase };
  }

  /**
   * Build a decision receipt from a result and detections.
   */
  #buildReceipt(
    result: GuardrailResult,
    detections: Detection[],
    context?: Record<string, unknown>
  ): GuardrailDecisionReceipt {
    const sessionId = (context?.sessionId as string) ?? 'unknown';
    const correlationId = (context?.correlationId as string) ?? `${sessionId}:${Date.now()}`;

    const receipt: GuardrailDecisionReceipt = {
      policyId: 'guardrails:pipeline',
      decision: result.status,
      reasonCode: result.status === 'pass' ? 'NO_ISSUES' : result.status.toUpperCase(),
      riskTier: result.status === 'block' ? 'prohibited' : result.status === 'quarantine' ? 'high' : 'moderate',
      surface: 'input',
      phase: result.phase,
      timestamp: new Date().toISOString(),
      correlationId,
      sessionId,
      detections,
      ...(result.status === 'transform' ? { sanitized: result.sanitized, redactedFields: [] as readonly string[] } : {})
    };
    return receipt;
  }

  /**
   * Collect detections from a result, respecting the max limit.
   */
  #collectResult(result: GuardrailResult, dest: Detection[]): void {
    if (result.status === 'pass') {
      return;
    }
    const detectionList = result.detections ?? [];
    for (const d of detectionList) {
      if (dest.length >= (this.#config.maxDetections ?? 50)) {
        break;
      }
      dest.push(d);
    }
  }

  /**
   * Shortcut to evaluate only `input`-phase scanners.
   */
  evaluateInput(
    input: string,
    context?: Record<string, unknown>
  ): Promise<{ result: GuardrailResult; receipt: GuardrailDecisionReceipt }> {
    return this.evaluate(input, 'input', context);
  }

  /**
   * Shortcut to evaluate only `output`-phase scanners.
   */
  evaluateOutput(
    input: string,
    context?: Record<string, unknown>
  ): Promise<{ result: GuardrailResult; receipt: GuardrailDecisionReceipt }> {
    return this.evaluate(input, 'output', context);
  }

  // ===========================================================================
  // Introspection
  // ===========================================================================

  listScanners(): readonly GuardrailScanner[] {
    return [...this.#scanners];
  }

  get size(): number {
    return this.#scanners.length;
  }

  clear(): void {
    this.#scanners.length = 0;
  }
}
