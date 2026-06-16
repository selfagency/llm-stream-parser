# Phase 17 — Micro-Tier Local Offload (NPU & Accelerator-First)

**Authority:** `plan/17-GOVERNANCE-QUALITY-GATES.md`, `plan/00-AUTHORITY-ARCHITECTURE.md` §7
**Created:** 2026-05-28
**Status:** Planned
**Effort:** ~48 hours
**Packages:** `@agentsy/models`, `@agentsy/providers`, `@agentsy/gateway`, `@agentsy/orchestrator`, `@agentsy/context`, `@agentsy/memory`, `@agentsy/guardrails`, `@agentsy/retrieval`, `@agentsy/cli`, `@agentsy/observability`, `@agentsy/testing`
**Gate:** Micro-tier routing live; platform-agnostic fallback chain verified; cost-reduction measured across macOS/Windows/Linux
**Next:** Phase 18 (TBD)

---

## Goal

Route **low-value, high-volume** LLM calls (classification, extraction, summarization, titling, query rewriting, JSON repair, intent gating) to **available on-device accelerators** (Apple Neural Engine, Windows NPU, or CPU-based local models), reducing token spend against paid frontier/cloud providers without degrading quality on the reasoning-heavy calls that actually need them.

This is **not** a frontier replacement. It owns the "free, local, fast, good-enough" tier — the **`micro` tier** — beneath the `small` tier defined in `plan/25-PHASE-16-SMALL-MODEL-PARITY.md`. The leverage is in the **orchestrator routing the right _kinds_ of calls to it**, not in clever model usage.

**Platform-agnostic design:**

- **macOS + Apple Silicon:** Apple Foundation Models (~3B) via **apfel** (NE-accelerated)
- **Windows + NPU:** Small quantized models (3–7B Q4/Q5) via **Ollama** / **LM Studio** / **LocalAI** (NPU-accelerated where supported)
- **Linux + GPU/CPU:** Small quantized models via **Ollama** / **vLLM** (GPU-accelerated, or CPU fallback)
- **Any platform without accelerators:** Graceful fallback to next-cheapest cloud tier (small-local or frontier)

---

## Background: Multi-Platform Micro-Tier Strategy

### macOS + Apple Silicon: Apfel

`apfel` (Arthur-Ficial) is a native Swift wrapper around Apple's `FoundationModels` framework. It exposes the built-in ~3B Apple Intelligence model as:

- a UNIX-style CLI (`apfel "prompt"`)
- an **OpenAI-compatible HTTP server** (`apfel --serve`) at `http://localhost:11434/v1`

100% on-device, no API keys, no per-token cost, runs on the Neural Engine.
Source: <https://github.com/Arthur-Ficial/apfel>

**Constraints:**

| Constraint         | Value                                                                                                                | Implication                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Context window     | ~4,096 tokens (input + output combined, ~3,000 words)                                                                | Hard-cap routed input at ~3,000 tokens; auto-escalate larger payloads    |
| Platform           | Apple Silicon + macOS 26 + Apple Intelligence enabled                                                                | Mandatory non-Darwin / Intel / disabled fallback chain                   |
| Capability ceiling | Sweet spot: summarize, extract, classify, tag, compose, revise, short dialog, guided/structured output, tool calling | Never route multi-hop reasoning, math, codegen, or world-knowledge tasks |
| Port collision     | `11434` is Ollama's default                                                                                          | Profile must support a configurable port; detect/avoid Ollama collision  |

### Windows + NPU / GPU: Ollama / LM Studio / LocalAI

Windows 11 "AI PCs" ship with dedicated NPUs (Qualcomm Snapdragon X, Intel AI Boost, AMD XDNA). Unlike Copilot in Windows (cloud-only, M365-tied), you can run **local open-source models** via:

- **Ollama** — emerging Windows NPU support; mature OpenAI-compatible API
- **LM Studio** — desktop UX + OpenAI-compatible API; GPU/NPU acceleration
- **LocalAI** — lightweight, OpenAI-compatible, supports multiple backends
- **vLLM** — high-performance inference server, DirectML (GPU) support

All expose `http://localhost:{port}/v1` (configurable, not hardcoded to 11434).

**Model choice:** 3–7B quantized (Q4/Q5/Q6 GGUF format). Examples:

- Llama 3.2 3B (fast, good for classification/extraction)
- Qwen 2.5 7B (slightly slower, better reasoning for the micro tier)
- Mistral 7B (balanced)

**Constraints:**

| Constraint         | Value                                                   | Implication                                                          |
| ------------------ | ------------------------------------------------------- | -------------------------------------------------------------------- |
| Context window     | 4K–32K (model-dependent)                                | Typically 8K–16K for 3–7B; same 3,000-token safe budget as Apfel     |
| Platform           | Windows 11 + NPU/GPU (or CPU fallback)                  | Graceful degradation to CPU inference if no accelerator              |
| Capability ceiling | Same as Apfel (summarize, extract, classify, tag, etc.) | Model quality varies; Q4 quantization acceptable for micro tier      |
| Port collision     | Configurable; detect running instance                   | Avoid port conflicts with Apfel (11434), Ollama (11434), vLLM (8000) |
| Setup friction     | Requires user to download/run Ollama/LM Studio          | Mitigate with auto-discovery + clear setup guidance in CLI           |

### Linux + GPU/CPU: Ollama / vLLM

Linux servers often have GPUs (NVIDIA CUDA, AMD ROCm). Use the same Ollama/vLLM stack as Windows, but with mature GPU support.

**No NPU support yet** on consumer Linux (Intel Arc, AMD RDNA are GPU, not NPU). CPU inference is slower but still viable for micro-tier tasks.

### All Platforms: Fallback Chain

If no local accelerator is available or reachable:

```text
micro tier attempt → fallback to small-local (Ollama 7B) → fallback to cloud (cheap frontier)
```

This ensures **zero user-visible errors** on non-accelerator hardware.

### Why NOT Copilot in Windows?

Copilot in Windows is:

- **Cloud-only** (GPT-based, Microsoft-hosted)
- **Not a model provider API** (no OpenAI-compatible endpoint)
- **Tenant/M365-tied** (data governance, licensing, compliance boundaries)
- **End-user UX** (taskbar, Win+C, voice), not headless

So it doesn't fit the "cheap local tier" design. Treat it as a _tool_ (e.g., "generate PowerPoint via Graph API"), not as a `ModelProvider`.

### Sources reviewed

- <https://github.com/Arthur-Ficial/apfel>
- <https://machinelearning.apple.com/research/apple-foundation-models-2025-updates>
- <https://developer.apple.com/documentation/FoundationModels>
- <https://developer.apple.com/documentation/FoundationModels/generating-content-and-performing-tasks-with-foundation-models>
- <https://www.natashatherobot.com/p/apple-foundation-models>
- <https://www.infoq.com/news/2026/03/apple-foundation-models-context/>
- <https://arxiv.org/abs/2507.13575>
- <https://support.microsoft.com/en-us/microsoft-copilot/getting-started-with-copilot-on-windows>
- <https://www.cdw.com/content/cdw/en/articles/software/3-ways-to-take-advantage-of-microsofts-copilot-in-windows.html>
- <https://www.plainconcepts.com/microsoft365-copilot-guide/>
- <https://blogs.windows.com/windows-insider/2025/10/09/copilot-on-windows-connectors-and-document-creation/>

---

## Design Philosophy

1. **Tier-routed, not model-routed** — the orchestrator selects a _capability tier_ (`micro | small | mid | frontier`); the system probes for available local accelerators (Apfel, Ollama, LM Studio, etc.) and uses the first healthy one. Call sites declare _intent_, never a hardcoded model.

2. **Accelerator-first, cloud-fallback** — when a task is `micro` and a local accelerator is healthy, use it. Cost is zero (or near-zero) and latency is sub-second on-device. If no accelerator is available or reachable, gracefully fall through to the next tier (small-local or cloud) without surfacing an error.

3. **Platform-agnostic discovery** — detect what's available on the current system:
   - macOS + Apple Silicon + Apple Intelligence → Apfel (NE-accelerated)
   - Windows + NPU/GPU → Ollama/LM Studio/LocalAI (NPU/GPU-accelerated)
   - Linux + GPU/CPU → Ollama/vLLM (GPU-accelerated or CPU fallback)
   - No accelerators → skip to cloud tier

4. **Always-escalate-on-doubt** — schema-validation failure, low confidence, or oversized input bumps the call up one tier deterministically. Never silently degrade.

5. **Guided generation is the contract** — use structured output (typed schemas) to enforce format contracts; reuse the Phase-16 format-contract + repair-loop machinery rather than free-form prompting. Works across all micro backends (Apfel supports guided generation; Ollama/LM Studio with small models can be prompted for structured output).

6. **Boundary discipline** — `@agentsy/models` owns platform detection, profile/capability/routing decision; `@agentsy/providers` owns the OpenAI-compatible wire adapter (reused across all backends); `@agentsy/runtime`+`@agentsy/gateway` own lifecycle and failover. No FFI to Swift or Windows APIs — integrate exclusively through HTTP shims (Apfel's, Ollama's, etc.).

---

## Adoption 1: Multi-Platform Micro-Tier Provider Profiles & Discovery

**Target packages:** `@agentsy/models`, `@agentsy/providers`, `@agentsy/gateway`
**Builds on:** `plan/05-PHASE-3-MODEL-SELECTION.md` (TASK-016 local discovery), `packages/models/IMPLEMENTATION-PLAN.md` §"Local Provider Coverage Matrix" (apfel profile already spec'd)

### TASK-APF-001: Platform Detection & Accelerator Probing

**Effort:** 3h
**Location:** `packages/models/src/local-providers/accelerator-detect.ts`

Unified platform detection that probes for available accelerators in priority order:

```typescript
export interface AcceleratorCapability {
  type: "apple-ne" | "windows-npu" | "gpu-cuda" | "gpu-rocm" | "gpu-metal" | "cpu";
  available: boolean;
  estimatedMemoryGb: number;
  estimatedPeakThroughputTokensPerSec?: number;
}

export interface PlatformProfile {
  os: "darwin" | "win32" | "linux";
  arch: "arm64" | "x64";
  accelerators: AcceleratorCapability[];
  recommendedMicroBackend: "apfel" | "ollama" | "lm-studio" | "localai" | "vllm" | "cpu-only";
  appleIntelligenceEnabled?: boolean;
  reason: string;
}

export async function detectPlatform(): Promise<PlatformProfile> {
  const os = process.platform as "darwin" | "win32" | "linux";
  const arch = process.arch as "arm64" | "x64";
  const accelerators: AcceleratorCapability[] = [];

  // macOS + Apple Silicon: probe Apfel
  if (os === "darwin" && arch === "arm64") {
    const apfel = await detectApfel();
    if (apfel.reachable && apfel.platformEligible) {
      accelerators.push({ type: "apple-ne", available: true, estimatedMemoryGb: 8 });
    }
  }

  // Windows: probe NPU, then GPU
  if (os === "win32") {
    const npu = await detectWindowsNpu();
    if (npu.available) {
      accelerators.push({ type: "windows-npu", available: true, estimatedMemoryGb: npu.memoryGb });
    }
    const gpu = await detectWindowsGpu();
    if (gpu.available) {
      accelerators.push({ type: "gpu-cuda", available: true, estimatedMemoryGb: gpu.memoryGb });
    }
  }

  // Linux: probe GPU (CUDA/ROCm)
  if (os === "linux") {
    const cuda = await detectCuda();
    if (cuda.available) {
      accelerators.push({ type: "gpu-cuda", available: true, estimatedMemoryGb: cuda.memoryGb });
    }
    const rocm = await detectRocm();
    if (rocm.available) {
      accelerators.push({ type: "gpu-rocm", available: true, estimatedMemoryGb: rocm.memoryGb });
    }
  }

  // macOS: Metal GPU fallback
  if (os === "darwin") {
    const metal = await detectMetal();
    if (metal.available) {
      accelerators.push({ type: "gpu-metal", available: true, estimatedMemoryGb: metal.memoryGb });
    }
  }

  // Recommend backend based on priority
  const recommended = recommendBackend(os, arch, accelerators);

  return {
    os,
    arch,
    accelerators,
    recommendedMicroBackend: recommended.backend,
    appleIntelligenceEnabled: recommended.appleIntelligenceEnabled,
    reason: recommended.reason,
  };
}

function recommendBackend(
  os: string,
  arch: string,
  accelerators: AcceleratorCapability[],
): { backend: string; appleIntelligenceEnabled?: boolean; reason: string } {
  // Priority: Apfel > NPU > GPU > CPU
  if (accelerators.some((a) => a.type === "apple-ne" && a.available)) {
    return {
      backend: "apfel",
      appleIntelligenceEnabled: true,
      reason: "Apple Neural Engine detected",
    };
  }
  if (accelerators.some((a) => a.type === "windows-npu" && a.available)) {
    return { backend: "ollama", reason: "Windows NPU detected; recommend Ollama with NPU support" };
  }
  if (accelerators.some((a) => a.type === "gpu-cuda" && a.available)) {
    return { backend: "ollama", reason: "NVIDIA GPU detected; recommend Ollama with CUDA" };
  }
  if (accelerators.some((a) => a.type === "gpu-rocm" && a.available)) {
    return { backend: "ollama", reason: "AMD GPU detected; recommend Ollama with ROCm" };
  }
  if (accelerators.some((a) => a.type === "gpu-metal" && a.available)) {
    return { backend: "ollama", reason: "Metal GPU detected; recommend Ollama with Metal" };
  }
  return { backend: "cpu-only", reason: "No accelerators detected; CPU fallback" };
}
```

### TASK-APF-002: Apfel LocalProviderProfile

**Effort:** 2h
**Location:** `packages/models/src/local-providers/apfel.ts`

Implement the apfel profile that is already specified (but unimplemented) in `packages/models/IMPLEMENTATION-PLAN.md`. Apfel is the preferred `micro` backend on macOS + Apple Silicon:

```typescript
import type { LocalProviderProfile } from "../types.js";

export const APFEL_PROFILE: LocalProviderProfile = {
  id: "apfel",
  displayName: "Apple Foundation Model (apfel)",
  protocol: "openai-compatible",
  defaultBaseUrl: "http://localhost:11434/v1",
  healthEndpoint: "/models",
  modelsEndpoint: "/models",
  supportsApiKey: false,
  requiresApiKeyByDefault: false,
  supportsTools: true,
  supportsStreaming: true,
  supportsEmbeddings: false,
  notes: [
    "On-device Apple Intelligence ~3B model via FoundationModels.",
    "Apple Silicon + macOS 26 only; requires Apple Intelligence enabled.",
    "~4096 token context (input + output combined).",
    "Default port 11434 collides with Ollama — configurable via APFEL_BASE_URL.",
    "Model id reported as apple-foundationmodel.",
  ],
};
```

### TASK-APF-002: Apfel capability + tier metadata

**Effort:** 1.5h
**Location:** `packages/models/src/catalog/apfel-catalog.ts`

Inject a synthetic catalog entry (apfel is not on models.dev) so the selector can rank it:

```typescript
export interface ModelTier {
  tier: "micro" | "small" | "mid" | "frontier";
}

export const APFEL_MODEL_ENTRY = {
  id: "apple-foundationmodel",
  provider: "apfel",
  tier: "micro" as const,
  contextWindow: 4096, // hard ceiling
  recommendedMaxInputTokens: 3000,
  capabilities: {
    summarization: true,
    extraction: true,
    classification: true,
    tagging: true,
    composition: true,
    revision: true,
    shortDialog: true,
    guidedGeneration: true, // typed structured output
    toolCalling: true,
    reasoning: false, // multi-hop NOT supported
    math: false,
    codeGeneration: false,
    worldKnowledge: false,
  },
  cost: { input: 0, output: 0 }, // on-device, zero marginal cost
  provenance: "local-http" as const,
  platform: { os: "darwin", arch: "arm64", requiresAppleIntelligence: true },
};
```

### TASK-APF-003: Apfel-specific detection

**Effort:** 1.5h
**Location:** `packages/models/src/local-providers/apfel-detect.ts`

```typescript
export interface ApfelAvailability {
  reachable: boolean;
  platformEligible: boolean; // darwin + arm64
  appleIntelligenceLikely: boolean;
  baseUrl: string;
  reportedModelId?: string; // expect 'apple-foundationmodel'
  collidesWithOllama: boolean; // 11434 in use by a non-apfel server
  reason?: string;
}

export async function detectApfel(
  baseUrl = process.env.APFEL_BASE_URL ?? "http://localhost:11434/v1",
  timeoutMs = 2000,
): Promise<ApfelAvailability> {
  // 1. platform gate (process.platform === 'darwin' && process.arch === 'arm64')
  // 2. GET {baseUrl}/models with timeout
  // 3. confirm model list contains 'apple-foundationmodel' (distinguish from Ollama)
  // 4. set collidesWithOllama if 11434 responds but model id is NOT apple-foundationmodel
}
```

**Quality gates:** never throws on a closed port; 2s timeout (consistent with TASK-016); distinguishes apfel from a colliding Ollama daemon by reported model id.

### TASK-APF-004: Ollama / LM Studio / LocalAI detection (Windows/Linux)

**Effort:** 2h
**Location:** `packages/models/src/local-providers/ollama-detect.ts`, `lm-studio-detect.ts`, `localai-detect.ts`

Probe for running instances of popular local model servers. Each returns the same interface:

```typescript
export interface LocalModelServerAvailability {
  type: "ollama" | "lm-studio" | "localai" | "vllm";
  reachable: boolean;
  baseUrl: string;
  models: Array<{ id: string; contextWindow: number; quantization?: string }>;
  estimatedMemoryGb: number;
  supportedAccelerators: Array<"npu" | "gpu-cuda" | "gpu-rocm" | "gpu-metal" | "cpu">;
  reason?: string;
}

export async function detectOllama(
  baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
  timeoutMs = 2000,
): Promise<LocalModelServerAvailability> {
  // GET {baseUrl}/models
  // Check for running models
  // Infer accelerator from model names + Ollama logs
}

export async function detectLmStudio(
  baseUrl = process.env.LM_STUDIO_BASE_URL ?? "http://localhost:1234/v1",
  timeoutMs = 2000,
): Promise<LocalModelServerAvailability> {
  // GET {baseUrl}/models
  // Check for running models
}

export async function detectLocalAi(
  baseUrl = process.env.LOCALAI_BASE_URL ?? "http://localhost:8080/v1",
  timeoutMs = 2000,
): Promise<LocalModelServerAvailability> {
  // GET {baseUrl}/models
  // Check for running models
}
```

**Default ports:**

- Ollama: `11434`
- LM Studio: `1234`
- LocalAI: `8080`
- vLLM: `8000`

All configurable via environment variables. Probes in parallel with 2s timeout each; returns first healthy instance.

### TASK-APF-005: Micro-backend selection & fallback chain

**Effort:** 2h
**Location:** `packages/models/src/local-providers/micro-backend-selector.ts`

Given the platform profile (TASK-APF-001) and available backends, select the best micro backend and build a fallback chain:

```typescript
export interface MicroBackendSelection {
  primary: LocalProviderProfile;
  fallbacks: LocalProviderProfile[];
  reason: string;
}

export async function selectMicroBackend(
  platform: PlatformProfile,
  availableBackends: LocalModelServerAvailability[],
): Promise<MicroBackendSelection> {
  // Priority: Apfel > Ollama (with accelerator) > LM Studio > LocalAI > vLLM > CPU-only
  // Build fallback chain: primary → next-best-local → cloud-small → cloud-frontier
}
```

This ensures the orchestrator has a deterministic, ordered list to try.

### TASK-APF-006: Gateway multi-backend profile registration

**Effort:** 2h
**Location:** `packages/gateway/src/profiles/micro-backends/`

Register all micro backends (Apfel, Ollama, LM Studio, LocalAI, vLLM) as Tier-0 (local) gateway profiles (see `plan/06-PHASE-3.5-LLM-GATEWAY.md` TASK-LB-005). Wire into `ProfileRegistry` + `ProviderRegistry`. Reuse the existing OpenAI-compatible `UniversalClient` — **no new wire protocol code**.

Each profile specifies:

- Base URL (configurable via env)
- Model list endpoint
- Health check endpoint
- Supported accelerators
- Estimated cost (zero for all)

All profiles share the same wire protocol (OpenAI-compatible), so the adapter layer is reused.

---

## Adoption 2: Capability-Tier Routing

**Target packages:** `@agentsy/models`, `@agentsy/orchestrator`, `@agentsy/gateway`
**Builds on:** `plan/25-PHASE-16-SMALL-MODEL-PARITY.md` (TASK-SM-003 complexity estimator), `plan/05-PHASE-3-MODEL-SELECTION.md` (TASK-013 selector)

### TASK-APF-007: Tier annotation on selection contracts

**Effort:** 2h
**Location:** `packages/models/src/types.ts`, `packages/models/src/index.ts`

Extend `TaskRequirements` / `ModelSelectionResult` with an explicit tier:

```typescript
export type CapabilityTier = "micro" | "small" | "mid" | "frontier";

export interface TaskRequirements {
  // ...existing fields
  tier?: CapabilityTier; // requested floor
  maxInputTokens?: number; // routing uses this to gate micro tier
  allowLocalOffload?: boolean; // default true
}

export interface ModelSelectionResult {
  // ...existing fields
  tier: CapabilityTier;
  offloadedToLocal: boolean;
  offloadBackend?: "apfel" | "ollama" | "lm-studio" | "localai" | "vllm";
  escalationReason?: string; // populated when tier was bumped up
}
```

Map Phase-16 `TaskComplexity.recommendedModelSize` to a tier:

- `3b` → `micro`
- `7b`/`14b` → `small`
- `30b`/`70b` → `mid`
- `frontier` → `frontier`

### TASK-APF-008: Micro-tier router (platform-agnostic)

**Effort:** 4h
**Location:** `packages/orchestrator/src/micro-router.ts`

Deterministic, side-effect-free routing decision that tries backends in priority order:

```typescript
export interface MicroRouteDecision {
  backend: "apfel" | "ollama" | "lm-studio" | "localai" | "vllm" | "cpu-only" | "cloud-small";
  modelId: string;
  providerId: string;
  baseUrl: string;
  reason: string;
  escalated: boolean;
}

export async function routeMicroTask(input: {
  requirements: TaskRequirements;
  estimatedInputTokens: number;
  platform: PlatformProfile;
  microBackendSelection: MicroBackendSelection;
}): Promise<MicroRouteDecision> {
  const { requirements, estimatedInputTokens, platform, microBackendSelection } = input;

  // Escalate if not a micro task
  if (requirements.tier && requirements.tier !== "micro") {
    return escalate("requested tier above micro");
  }
  // Escalate oversized payloads (3000 safe budget across all backends)
  if (estimatedInputTokens > 3000) {
    return escalate("input exceeds safe context budget for micro tier");
  }
  // Try primary backend
  if (await isHealthy(microBackendSelection.primary)) {
    return useBackend(microBackendSelection.primary);
  }
  // Try fallbacks in order
  for (const fallback of microBackendSelection.fallbacks) {
    if (await isHealthy(fallback)) {
      return useBackend(fallback);
    }
  }
  // All local backends exhausted; escalate to cloud
  return escalate("no local micro backends available");
}
```

### TASK-APF-009: Escalation-on-failure wrapper

**Effort:** 3h
**Location:** `packages/orchestrator/src/micro-escalation.ts`

Wrap a micro call so a schema-validation failure or low-confidence result deterministically re-runs at the next tier. Reuse the Phase-16 repair loop (TASK-SM-007) **before** escalating, capped at `maxRepairAttempts` (default 2):

```typescript
export async function runMicroWithEscalation<T>(opts: {
  decision: MicroRouteDecision;
  invoke: (backend: string, modelId: string) => Promise<{ output: string; raw: unknown }>;
  validate: (output: string) => { ok: boolean; issues: RepairIssue[]; confidence: number };
  repair?: (output: string, issues: RepairIssue[]) => Promise<string>;
  escalateTo: { providerId: string; modelId: string; tier: CapabilityTier };
  minConfidence?: number; // default 0.6
  maxRepairAttempts?: number; // default 2
}): Promise<{ result: T; backendUsed: string; escalated: boolean }>;
```

### TASK-APF-010: Gateway tier-aware failover

**Effort:** 2h
**Location:** `packages/gateway/src/tier-failover.ts`

Extend Phase-3.5 `retryWithFailover` (TASK-LB-014) so micro-backend circuit-opening (or absence) routes to the next tier rather than failing. Platform-ineligible backends must be treated as permanently OPEN (no retry storm on non-matching hardware).

---

### TASK-APF-011: Tokens — compression & conversation summarization offload

**Effort:** 2h
**Location:** `packages/context/src/compression/`

Route `compressConversation()` summarization passes and DCP `compress`-tool summary generation (TASK-DCP-001/007) through the micro tier. Biggest single savings lever: every stale-turn summary that would have hit a paid model now runs on-device. Falls back to `compressOutput()` (deterministic, non-LLM) if no micro backend reachable.

### TASK-APF-012: Memory — wiki synthesis & fact extraction offload

**Effort:** 3h
**Location:** `packages/memory/src/extraction/`, `packages/memory/src/wiki/`

Route `FactExtractor.extract()` (TASK-032) and `wiki.synthesize()` (TASK-031 wiki hook) through the micro tier. Extraction + summarization are Apple's named sweet spot, batchable, and PII stays on-device — **better** than a cloud model for this. Chunk long event logs to respect the 3,000-token budget; emit one micro call per chunk, then a micro reduce pass (two-stage decomposition, TASK-SM-005).

### TASK-APF-013: Guardrails — input/output classification offload

**Effort:** 3h
**Location:** `packages/guardrails/src/classify/`

Pre-flight classification: safe/on-topic/toxicity/PII tagging on input and streamed output, plus tool-call-vs-chat intent gating. Runs synchronously on-device with no network hop. Uses guided generation (typed enum output) for a hard format contract.

> **Hook/Prompt Axiom (00-AUTHORITY §8.6):** guardrail _classification_ may run on micro backends, but the **blocking decision** remains in a deterministic `block: true` hook. The model's classification is advisory input to the deterministic gate — never the gate itself.

### TASK-APF-014: Retrieval — query rewriting & chunk summarization offload

**Effort:** 2h
**Location:** `packages/retrieval/src/query/`, `packages/retrieval/src/index/`

Route HyDE-style query expansion (Phase 8) and index-time chunk summarization through the micro tier. Short input, short output, embarrassingly parallel — ideal on-device workload. Reranking _scoring_ stays in retrieval; only the natural-language rewrite/summarize steps offload.

### TASK-APF-015: Core/Session/CLI — structured repair, titling, slugs

**Effort:** 2h
**Location:** `packages/core/src/structured/`, `packages/session/src/`, `packages/cli/src/`

- `@agentsy/core`: malformed partial-JSON repair pass using guided generation against a target schema.
- `@agentsy/session`: auto-titling sessions, short slug/filename generation, UI conversation summaries.
- `@agentsy/cli`: command suggestion, slash-command autocomplete, error-message humanization, commit-message drafting — sub-second on-device beats any remote model for interactive feedback.

---

## Adoption 4: Surfacing, Config & Observability

**Target packages:** `@agentsy/cli`, `@agentsy/observability`, `@agentsy/configuration`

### TASK-APF-016: Config schema (multi-backend)

**Effort:** 2h
**Location:** `packages/cli/src/config/micro-tier.ts` (XDG layering per 00-AUTHORITY §6)

```typescript
export interface MicroTierConfig {
  enabled: boolean; // default true
  autoDetect: boolean; // default true; probe for available backends
  preferredBackend?: "apfel" | "ollama" | "lm-studio" | "localai" | "vllm"; // override auto-selection

  // Per-backend overrides
  backends: {
    apfel?: { baseUrl?: string; enabled?: boolean };
    ollama?: { baseUrl?: string; enabled?: boolean; modelId?: string };
    lmStudio?: { baseUrl?: string; enabled?: boolean; modelId?: string };
    localAi?: { baseUrl?: string; enabled?: boolean; modelId?: string };
    vllm?: { baseUrl?: string; enabled?: boolean; modelId?: string };
  };

  // Global micro-tier settings
  maxInputTokens: number; // default 3000
  offloadTargets: {
    compression: boolean;
    factExtraction: boolean;
    wikiSynthesis: boolean;
    guardrailClassification: boolean;
    queryRewrite: boolean;
    chunkSummarization: boolean;
    sessionTitling: boolean;
    jsonRepair: boolean;
    cliAssist: boolean;
  };

  escalation: { minConfidence: number; maxRepairAttempts: number };
}
```

All targets default `true`; the router still gates each call on availability + token budget.

### TASK-APF-017: CLI commands & status (multi-backend)

**Effort:** 2h
**Location:** `packages/cli/src/commands/micro.ts`, slash registry in `@agentsy/plugins`

```text
agentsy micro status           # show all detected backends + health
agentsy micro detect           # re-probe for available backends
agentsy micro test             # round-trip a tiny classification prompt on primary
agentsy micro config           # show current micro-tier config
/micro status                  # inline status
/micro on | off                # toggle local offload for the session
/micro prefer <backend>        # switch preferred backend mid-session
```

Status table mirrors the `/lb status` style (TASK-LB-016), color-coded:
✓ green (reachable+eligible), ⚠ yellow (eligible, unreachable), ✗ red (platform ineligible).

Shows all detected backends + their accelerators:

```text
Micro-Tier Backends
───────────────────────────────────────────────────────────────
Backend        Status    Model(s)              Accelerator    Port
───────────────────────────────────────────────────────────────
apfel          ✓         apple-foundationmodel NE             11434
ollama         ✓         llama3.2:3b           GPU (CUDA)     11434
lm-studio      ⚠         (not running)         —              1234
localai        ✗         (platform ineligible) —              8080
vllm           ✗         (not running)         —              8000
```

### TASK-APF-018: Observability — offload metrics & savings accounting

**Effort:** 2h
**Location:** `packages/observability/src/metrics/offload.ts`

Emit structured fields through tslog (00-AUTHORITY §8.11): per offload target — calls routed to micro backends, escalations (with reason), tokens served on-device, **estimated cloud tokens/cost avoided** (priced against the would-have-been fallback model from models.dev). This is the artifact that proves the cost-reduction goal.

```typescript
export interface OffloadMetrics {
  target: string; // 'compression' | 'fact-extraction' | ...
  backend: string; // 'apfel' | 'ollama' | 'lm-studio' | ...
  routedToMicro: number;
  escalated: number;
  escalationReasons: Record<string, number>;
  tokensOnDevice: number;
  estimatedTokensAvoided: number;
  estimatedUsdAvoided: number;
}
```

---

## Adoption 5: Testing & Fixtures

**Target packages:** `@agentsy/testing`
**Builds on:** `plan/18-PHASE-AIMOCK-INTEGRATION.md` (aImock fixtures), `plan/25-PHASE-16-SMALL-MODEL-PARITY.md` (TASK-SM-010 scorecard)

### TASK-APF-019: aImock fixtures for all micro backends

**Effort:** 3h
**Location:** `packages/testing/src/fixtures/micro-backends/`

Since CI runs on Linux (no Apple Silicon, no Windows NPU), **all** micro-backend paths are fixture-driven (per 00-AUTHORITY: fixture-only tests for platform-gated providers). Record/replay responses via aImock at each backend's default port. Mandatory cases:

- platform-ineligible → router falls through to fallback chain, circuit stays OPEN, no retry storm
- Ollama-collision detection (11434 responds with non-`apple-foundationmodel` id)
- oversized input (>3000 tokens) → deterministic escalation
- schema-validation failure → repair loop → escalation after `maxRepairAttempts`
- happy path → on-device output accepted, savings metric emitted
- all backends healthy → primary selected, others in fallback chain
- primary fails → fallback tried, succeeds

### TASK-APF-020: Multi-backend integration tests

**Effort:** 2h
**Location:** `packages/testing/src/micro-backends.test.ts`

- Platform detection returns correct accelerators
- Backend selection respects priority order
- Failover chain tried in order
- Micro-tier router gates on input size
- Escalation wrapper repairs then bumps tier
- Non-matching platform → circuit permanently OPEN
- All offload targets route through micro tier with availability + budget gating

### TASK-APF-021: Offload scorecard (multi-backend)

**Effort:** 2h
**Location:** `packages/testing/src/micro-scorecard.ts`

Extend the Phase-16 scorecard (TASK-SM-010) to measure micro-tier quality per offload target and per backend: format pass-rate, adherence, factuality vs injected facts, escalation rate, p50/p95 latency, and **net estimated savings**. Rubric: Green ≥95% format pass-rate AND escalation rate ≤10%; Yellow 80–95%; Red <80% (target should not offload).

---

## Timeline

| Task                                                | Effort        | Dependencies              |
| --------------------------------------------------- | ------------- | ------------------------- |
| APF-001: Platform detection & accelerator probing   | 3h            | None                      |
| APF-002: Apfel LocalProviderProfile                 | 2h            | APF-001                   |
| APF-003: Apfel-specific detection                   | 1.5h          | None                      |
| APF-004: Ollama/LM Studio/LocalAI detection         | 2h            | None                      |
| APF-005: Micro-backend selection & fallback chain   | 2h            | APF-001..004              |
| APF-006: Gateway multi-backend profile registration | 2h            | APF-002..005, Phase 3.5   |
| APF-007: Tier annotation on selection contracts     | 2h            | Phase 16 SM-003           |
| APF-008: Micro-tier router (platform-agnostic)      | 4h            | APF-001..007              |
| APF-009: Escalation-on-failure wrapper              | 3h            | APF-008, Phase 16 SM-007  |
| APF-010: Gateway tier-aware failover                | 2h            | APF-006, APF-008          |
| APF-011: Tokens compression offload                 | 2h            | APF-008, Phase 21 DCP-007 |
| APF-012: Memory wiki/fact offload                   | 3h            | APF-008, Phase 7          |
| APF-013: Guardrails classification offload          | 3h            | APF-008                   |
| APF-014: Retrieval rewrite/summarize offload        | 2h            | APF-008, Phase 8          |
| APF-015: Core/Session/CLI structured offload        | 2h            | APF-008                   |
| APF-016: Config schema (multi-backend)              | 2h            | APF-008                   |
| APF-017: CLI commands & status (multi-backend)      | 2h            | APF-001..005, APF-016     |
| APF-018: Observability offload metrics              | 2h            | APF-008, Phase 9          |
| APF-019: aImock fixtures for all micro backends     | 3h            | APF-008, Phase 18         |
| APF-020: Multi-backend integration tests            | 2h            | APF-019                   |
| APF-021: Offload scorecard (multi-backend)          | 2h            | APF-019, Phase 16 SM-010  |
| **Total**                                           | **~48 hours** |                           |

---

## Integration Points

| Component                | Integration                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `@agentsy/models`        | Platform detection, all micro-backend profiles, synthetic catalog entries, tier metadata, multi-backend selection |
| `@agentsy/providers`     | Reuse OpenAI-compatible `UniversalClient` against all micro-backend base URLs (no new protocol)                   |
| `@agentsy/gateway`       | Tier-0 profiles for all backends, tier-aware failover, platform-OPEN circuit semantics                            |
| `@agentsy/orchestrator`  | Micro-tier router + escalation wrapper; tags call sites with tier intent                                          |
| `@agentsy/context`       | Conversation summarization + DCP compress-tool summaries offloaded                                                |
| `@agentsy/memory`        | Fact extraction + wiki synthesis offloaded (PII stays on-device)                                                  |
| `@agentsy/guardrails`    | Classification advisory only; blocking stays in deterministic hook                                                |
| `@agentsy/retrieval`     | Query rewrite + chunk summarization offloaded                                                                     |
| `@agentsy/core`          | Guided-generation JSON repair pass                                                                                |
| `@agentsy/session`       | Auto-titling, slugs, conversation summaries                                                                       |
| `@agentsy/cli`           | Config, `micro`/`/micro` commands, status table, backend detection                                                |
| `@agentsy/observability` | Offload metrics + estimated-savings accounting per backend                                                        |
| `@agentsy/testing`       | aImock fixtures for all backends, multi-backend integration tests, offload scorecard                              |

---

## Dependencies on Existing Phases

- **Phase 3 (Model Selection):** local discovery (TASK-016), selector (TASK-013).
- **Phase 3.5 (Gateway):** profile registry, `UniversalClient`, failover (TASK-LB-005/014).
- **Phase 7 (Memory):** fact extraction (TASK-032), wiki hook (TASK-031).
- **Phase 8 (RAG):** query expansion, chunk pipeline.
- **Phase 9 (Observability):** metrics infrastructure (TASK-LB-OBS).
- **Phase 16 (Small Model Parity):** complexity estimator (SM-003), two-stage decomposition (SM-005), format contract (SM-006), repair loop (SM-007), scorecard (SM-010).
- **Phase 18 (aImock):** fixture record/replay for the multi-backend CI path.
- **Phase 21 (DCP/tokens):** compress tool (DCP-001/007).

> Sequencing: schedule **after Phase 16** (depends on its tier/decomposition/repair primitives) and **after Phase 9** (needs metrics to prove savings). Platform detection + multi-backend profiles (APF-001..006) can begin opportunistically once Phase 3.5 lands.

---

## Risks & Mitigations

| Risk                                                                             | Mitigation                                                                                          |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Port collisions (11434 Apfel vs Ollama, 1234 LM Studio, 8080 LocalAI, 8000 vLLM) | Env var overrides; detection distinguishes backends by reported model id; status surfaces conflicts |
| Apple-Silicon/macOS-26-only — no CI coverage for Apfel                           | Fixture-only tests (aImock); platform gate forces circuit permanently OPEN off-platform             |
| Windows NPU support immature in Ollama                                           | Graceful fallback to GPU/CPU; Ollama already supports CUDA/ROCm; NPU support added incrementally    |
| 4k context overflow mid-stream                                                   | Hard 3,000-token routing cap; oversized payloads auto-escalate before invocation                    |
| Quality regression on a target                                                   | Offload scorecard gates each target; Red rubric disables offload for that target                    |
| Savings overstated                                                               | Metrics price avoided tokens against the _actual_ fallback model from models.dev, not a fixed rate  |
| Boundary leakage (selection doing wire calls)                                    | Strict `models` vs `providers` contract tests (existing repo rule)                                  |
| Guardrail safety weakened                                                        | Hook/Prompt Axiom enforced: micro-backend classification is advisory; blocking stays deterministic  |
| User friction: "I have to install Ollama/LM Studio"                              | Auto-detection + clear setup guidance in CLI; fallback to cloud if no local backend available       |

---

## Success Criteria

- [ ] Platform detection identifies available accelerators (Apple NE, Windows NPU, GPU, CPU)
- [ ] Apfel profile implemented and discoverable via local provider probing (macOS)
- [ ] Ollama/LM Studio/LocalAI/vLLM profiles implemented and discoverable (Windows/Linux)
- [ ] Multi-backend selection deterministic; respects priority order (Apfel > NPU > GPU > CPU)
- [ ] Capability tier (`micro|small|mid|frontier`) annotated on all selection contracts
- [ ] Micro-tier router deterministic; oversized input + non-micro tier escalate correctly
- [ ] Escalation wrapper repairs then bumps tier on validation failure / low confidence
- [ ] Platform-ineligible backends stay OPEN (no retry storm) on non-matching hardware
- [ ] All 9 offload targets routed through the micro tier with availability + budget gating
- [ ] Guardrail blocking remains in deterministic hook (Hook/Prompt Axiom upheld)
- [ ] Observability emits per-target per-backend estimated tokens/cost avoided
- [ ] aImock fixtures cover happy path, collision, oversize, escalation, platform-ineligible for all backends
- [ ] Offload scorecard ≥95% format pass-rate and ≤10% escalation on Green targets
- [ ] Measured net cloud token reduction reported for representative dogfood sessions on macOS, Windows, Linux
- [ ] CLI `micro status` shows all detected backends + health + accelerators
- [ ] `pnpm build`, `pnpm check-types`, `pnpm test` green; no circular deps; no `any`
- [ ] Touched package `IMPLEMENTATION-PLAN.md` files + `IMPLEMENTATION-COMPLIANCE-MATRIX.md` updated

---

**Next:** Begin TASK-APF-001 (Platform detection & accelerator probing) — lowest-risk, unblocks all downstream work; or TASK-APF-007 (tier annotation) if Phase 16 lands first.
