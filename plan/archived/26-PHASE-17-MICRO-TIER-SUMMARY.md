# Phase 17 Update Summary — Multi-Platform Micro-Tier Offload

**Date:** 2026-05-28  
**Change:** Expanded Apfel-only plan to platform-agnostic multi-backend design  
**Effort:** 38h → 48h (+10h for multi-platform support)  
**Status:** Updated plan document ready for implementation

---

## What Changed

### Original Scope (Apfel-only)

- Hardcoded to macOS + Apple Silicon
- Apfel as the only micro-tier backend
- Fallback: Ollama (small) → cloud
- ~38 hours

### Updated Scope (Multi-Platform)

- **macOS + Apple Silicon:** Apfel (NE-accelerated) ✓
- **Windows + NPU/GPU:** Ollama / LM Studio / LocalAI (NPU/GPU-accelerated) ✓
- **Linux + GPU/CPU:** Ollama / vLLM (GPU-accelerated or CPU fallback) ✓
- **Any platform without accelerators:** Graceful fallback to cloud tier ✓
- ~48 hours (10h additional for platform detection, multi-backend selection, config, testing)

---

## Key Design Decisions

### 1. Platform-Agnostic Tier Routing

The `micro` tier is now a **platform-independent abstraction**:

- Call sites declare `tier: 'micro'` (not "use Apfel")
- The orchestrator probes for available accelerators
- Uses the first healthy backend in priority order: **Apfel > NPU > GPU > CPU**

### 2. Unified OpenAI-Compatible API

All micro backends expose `http://localhost:{port}/v1`:

- Apfel: `11434` (configurable via `APFEL_BASE_URL`)
- Ollama: `11434` (configurable via `OLLAMA_BASE_URL`)
- LM Studio: `1234` (configurable via `LM_STUDIO_BASE_URL`)
- LocalAI: `8080` (configurable via `LOCALAI_BASE_URL`)
- vLLM: `8000` (configurable via `VLLM_BASE_URL`)

Reuses the existing `UniversalClient` adapter — **no new wire protocol code**.

### 3. Accelerator Detection

New task **APF-001** (3h) probes for available hardware:

- **macOS + arm64:** Apple Neural Engine (Apfel)
- **Windows:** NPU (Snapdragon X, Intel AI Boost, AMD XDNA), then GPU (CUDA)
- **Linux:** GPU (CUDA, ROCm), then CPU fallback
- Returns a `PlatformProfile` with priority-ordered accelerators

### 4. Multi-Backend Selection

New task **APF-005** (2h) builds a fallback chain:

```text
Primary: Apfel (if macOS+arm64+eligible)
Fallback 1: Ollama (if running + healthy)
Fallback 2: LM Studio (if running + healthy)
Fallback 3: LocalAI (if running + healthy)
Fallback 4: vLLM (if running + healthy)
Fallback 5: Cloud small-tier (if all local backends exhausted)
```

### 5. Why NOT Copilot in Windows?

Copilot in Windows is:

- **Cloud-only** (GPT-based, Microsoft-hosted)
- **Not a model provider API** (no OpenAI-compatible endpoint)
- **Tenant/M365-tied** (data governance, licensing boundaries)
- **End-user UX** (taskbar, Win+C, voice), not headless

Treat it as a *tool* (e.g., "generate PowerPoint via Graph API"), not as a `ModelProvider`.

---

## New Tasks (vs. Original Plan)

| Task | Effort | Purpose |
|------|--------|---------|
| **APF-001** | +3h | Platform detection & accelerator probing (replaces APF-001/002) |
| **APF-004** | +2h | Ollama/LM Studio/LocalAI/vLLM detection (new) |
| **APF-005** | +2h | Multi-backend selection & fallback chain (new) |
| **APF-006** | +1h | Gateway multi-backend profile registration (vs. single Apfel) |
| **APF-016** | +0.5h | Config schema expanded for all backends |
| **APF-017** | +0.5h | CLI commands expanded for multi-backend |
| **APF-019** | +1h | aImock fixtures for all backends (vs. Apfel only) |
| **APF-020** | +2h | Multi-backend integration tests (new) |
| **Total Delta** | **+10h** | |

---

## Implementation Order

### Phase 1: Platform Detection (APF-001..006)

- Detect available accelerators
- Register all micro-backend profiles in gateway
- Build fallback chain

### Phase 2: Routing & Escalation (APF-007..010)

- Tier annotation on contracts
- Micro-tier router (platform-agnostic)
- Escalation wrapper
- Gateway failover

### Phase 3: Offload Targets (APF-011..015)

- Route all 9 offload targets through micro tier
- Same as original plan

### Phase 4: Config & Observability (APF-016..018)

- Multi-backend config schema
- CLI commands for all backends
- Per-backend metrics

### Phase 5: Testing (APF-019..021)

- aImock fixtures for all backends
- Integration tests
- Offload scorecard

---

## File Updates

- **`plan/26-PHASE-17-APFEL-ONDEVICE-OFFLOAD.md`** → renamed to **`26-PHASE-17-MICRO-TIER-LOCAL-OFFLOAD.md`** (title updated)
- **`plan/INDEX.md`** — entry updated with new title + 48h effort
- **`plan/00-AUTHORITY-ARCHITECTURE.md`** — no changes needed (already platform-agnostic in layer model)
- **`plan/00-EXECUTIVE-SUMMARY.md`** — no changes needed (Phase 17 listed as planned)

---

## Backward Compatibility

- Existing Apfel-only code paths work unchanged
- Multi-backend selection is additive (new detection, new router, but same offload targets)
- All backends use the same OpenAI-compatible adapter
- Fallback chain ensures zero user-visible errors on non-accelerator hardware

---

## Next Steps

1. **Review** this updated plan
2. **Begin TASK-APF-001** (Platform detection) — lowest-risk, unblocks all downstream work
3. **Or begin TASK-APF-007** (Tier annotation) if Phase 16 lands first
4. **Sequence after Phase 16 + Phase 9** (depends on tier/repair/metrics infrastructure)

---

**Authority:** User feedback + multi-platform design recommendation (2026-05-28)
