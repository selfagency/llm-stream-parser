
## 46. Phase 30 — Environmental Impact Tracking (CO2 + Water)

**Priority**: P1 — Sprint 3–4 (parallel with Phase 6/8; extends tokenomics)
**Story points**: 6
**Branch**: `feat/environmental-impact-tracking`
**Depends on**: Phase 4 ✅, Phase 5 (provider/region info), Phase 29 (tokenomics boundary cleanup)
**Unblocks**: Phase 20 (environmental data strengthens ethical provider policy), Phase 13 (benchmark env cost reporting)
**Closes**: extends tokenomics from cost-only to full environmental accounting

### 46.1 Goal

Add CO2 emissions and water consumption tracking to `@agentsy/tokenomics`, per-request and cumulatively: energy (kWh) by model tier and execution location (cloud vs local); CO2 (gCO2) using regional carbon intensity; water (mL) from on-site cooling + indirect electricity generation; optimization savings from caching/routing; cumulative per-session/user/team/project totals; relatable comparison reporting.

### 46.2 Research basis

**Energy per AI request:**

- ChatGPT query: ~2.9 Wh (arXiv:2509.07218v1, 2025) — 10× a Google search (~0.3 Wh)
- Global data centers: ~415 TWh in 2024, 1.5% of global electricity (IEA, 2025); projected ~945 TWh by 2030
- US data centers: 183 TWh in 2024, 4% of US electricity (Pew Research, 2025)
- PUE: Google 1.09 (2024); industry 1.1–2.9; immersion cooling 1.02–1.04 (arXiv:2509.07218v1)
- A100 under-clocking: 40% power reduction, 22% performance loss (arXiv:2509.07218v1)

**CO2:**

- Average carbon intensity: ~395.65 gCO2/kWh (IEA cross-calculation, 2024)
- Global data center CO2: ~182 Mt CO2 (2024, IEA); AI specifically: 32.6–79.7 Mt CO2 (2025, NIH/PMC)

**Water:**

- WUE (Water Usage Effectiveness): Amazon 0.12 L/kWh; Microsoft 0.30 L/kWh; Google est. 0.20–0.30; industry avg 0.84 L/kWh (Axis Intelligence, 2026); EESI broader avg 1.9 L/kWh
- Per ChatGPT query: 10–25 mL direct+indirect (UC Riverside, Li et al., arXiv:2304.03271, 2023); 519 mL for 100-word GPT-4 email (Washington Post, 2024)
- Large data centers: up to 5 million gallons/day (Brookings, 2026)
- US data centers: 17 billion gallons direct water in 2023 (LBNL 2024 Report)
- Global AI data centers: 264 billion gallons (≈1 trillion liters) in 2025 (Mordor Intelligence via Axis Intelligence, 2026)
- Three components: on-site cooling (WUE), indirect electricity water (grid type), manufacturing water (chips — excluded per-request)

**Sources:**

- IEA Energy and AI: <https://www.iea.org/reports/energy-and-ai>
- Pew Research: <https://www.pewresearch.org/short-reads/2025/10/24/what-we-know-about-energy-use-at-us-data-centers-amid-the-ai-boom/>
- arXiv:2509.07218v1: <https://arxiv.org/html/2509.07218v1>
- EESI Water: <https://www.eesi.org/articles/view/data-centers-and-water-consumption>
- Brookings Water: <https://www.brookings.edu/articles/ai-data-centers-and-water/>
- Axis Intelligence Water: <https://axis-intelligence.com/ai-data-center-water-usage-statistics/>
- Axis Intelligence Energy: <https://axis-intelligence.com/ai-data-center-energy-consumption-statistics/>
- Google Efficiency: <https://datacenters.google/efficiency/>
- LBNL 2024 Report: <https://eta-publications.lbl.gov/sites/default/files/2024-12/lbnl-2024-united-states-data-center-energy-usage-report_1.pdf>
- IEA-4E Review: <https://www.iea-4e.org/wp-content/uploads/2025/05/Data-Centre-Energy-Use-Critical-Review-of-Models-and-Results.pdf>
- ELI Water Fact Sheet: <https://www.eli.org/sites/default/files/files-pdf/Data%20Centers%20and%20Water%20Fact%20Sheet%20ELI%20January%202026%20%281%29.pdf>
- Ceres Drained by Data: <https://www.ceres.org/resources/reports/drained-by-data-the-cumulative-impact-of-data-centers-on-regional-water-stress>
- LBNL Water Efficiency: <https://datacenters.lbl.gov/water-efficiency>

### 46.3 Design — formulas

```text
ENERGY:
  E_compute = (total_tokens / 1000) × energy_per_1K_tokens_Wh[tier]
  E_total = E_compute × PUE                  (cloud)
  E_total = E_compute                        (local, no PUE)

CO2:
  CO2 = (E_total / 1000) × carbon_intensity[gCO2/kWh][region]

WATER:
  W_direct = (E_total / 1000) × WUE[L/kWh][provider] × 1000    (mL, on-site cooling)
  W_indirect = (E_total / 1000) × indirect_water[L/kWh][grid_type] × 1000  (mL, electricity gen)
  W_total = W_direct + W_indirect

Grid type from carbon intensity:
  > 400 gCO2/kWh → fossil → 2.5 L/kWh indirect water
  > 200 gCO2/kWh → mixed → 1.5 L/kWh
  ≤ 200 gCO2/kWh → renewable → 0.3 L/kWh

SAVINGS (when model routing saves tokens):
  E_saved = (tokens_saved / 1000) × energy_per_1K[tier] × PUE
  CO2_saved = (E_saved / 1000) × carbon_intensity
  W_saved = (E_saved / 1000) × (WUE + indirect_water) × 1000

CACHE HIT:
  E = 0.01 Wh (network transfer only)
  Savings = full_request_energy - 0.01 Wh
```

### 46.4 Implementation

**New files in `@agentsy/tokenomics`** (all under `src/environmental/`):

- `energy-tiers.ts` — 4 tiers (edge 0.05 Wh/1K, foundation 0.2, mid-tier 0.8, frontier 2.9) + `classifyModelEnergyTier()`
- `carbon-intensity.ts` — 12 region entries (AWS, GCP, Azure, local) + `getCarbonIntensity()`
- `water-usage.ts` — WUE by provider (Amazon 0.12, Azure 0.30, GCP 0.25, local 0, default 0.84) + indirect water by grid type
- `impact-calculator.ts` — `calculateEnvironmentalImpact()` implementing the formulas above
- `cumulative-tracker.ts` — per-session/user/team/project aggregation
- `local-measurement.ts` — GPU/CPU power measurement for local inference (nvidia-smi on Linux, powermetrics on macOS, fallback to estimates)
- `realtime-intensity.ts` — optional Electricity Maps API integration (5-min cache, fallback to static table)

**New `UnifiedDB` table**: `environmental_impact` (links to `session_ledger` via `request_id`)

**Integration**:

- `CostTracker.recordCost()` optionally calls `EnvironmentalImpactCalculator` when present (daemon mode)
- Phase 20 per-session warning can show cumulative env impact per provider
- Phase 13 langeval benchmarks report their own environmental cost
- CLI: `agentsy env impact`, `agentsy env breakdown`, `agentsy env savings`, `agentsy env export`

### 46.5 Accuracy and limitations

**This is an approximation, not a measurement.** Cloud API energy is estimated (within 2-3×). PUE varies by facility. Carbon intensity changes hourly (optional real-time API improves this). Water has three components; we track two (excluded: chip manufacturing water, ~10-30% of lifecycle). Local inference is more accurate (actual power measurement). Savings are estimated from token deltas. Documented in README. Goal: meaningful approximation making impact visible, not scientific precision. Users needing precision should use CodeCarbon or Green Algorithms for local workloads.

### 46.6 Verification

- [ ] 4 model energy tiers with estimates matching research
- [ ] 12+ carbon intensity entries for major cloud regions
- [ ] WUE entries for AWS, Azure, GCP, local, default
- [ ] `calculateEnvironmentalImpact()` works for cloud and local requests
- [ ] Cache-hit impact near-zero with savings
- [ ] Cumulative tracking per session/user/team/project
- [ ] `environmental_impact` table in `UnifiedDB`
- [ ] CLI `agentsy env impact` produces report
- [ ] CLI `agentsy env breakdown` and `agentsy env savings` work
- [ ] Per-session warning can display cumulative env impact
- [ ] Local measurement works on Linux; falls back gracefully elsewhere
- [ ] Real-time API (optional) works with Electricity Maps key
- [ ] Limitations documented in README
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---
