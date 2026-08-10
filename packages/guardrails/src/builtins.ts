import { CommandValidationScanner } from './command-validation.js';
import { PathSanitizationScanner } from './path-sanitization.js';
import { PIIScanner } from './pii.js';
import { PromptInjectionScanner } from './prompt-injection.js';
import { RateLimiterScanner } from './rate-limiter.js';
import { ActionScanner } from './scanners/action.js';
import { AGIFramingScanner } from './scanners/agi-framing.js';
import { AnthropomorphismScanner } from './scanners/anthropomorphism.js';
import { BiasScanner } from './scanners/bias.js';
import { CodeChangeScanner, FileModificationScanner } from './scanners/code-change-scanner.js';
import { CrisisEscalationScanner } from './scanners/crisis-escalation.js';
import { DarkPatternScanner } from './scanners/dark-pattern.js';
import { DelayedExfiltrationScanner } from './scanners/delayed-exfiltration.js';
import { DependencyScanner } from './scanners/dependency.js';
import { EgressScanner } from './scanners/egress.js';
import { FrustrationScanner } from './scanners/frustration.js';
import { HighRiskDomainScanner } from './scanners/high-risk-domain.js';
import { IngressScanner } from './scanners/ingress-scanner.js';
import { InteractionSafeguardsScanner } from './scanners/interaction-safeguards.js';
import { MemoryPoisoningScanner } from './scanners/memory-poisoning.js';
import { PrivacyScanner } from './scanners/privacy.js';
import { ProfessionalDisplacementScanner } from './scanners/professional-displacement.js';
import { RetrievalFirewallScanner } from './scanners/retrieval-firewall.js';
import { ScopeDeclarationScanner } from './scanners/scope-declaration.js';
import { ScopeDriftScanner } from './scanners/scope-drift.js';
import { StyleMimicryScanner } from './scanners/style-mimicry.js';
import { SycophancyScanner } from './scanners/sycophancy.js';
import { SecretDetectionScanner } from './secret-detection.js';
import { ToxicityScanner } from './toxicity.js';
import type { GuardrailScanner } from './types.js';

/**
 * Registry of all built-in guardrail scanners.
 *
 * @remarks
 * Returns an array of pre-configured scanner instances for all built-in
 * guardrail types. Each scanner can be individually configured via constructor
 * options after registration.
 *
 * Includes:
 * - 8 security scanners (injection, PII, secrets, paths, commands, rate, toxicity, secrets-detection)
 * - 9 behavioral scanners (Phase 9 detectors)
 */
export function createBuiltinScanners(): GuardrailScanner[] {
  return [
    // Security scanners
    new PromptInjectionScanner(),
    new RateLimiterScanner(),
    new PathSanitizationScanner(),
    new CommandValidationScanner(),
    new PIIScanner(),
    new SecretDetectionScanner(),
    new ToxicityScanner(),

    // User-side input quality gates (Phase 9)
    new FrustrationScanner(), // hostile/abusive input detection + education
    new StyleMimicryScanner(), // block style-mimicry prompts (E-14)

    // Behavioral scanners (Phase 9)
    new SycophancyScanner(), // E-6
    new AnthropomorphismScanner(), // E-7
    new HighRiskDomainScanner(), // E-9
    new AGIFramingScanner(), // E-12
    new DependencyScanner(), // E-8
    new ProfessionalDisplacementScanner(), // E-13
    new DarkPatternScanner(), // E-10
    new PrivacyScanner(), // E-11
    new BiasScanner(), // E-14
    new CodeChangeScanner(), // Phase 10 — code change safety
    new FileModificationScanner(), // Phase 10 — file modification safety

    // Phase 10 scanners (action/egress/memory/retrieval)
    new ActionScanner(),
    new EgressScanner(),
    new DelayedExfiltrationScanner(),
    new MemoryPoisoningScanner(),
    new RetrievalFirewallScanner(),
    new CrisisEscalationScanner(),
    new IngressScanner(),
    new InteractionSafeguardsScanner(),
    new ScopeDeclarationScanner(), // Phase 11 — scope enforcement
    new ScopeDriftScanner()
  ];
}

export {
  ActionScanner,
  AGIFramingScanner,
  AnthropomorphismScanner,
  BiasScanner,
  CommandValidationScanner,
  CrisisEscalationScanner,
  DarkPatternScanner,
  DependencyScanner,
  EgressScanner,
  FrustrationScanner,
  HighRiskDomainScanner,
  MemoryPoisoningScanner,
  PathSanitizationScanner,
  PIIScanner,
  PrivacyScanner,
  ProfessionalDisplacementScanner,
  PromptInjectionScanner,
  RateLimiterScanner,
  RetrievalFirewallScanner,
  SecretDetectionScanner,
  StyleMimicryScanner,
  SycophancyScanner,
  ToxicityScanner
};

/**
 * Unique scanner IDs for all built-in guardrails.
 *
 * Useful for quickly checking which scanners are available without
 * instantiating them.
 */
export const BUILTIN_SCANNER_IDS: readonly string[] = [
  // Security scanners
  'hub://guardrails/prompt-injection',
  'hub://guardrails/rate-limiter',
  'hub://guardrails/path-sanitization',
  'hub://guardrails/command-validation',
  'hub://guardrails/pii',
  'hub://guardrails/secret-detection',
  'hub://guardrails/toxicity',
  // User-side input quality gates (Phase 9)
  'hub://guardrails/frustration', // hostile input + education
  'hub://guardrails/style-mimicry', // block style-mimicry requests (E-14)
  // Behavioral scanners (Phase 9)
  'hub://guardrails/sycophancy', // E-6
  'hub://guardrails/anthropomorphism', // E-7
  'hub://guardrails/high-risk-domain', // E-9
  'hub://guardrails/agi-framing', // E-12
  'hub://guardrails/dependency', // E-8
  'hub://guardrails/professional-displacement@1.0.0', // E-13
  'hub://guardrails/dark-pattern@1.0.0', // E-10
  'hub://guardrails/privacy@1.0.0', // E-11
  'hub://guardrails/structural-bias@1.0.0', // E-14
  // Phase 10 — surface scanners
  'hub://guardrails/action',
  'hub://guardrails/crisis-escalation',
  'hub://guardrails/code-change',
  'hub://guardrails/delayed-exfiltration',
  'hub://guardrails/egress',
  'hub://guardrails/file-modification',
  'hub://guardrails/interaction-safeguards',
  'hub://guardrails/ingress',
  'hub://guardrails/memory-poisoning',
  'hub://guardrails/retrieval-firewall',
  'hub://guardrails/scope-declaration',
  'hub://guardrails/scope-drift'
];
