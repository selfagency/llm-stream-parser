

## 39. Phase 25 — MITM Egress Proxy for Subprocess Network Interception (DEFERRED — Post-v1)

**Priority**: P4 — Deferred. Ships alongside or shortly after Phase 24 (Teams). Can run in local mode (Topology A/B) but is most valuable in server mode (Topology C) where untrusted subprocesses run on shared infrastructure.
**Story points**: ~12 (preliminary)
**Branch**: `feat/mitm-egress-proxy` (not yet created)
**Depends on**: Phase 10 §15.7 extension (`SubprocessSpec.networkPolicy` plumbing + `IngressScanner`), Phase 12 (guardrails daemon integration — the proxy runs the guardrail pipeline), Phase 21 (Docker tooling — `mitmproxy` runs as a Docker container), Phase 24.1 (local Docker Compose — the proxy is a compose service). Soft dependency: Phase 20 (ethical policy — the proxy enforces provider blocks at the network layer too).
**Unblocks**: real-time inspection of arbitrary subprocess network traffic, blocking of jailbreaks in fetched content, per-subprocess network policy enforcement
**Status**: DEFERRED — design complete, implementation not started

> **Why deferred**: Phase 10 §15.7 closes the highest-risk ingress paths (MCP servers, `http_fetch`) by scanning at the daemon-controlled transport layer. Phase 25 extends coverage to arbitrary subprocesses (build runners, `curl` in shell commands, linters fetching rules) that make their own network connections. This is valuable but not blocking for v1 — most agent workflows use the daemon-controlled tools. Phase 25 becomes critical in server mode (Phase 24) where untrusted subprocesses run on shared infrastructure.

### 39.1 Goal

Run a guardrail-aware MITM (man-in-the-middle) HTTP/HTTPS proxy as a daemon service. Every subprocess with `networkPolicy.mode === 'proxy-inspect'` (set via the Phase 10 §15.7.5 plumbing) routes its HTTP/HTTPS traffic through the proxy. The proxy:

1. **Intercepts every request and response in real time** — including HTTPS, via a daemon-local CA installed into subprocess trust stores.
2. **Runs the guardrail pipeline on every request** — `EgressScanner` (URL allowlist, PII/secret scan on outbound payload), `StyleMimicryScanner` (Phase 20 — block style-mimicry prompts even in subprocess traffic), provider-ethics checks (block xAI endpoints even if a subprocess tries to call them directly).
3. **Runs the guardrail pipeline on every response** — `IngressScanner` (Phase 10 §15.7.2 — prompt-injection detection on response bodies), `PromptInjectionScanner`, disk-spill for oversized responses.
4. **Enforces per-subprocess network policy** — allowlist, blocklist, domain restrictions, size limits.
5. **Emits `GuardrailDecisionReceipt`s** for every blocked or transformed request/response, persisted to `UnifiedDB.guardrail_decisions` for audit.
6. **Handles WebSocket and SSE** — not just plain HTTP, since MCP servers increasingly use these transports.

### 39.2 Design

#### 40.2.1 Implementation choice: `mitmproxy` in Docker

Rather than building a custom Node.js proxy (which would need to handle CONNECT tunneling, HTTPS decryption, WebSocket interception, and certificate generation — easily 2000+ lines), Phase 25 uses [`mitmproxy`](https://mitmproxy.org/) running in a Docker container with an agentsy addon script.

**Why mitmproxy**:
- Mature, battle-tested, handles HTTPS/WebSocket/SOCKS5 out of the box
- Scriptable via Python addons — the agentsy addon calls the daemon's guardrail pipeline over a local IPC channel
- Runs in Docker (reuses Phase 21's `DockerAvailabilityChecker` and resource-awareness patterns)
- Active maintenance, known security posture
- Handles the tricky parts (CA generation, certificate per-domain signing, CONNECT tunneling) for free

**Why not a custom Node.js proxy**:
- HTTPS interception requires a per-connection TLS context with a dynamically-signed certificate — Node.js can do this but it's ~500 lines of fiddly `tls.createSecureContext` code
- WebSocket interception requires upgrading the connection and parsing frames bidirectionally — another ~300 lines
- CA management (generation, trust-store installation, rotation) is another ~200 lines
- Total: ~1000+ lines of security-critical code that mitmproxy already provides and tests

**The agentsy mitmproxy addon** (~200 lines of Python):

```python
# docker/mitm-addon/agentsy_intercept.py

import json
import urllib.request
from mitmproxy import http, ctx

AGENTSY_GUARDRAIL_ENDPOINT = "http://127.0.0.1:9381/guardrail/scan"  # daemon's local REST endpoint

def request(flow: http.HTTPFlow) -> None:
    """Inspect outbound request before it's sent."""
    policy = get_subprocess_policy(flow.client_conn.peername)
    if policy is None:
        return  # Not a proxied subprocess

    scan_request = {
        "direction": "egress",
        "subprocessId": policy["subprocessId"],
        "url": flow.request.pretty_url,
        "method": flow.request.method,
        "headers": dict(flow.request.headers),
        "body": flow.request.get_text() or "",
        "policy": policy,
    }

    result = call_guardrail(scan_request)
    if result["status"] == "block":
        flow.response = http.Response.make(
            403, json.dumps({"error": result["reason"]}), {"Content-Type": "application/json"}
        )
        ctx.log.warn(f"Blocked egress to {flow.request.pretty_url}: {result['reason']}")
    elif result["status"] == "transform":
        flow.request.set_text(result["sanitized"])

def response(flow: http.HTTPFlow) -> None:
    """Inspect response body before it's returned to the subprocess."""
    policy = get_subprocess_policy(flow.client_conn.peername)
    if policy is None or not policy.get("inspectResponses", True):
        return

    body = flow.response.get_text() or ""
    scan_request = {
        "direction": "ingress",
        "subprocessId": policy["subprocessId"],
        "url": flow.request.pretty_url,
        "contentType": flow.response.headers.get("content-type", ""),
        "body": body,
        "bodySizeBytes": len(body.encode()),
        "policy": policy,
    }

    result = call_guardrail(scan_request)
    if result["status"] == "block":
        flow.response = http.Response.make(
            403, json.dumps({"error": result["reason"]}), {"Content-Type": "application/json"}
        )
        ctx.log.warn(f"Blocked ingress from {flow.request.pretty_url}: {result['reason']}")
    elif result["status"] == "transform":
        flow.response.set_text(result["sanitized"])

def call_guardrail(payload: dict) -> dict:
    """Call the daemon's guardrail scan endpoint."""
    try:
        req = urllib.request.Request(
            AGENTSY_GUARDRAIL_ENDPOINT,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())
    except Exception as e:
        ctx.log.error(f"Guardrail endpoint unavailable: {e}")
        # Fail-open (return pass) — a downed guardrail service should not
        # block all subprocess network access. The daemon logs the failure.
        return {"status": "pass"}

def get_subprocess_policy(peer_ip: str) -> dict | None:
    """Look up the network policy for the subprocess making this request.

    The daemon maintains a registry of subprocessId → networkPolicy.
    The proxy identifies the subprocess by the client connection's peer IP.
    For local proxy (single daemon), all subprocesses share 127.0.0.1,
    so identification is by port range (each subprocess gets a unique
    ephemeral port range) or by an X-Agentsy-Subprocess header injected
    at the env layer.

    Simplest: the daemon's guardrail endpoint resolves subprocessId from
    the source port (which it knows because it spawned the subprocess).
    """
    # Query the daemon for the policy based on source port
    # (the daemon tracks subprocessId → pid → source port range)
    pass
```

#### 40.2.2 Daemon-side guardrail scan endpoint

The daemon exposes a local REST endpoint (port 9381, localhost only) that the mitmproxy addon calls:

```typescript
// packages/daemon/src/api/guardrail-scan.ts (NEW)

export function registerGuardrailScanEndpoint(server: HttpServer, pipeline: GuardrailPipeline) {
  server.post('/guardrail/scan', async (req, res) => {
    const payload = await parseBody(req);

    // Resolve subprocess policy from source port or X-Agentsy-Subprocess header
    const subprocessId = resolveSubprocessId(req);
    const policy = getNetworkPolicy(subprocessId);

    // Run the appropriate scanner
    const input: IngressScanInput | EgressScanInput = payload.direction === 'ingress'
      ? { sourceUrl: payload.url, sourceType: 'subprocess-stdout', body: payload.body, bodySizeBytes: payload.bodySizeBytes }
      : { url: payload.url, method: payload.method, body: payload.body, headers: payload.headers };

    const result = await pipeline.evaluate(input, {
      phase: 'egress',
      sessionId: getSessionId(subprocessId),
      networkPolicy: policy,
    });

    // Persist receipt (Phase 4)
    await auditLogger.log(result.receipt);

    res.json(result.result);
  });
}
```

#### 40.2.3 CA generation and trust-store installation

At daemon first-run (or when Phase 25 is enabled), the daemon generates a local CA:

```typescript
// packages/daemon/src/services/ca-manager.ts (NEW)

export class CAAuthority {
  private caPath = path.join(os.homedir(), '.agentsy', 'ca');
  private certPath = path.join(this.caPath, 'agentsy-ca.pem');
  private keyPath = path.join(this.caPath, 'agentsy-ca-key.pem');

  async ensureExists(): Promise<void> {
    if (existsSync(this.certPath) && existsSync(this.keyPath)) return;
    await this.generate();
  }

  private async generate(): Promise<void> {
    // Generate a self-signed CA certificate (RSA 4096, 10-year validity)
    // Using node-forge or node:crypto's X509Certificate API (Node 19+)
    mkdirSync(this.caPath, { recursive: true, mode: 0o700 });
    // ... generate CA cert + key, write to disk with restrictive permissions ...
  }

  getCertPath(): string { return this.certPath; }

  async rotate(): Promise<void> {
    // Generate a new CA; the proxy picks it up on restart.
    // Old CA remains trusted until subprocesses are restarted.
  }
}
```

The mitmproxy container mounts `~/.agentsy/ca/` and uses the CA to sign per-domain certificates on the fly. The `SubprocessManager` (Phase 10 §15.7.5) injects the CA path into subprocess env vars (`NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, `GIT_SSL_CAINFO`).

**Per-language trust handling**:

| Subprocess type | Env var injected | Notes |
|---|---|---|
| Node.js (`node`, `npx`) | `NODE_EXTRA_CA_CERTS` | Works for `fetch`, `https`, `axios` |
| Python (`python`, `pip`) | `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE` | Works for `requests`, `urllib3`, `httpx` |
| curl / wget | `SSL_CERT_FILE`, `CURL_CA_BUNDLE` | |
| git | `GIT_SSL_CAINFO` | |
| Go binaries | `SSL_CERT_FILE` | Go respects this since 1.15 |
| Java | `javax.net.ssl.trustStore` | Requires a JKS-format truststore; convert the PEM with `keytool` |
| System tools (apt, yum) | System CA store | Requires `sudo` install to `/usr/local/share/ca-certificates/`; document as a manual step |

The `SubprocessManager.spawnChild()` detects the subprocess type from `spec.command` and injects the appropriate env vars. Apps that don't respect any env var (certificate pinning, hardcoded trust stores) are documented as uninterceptable.

#### 40.2.4 Docker Compose integration

Add the proxy as a compose service. Extends Phase 21's Docker tooling and Phase 24's compose files.

```yaml
# docker-compose.local.yml (Topology B with proxy enabled)
services:
  agentsy:
    # ... existing config ...
    environment:
      - AGENTSY_PROXY_ENABLED=true
      - AGENTSY_PROXY_PORT=8899
    volumes:
      - agentsy-ca:/home/agentsy/.agentsy/ca  # Shared CA between daemon and proxy
    depends_on:
      - mitm-proxy

  mitm-proxy:
    image: mitmproxy/mitmproxy:latest
    command: mitmdump --listen-host 0.0.0.0 --listen-port 8899 -s /addon/agentsy_intercept.py
    ports:
      - "127.0.0.1:8899:8899"  # Localhost only
    volumes:
      - ./docker/mitm-addon:/addon:ro
      - agentsy-ca:/home/mitmproxy/.mitmproxy  # mitmproxy's CA storage
    environment:
      - AGENTSY_DAEMON_HOST=agentsy
      - AGENTSY_DAEMON_PORT=9381
    restart: unless-stopped

volumes:
  agentsy-data:
  agentsy-ca:  # Shared CA volume
```

#### 40.2.5 DaemonConfig extension

```typescript
// Add to DaemonConfigSchema
proxy: z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(['docker', 'native']).default('docker'),  // 'native' = custom Node.js proxy (future)
  port: z.number().int().positive().default(8899),
  dockerImage: z.string().default('mitmproxy/mitmproxy:latest'),
  caPath: z.string().default(path.join(os.homedir(), '.agentsy', 'ca')),
  // Per-subprocess defaults
  defaultNetworkPolicy: z.enum(['allow-all', 'allowlist', 'block-all', 'proxy-inspect']).default('block-all'),
  mcpNetworkPolicy: z.enum(['allow-all', 'allowlist', 'block-all', 'proxy-inspect']).default('proxy-inspect'),
  inspectResponses: z.boolean().default(true),
  maxResponseSizeBytes: z.number().int().positive().default(100_000),
  // Fail-open behavior if guardrail endpoint is down
  failOpen: z.boolean().default(true),  // true = allow traffic if guardrail is down; false = block
}).default({})
```

#### 40.2.6 Subprocess identification

The proxy needs to know which subprocess made each request, to apply the right policy. Two mechanisms:

1. **Source-port lookup** (default): the daemon tracks `subprocessId → pid → ephemeral source port range`. When the proxy receives a request, it queries the daemon's guardrail endpoint with the source port; the daemon resolves it to a subprocessId and returns the policy. Works for local proxy where all subprocesses share `127.0.0.1`.

2. **`X-Agentsy-Subprocess` header** (opt-in): the daemon injects a unique token per subprocess via an env var (`AGENTSY_SUBPROCESS_TOKEN`). Well-behaved HTTP clients include this header; the proxy reads it directly. More reliable but requires subprocess cooperation (most tools don't inject custom headers).

The daemon's guardrail endpoint supports both: it first checks for the header, then falls back to source-port lookup.

### 39.3 What Phase 25 covers (and doesn't)

**Covers**:
- All HTTP/HTTPS requests from subprocesses that respect `HTTP_PROXY`/`HTTPS_PROXY` env vars (curl, wget, npm, pip, requests, axios, fetch, httpx, etc.)
- WebSocket and SSE traffic (mitmproxy handles these)
- Per-subprocess policy enforcement (allowlist, blocklist, inspect, disk-spill)
- Real-time blocking of jailbreaks in response bodies
- Real-time blocking of xAI endpoints and style-mimicry prompts in subprocess traffic
- Audit receipts for every blocked/transformed request

**Does NOT cover** (documented limitations):
- **Raw TCP sockets** — apps that open direct TCP connections (not via HTTP) bypass the proxy. Mitigation: Phase 25 logs a warning when a subprocess with `proxy-inspect` policy opens a non-HTTP connection (via OS-level socket monitoring, if available). Full coverage requires Layer 3 (network namespace) isolation, which is out of scope.
- **Certificate-pinning apps** — apps that hardcode their trusted CAs and ignore env vars (notably some mobile-app backends, some enterprise tools) will reject the MITM CA. No fix short of patching the app.
- **Apps that explicitly disable proxy** — some apps (e.g. `curl --noproxy '*'`) bypass the proxy. The `SubprocessManager` can strip `--noproxy` from args for `proxy-inspect` subprocesses, but this is fragile.
- **System-level tools requiring root** — `apt`, `yum`, `dnf` need the CA installed system-wide (`/usr/local/share/ca-certificates/`), which requires `sudo`. Document as a one-time setup step; the daemon prints instructions.
- **Java apps** — require a JKS-format truststore, not PEM. The daemon converts via `keytool` if Java is detected; otherwise document the manual step.

### 39.4 Sub-phase decomposition (when activated)

| Sub-phase | Scope | SP |
|---|---|---|
| 25.1 | CA generation + per-language trust-store env injection (extends Phase 10 §15.7.5 plumbing) | 2 |
| 25.2 | `mitmproxy` Docker container + agentsy addon script | 3 |
| 25.3 | Daemon guardrail-scan REST endpoint (port 9381) | 2 |
| 25.4 | Subprocess identification (source-port lookup + header fallback) | 2 |
| 25.5 | Docker Compose integration (local + teams topologies) | 1 |
| 25.6 | `DaemonConfig.proxy` schema + CLI (`agentsy proxy status`, `agentsy proxy logs`) | 1 |
| 25.7 | Tests: HTTP, HTTPS, WebSocket, blocked request, blocked response, fail-open, CA rotation | 1 |
| | **Total** | **~12 SP** |

### 39.5 Verification (when activated)

- [ ] `agentsy proxy status` shows proxy running, CA present, port listening
- [ ] Subprocess with `proxy-inspect` policy routes HTTP through the proxy (verified via `mitmproxy` logs)
- [ ] Subprocess with `proxy-inspect` policy routes HTTPS through the proxy (TLS interception works)
- [ ] Blocked request (xAI endpoint) returns 403 to subprocess; receipt persisted
- [ ] Blocked response (prompt injection in fetched page) returns 403 to subprocess; receipt persisted
- [ ] Style-mimicry prompt in subprocess HTTP request is blocked (Phase 20 policy enforced at network layer)
- [ ] Oversized response disk-spilled; subprocess receives preview + path
- [ ] WebSocket traffic intercepted (MCP server over WS)
- [ ] SSE traffic intercepted (MCP server over SSE)
- [ ] Per-language CA trust works (test with Node.js, Python, curl, git at minimum)
- [ ] `failOpen: true` — traffic passes when guardrail endpoint is down; daemon logs warning
- [ ] `failOpen: false` — traffic blocked when guardrail endpoint is down
- [ ] CA rotation works (new CA generated, proxy restarts, old subprocesses re-trust on next spawn)
- [ ] Subprocess identification via source-port lookup works
- [ ] Subprocess identification via `X-Agentsy-Subprocess` header works (opt-in)
- [ ] `DaemonConfig.proxy` schema accepts all fields with correct defaults
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

### 39.6 Risk register (Phase 25 specific)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MITM CA compromised | Low | Critical | CA stored at `~/.agentsy/ca/` with `0o600` permissions. CA never leaves the host. Rotation supported. Document that the CA is a security-sensitive artifact. |
| Proxy adds unacceptable latency to high-frequency subprocess calls (npm install) | Medium | Medium | Per-subprocess `mode: 'allowlist'` bypasses body scanning for trusted domains (npm registry). Document the trade-off. |
| Subprocess ignores env vars (certificate pinning) | Medium | Medium | Documented limitation. The daemon logs which subprocesses aren't interceptable. Phase 25 doesn't promise 100% coverage. |
| Guardrail endpoint down → all subprocess network blocked (if `failOpen: false`) | Medium | High | Default `failOpen: true`. Document the trade-off. Server-mode deployments with strict security requirements can set `failOpen: false`. |
| mitmproxy container consumes significant memory | Low | Low | Resource limits in compose. `DockerAvailabilityChecker` (Phase 21) verifies resources before starting. |
| WebSocket/SSE interception breaks MCP servers that expect unmodified frames | Low | Medium | mitmproxy passes frames through unmodified unless a scanner returns `block`. Test with real MCP servers. |
| CA not trusted by Java apps (JKS format mismatch) | Medium | Low | Daemon detects Java subprocesses and converts PEM → JKS via `keytool`. Document manual step if `keytool` is unavailable. |

### 39.7 Relationship to codex and the competitive landscape

codex (§A.7 of Appendix A) implements this same pattern (MITM network policy proxy with `BlockedRequestObserver`) but goes further with Layer 3 isolation (bubblewrap + seccomp + Landlock on Linux, seatbelt on macOS, AppContainer on Windows). Phase 25 matches codex's Layer 2 (MITM proxy) but does not attempt Layer 3 — that's a larger investment that's only justified if agentsy targets high-sensitivity deployments (e.g. regulated industries, government). For most teams, Layers 1 (Phase 10 §15.7) + 2 (Phase 25) provide strong protection without the complexity.

oh-my-pi's `pi-iso` (Phase 17 §22.7) provides filesystem isolation (8 backends) but not network isolation. A future phase could add a network-isolation PAL trait (`pi-net`) analogous to `pi-iso`, but this is research-grade and not planned.

---

