import { collectRegexMatches } from './_internal.js';
import type { GuardrailResult, GuardrailScanner } from './types.js';

// =============================================================================
// Secret pattern categories — 45+ provider patterns across 6 categories
// =============================================================================

/**
 * AI/LLM provider API keys.
 */
const AI_PATTERNS: { pattern: RegExp; id: string; severity: 'critical' | 'high'; confidence: number }[] = [
  // OpenAI — sk-... (42+ chars), sk-proj-..., sk-svcacct-...
  {
    pattern: /\b(?:sk|sk-proj|sk-svcacct|sk-user|sk-ant|sk-live|sk-test|org)-[A-Za-z0-9]{20,}\b/g,
    id: 'openai-api-key',
    severity: 'critical',
    confidence: 0.95
  },
  // Anthropic — sk-ant-...
  { pattern: /\bsk-ant-[A-Za-z0-9]{40,}\b/g, id: 'anthropic-api-key', severity: 'critical', confidence: 0.95 },
  // Google AI — AIza... (Google API key for Gemini/Vertex)
  { pattern: /\bAIza[0-9A-Za-z_-]{35,}\b/g, id: 'google-api-key', severity: 'high', confidence: 0.85 },
  // Hugging Face
  { pattern: /\bhf_[A-Za-z0-9]{20,}\b/g, id: 'huggingface-token', severity: 'high', confidence: 0.9 },
  // Replicate
  { pattern: /\br8_[A-Za-z0-9]{20,}\b/g, id: 'replicate-api-token', severity: 'high', confidence: 0.9 },
  // Cohere
  { pattern: /\bcohere-[A-Za-z0-9]{30,}\b/g, id: 'cohere-api-key', severity: 'high', confidence: 0.85 },
  // Together AI
  { pattern: /\btogether-[A-Za-z0-9]{20,}\b/g, id: 'together-api-key', severity: 'high', confidence: 0.85 },
  // DeepL
  { pattern: /\b[0-9a-f]{32}:fx\b/g, id: 'deepl-api-key', severity: 'high', confidence: 0.85 },
  // ElevenLabs
  { pattern: /\bsk_[0-9a-f]{32}[A-Za-z0-9]{0,8}\b/g, id: 'elevenlabs-api-key', severity: 'high', confidence: 0.85 },
  // Perplexity
  { pattern: /\bpplx-[A-Za-z0-9]{20,}\b/g, id: 'perplexity-api-key', severity: 'high', confidence: 0.85 },
  // Groq
  { pattern: /\bgsk_[A-Za-z0-9]{20,}\b/g, id: 'groq-api-key', severity: 'high', confidence: 0.85 }
];

/**
 * Cloud provider credentials.
 */
const CLOUD_PATTERNS: { pattern: RegExp; id: string; severity: 'critical' | 'high'; confidence: number }[] = [
  // AWS access key (starts with AKIA or ASIA)
  { pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/g, id: 'aws-access-key', severity: 'critical', confidence: 0.95 },
  // AWS secret key
  {
    pattern: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY|awsSecretKey)\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}/g,
    id: 'aws-secret-key',
    severity: 'critical',
    confidence: 0.95
  },
  // AWS session token
  {
    pattern: /(?:aws_session_token|AWS_SESSION_TOKEN)\s*[:=]\s*['"]?[A-Za-z0-9/+=]{100,}/g,
    id: 'aws-session-token',
    severity: 'high',
    confidence: 0.9
  },
  // Azure Storage Account key
  {
    pattern: /(?:AccountKey|account_key|storage_account_key)\s*[:=]\s*['"]?[A-Za-z0-9/+=]{80,}/g,
    id: 'azure-storage-key',
    severity: 'critical',
    confidence: 0.9
  },
  // Azure client secret / service principal
  {
    pattern: /(?:AZURE_CLIENT_SECRET|azure_client_secret|clientSecret)\s*[:=]\s*['"]?[A-Za-z0-9._-]{30,}/g,
    id: 'azure-client-secret',
    severity: 'critical',
    confidence: 0.85
  },
  // Azure SQL/DB connection string
  {
    // nosemgrep: use-bounded-regex — [^;] bounds each section, no nested quantifiers
    pattern: /(?:Server\s*=\s*[^;]+;)?User\s*Id\s*=\s*[^;]+;Password\s*=\s*[^;]+(?:;Database|;Initial Catalog)/g,
    id: 'azure-db-connection-string',
    severity: 'high',
    confidence: 0.8
  },
  // Azure SAS token
  {
    pattern: /(?:sv|se|sr|sp)=[0-9A-Za-z%]+&[a-z]+=[0-9A-Za-z%]+&sig=[A-Za-z0-9%/=]+/g,
    id: 'azure-sas-token',
    severity: 'critical',
    confidence: 0.9
  },
  // GCP service account JSON keys
  {
    pattern:
      /"type"\s*:\s*"service_account"[^}]*"private_key_id"\s*:\s*"[A-Za-z0-9]+"[^}]*"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/g,
    id: 'gcp-service-account',
    severity: 'critical',
    confidence: 0.95
  },
  // Google Cloud API key
  { pattern: /\bAIza[0-9A-Za-z_-]{35,}\b/g, id: 'gcp-api-key', severity: 'high', confidence: 0.85 },
  // DigitalOcean personal access token
  { pattern: /\bdop_[0-9a-f]{40}\b/g, id: 'do-pat', severity: 'high', confidence: 0.9 },
  // DigitalOcean OAuth token
  { pattern: /\bdoo_[0-9a-f]{40}\b/g, id: 'do-oauth-token', severity: 'high', confidence: 0.9 },
  // Vercel token (requires context keyword to reduce false positives)
  {
    pattern: /(?:Vercel|VERCEL|vercel)[:=]\s*[A-Za-z0-9]{24}\b/g,
    id: 'vercel-token',
    severity: 'high',
    confidence: 0.5
  },
  // Netlify access token
  { pattern: /\bnf_[A-Za-z0-9]{40,}\b/g, id: 'netlify-access-token', severity: 'high', confidence: 0.85 },
  // Cloudflare API token
  {
    pattern: /\b[0-9a-f]{32,}(?:\|[A-Z0-9]+)?\b.*?cloudflare/gi,
    id: 'cloudflare-api-token',
    severity: 'high',
    confidence: 0.8
  },
  // PlanetScale password
  { pattern: /\bpscale_pwd_[A-Za-z0-9_-]{20,}\b/g, id: 'planetscale-password', severity: 'high', confidence: 0.85 }
];

/**
 * SaaS platform API keys and tokens.
 */
const SAAS_PATTERNS: { pattern: RegExp; id: string; severity: 'critical' | 'high'; confidence: number }[] = [
  // GitHub classic PAT + fine-grained
  { pattern: /gh[ps]_[A-Za-z0-9]{36,}/g, id: 'github-token', severity: 'critical', confidence: 0.95 },
  // GitHub OAuth access token
  { pattern: /gho_[A-Za-z0-9]{36,}/g, id: 'github-oauth-token', severity: 'critical', confidence: 0.95 },
  // GitHub app token
  { pattern: /ghu_[A-Za-z0-9]{36,}/g, id: 'github-app-token', severity: 'critical', confidence: 0.9 },
  // GitLab tokens
  { pattern: /glpat-[A-Za-z0-9_-]{20,}/g, id: 'gitlab-token', severity: 'critical', confidence: 0.95 },
  // Slack tokens
  { pattern: /xox[baprs]-[A-Za-z0-9]{10,}/g, id: 'slack-token', severity: 'critical', confidence: 0.95 },
  // Slack webhooks
  {
    pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+/g,
    id: 'slack-webhook',
    severity: 'critical',
    confidence: 0.95
  },
  // Stripe live key
  { pattern: /sk_live_[A-Za-z0-9]{20,}/g, id: 'stripe-live-key', severity: 'critical', confidence: 0.95 },
  // Stripe restricted key
  { pattern: /rk_live_[A-Za-z0-9]{20,}/g, id: 'stripe-restricted-key', severity: 'critical', confidence: 0.9 },
  // Stripe webhook secret
  { pattern: /whsec_[A-Za-z0-9]{20,}/g, id: 'stripe-webhook-secret', severity: 'high', confidence: 0.9 },
  // Discord bot tokens
  {
    pattern: /[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g,
    id: 'discord-token',
    severity: 'critical',
    confidence: 0.9
  },
  // Discord webhook URLs
  {
    pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g,
    id: 'discord-webhook',
    severity: 'high',
    confidence: 0.9
  },
  // Linear API key
  { pattern: /lin_api_[A-Za-z0-9]{20,}/g, id: 'linear-api-key', severity: 'high', confidence: 0.9 },
  // Notion integration token
  { pattern: /secret_[A-Za-z0-9]{40,}/g, id: 'notion-integration-token', severity: 'high', confidence: 0.85 },
  // Figma personal access token
  { pattern: /figd_[0-9a-f]{32}/g, id: 'figma-personal-access-token', severity: 'high', confidence: 0.85 },
  // Sentry auth token
  { pattern: /sntrys_[A-Za-z0-9]{40,}/g, id: 'sentry-auth-token', severity: 'high', confidence: 0.85 },
  // Shopify access token
  { pattern: /shpat_[A-Za-z0-9]{30,}/g, id: 'shopify-access-token', severity: 'critical', confidence: 0.9 },
  // Twilio account SID + auth token
  { pattern: /AC[A-Za-z0-9]{32}/g, id: 'twilio-account-sid', severity: 'high', confidence: 0.85 },
  // Mailgun API key
  { pattern: /key-[0-9a-f]{32}/g, id: 'mailgun-api-key', severity: 'high', confidence: 0.85 },
  // SendGrid API key
  {
    pattern: /SG\.[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{43,}/g,
    id: 'sendgrid-api-key',
    severity: 'high',
    confidence: 0.85
  },
  // Postmark server token (requires context keyword to avoid bare UUID false positives)
  {
    pattern: /(?:[Pp]ostmark)[:=]\s*[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/g,
    id: 'postmark-server-token',
    severity: 'high',
    confidence: 0.5
  },
  // PagerDuty API token
  { pattern: /u\+[A-Za-z0-9_-]{20,}/g, id: 'pagerduty-api-token', severity: 'high', confidence: 0.85 },
  // Datadog API key
  {
    pattern: /(?:datadog_api_key|DATADOG_API_KEY)\s*[:=]\s*['"]?[A-Za-z0-9]{32}/g,
    id: 'datadog-api-key',
    severity: 'high',
    confidence: 0.85
  },
  // New Relic ingest key
  {
    pattern: /(?:newrelic_license_key|NEW_RELIC_LICENSE_KEY)\s*[:=]\s*['"]?[A-Za-z0-9]{40}/g,
    id: 'newrelic-license-key',
    severity: 'high',
    confidence: 0.85
  },
  // Grafana API key
  {
    pattern: /glsa_[A-Za-z0-9]{20,}_[A-Za-z0-9]{8}/g,
    id: 'grafana-service-account-token',
    severity: 'high',
    confidence: 0.85
  }
];

/**
 * Package registry tokens.
 */
const PACKAGE_PATTERNS: { pattern: RegExp; id: string; severity: 'critical' | 'high'; confidence: number }[] = [
  // npm access token
  { pattern: /npm_[A-Za-z0-9]{36,}/g, id: 'npm-token', severity: 'critical', confidence: 0.95 },
  // npm auth token (legacy)
  {
    pattern: /\/\/registry\.npmjs\.org\/:_authToken=[A-Za-z0-9-]{36,}/g,
    id: 'npm-auth-token',
    severity: 'critical',
    confidence: 0.9
  },
  // PyPI token
  { pattern: /pypi-[A-Za-z0-9]{40,}/g, id: 'pypi-token', severity: 'high', confidence: 0.85 },
  // Docker Hub token
  {
    pattern: /(?:dckr_pat|DOCKER_TOKEN|docker_password)\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}/g,
    id: 'docker-token',
    severity: 'high',
    confidence: 0.85
  },
  // SonarQube/SonarCloud token
  {
    pattern: /(?:sonar_token|SONAR_TOKEN|squ_[A-Za-z0-9]{40})/g,
    id: 'sonar-token',
    severity: 'high',
    confidence: 0.85
  },
  // Snyk token (requires context keyword to avoid bare UUID false positives)
  {
    pattern: /(?:[Ss]nyk)[:=]\s*[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/g,
    id: 'snyk-token',
    severity: 'high',
    confidence: 0.5
  },
  // RubyGems API key
  { pattern: /rubygems_[A-Za-z0-9]{40,}/g, id: 'rubygems-api-key', severity: 'high', confidence: 0.85 }
];

/**
 * Database connection strings with embedded credentials.
 */
const DB_PATTERNS: { pattern: RegExp; id: string; severity: 'critical' | 'high' | 'medium'; confidence: number }[] = [
  // PostgreSQL: postgresql://user:password@host:port/db
  {
    pattern: /postgres(?:ql)?:\/\/[\w%]+:[^@\s]+@[\w.-]+:\d+\/\w+/g,
    id: 'postgres-connection-string',
    severity: 'critical',
    confidence: 0.9
  },
  // MySQL: mysql://user:password@host:port/db
  {
    pattern: /mysql:\/\/[\w%]+:[^@\s]+@[\w.-]+:\d+\/\w+/g,
    id: 'mysql-connection-string',
    severity: 'critical',
    confidence: 0.9
  },
  // MongoDB: mongodb+srv://user:password@host/db
  {
    pattern: /mongodb(?:\+srv)?:\/\/[A-Za-z0-9_%]+:[^@\s]+@[A-Za-z0-9.-]+\/[A-Za-z0-9_?=&]+/g,
    id: 'mongodb-connection-string',
    severity: 'critical',
    confidence: 0.9
  },
  // Redis: redis://:password@host:port
  {
    pattern: /redis:\/\/:[^@\s]+@[A-Za-z0-9.-]+:\d+/g,
    id: 'redis-connection-string',
    severity: 'high',
    confidence: 0.85
  },
  // SQLite with embedded auth (uncommon but worth flagging)
  { pattern: /sqlite:\/\/.*(?:auth|password|token)/gi, id: 'sqlite-auth-url', severity: 'medium', confidence: 0.5 }
];

/**
 * Auth and identity tokens.
 */
const AUTH_PATTERNS: {
  pattern: RegExp;
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
}[] = [
  // JWT tokens (starts with eyJ — base64url-encoded JSON)
  {
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    id: 'jwt-token',
    severity: 'high',
    confidence: 0.8
  },
  // Generic API key assignments
  {
    pattern: /(?:Bearer|bearer|api[-_]?key|apikey|api_key|token)\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}/g,
    id: 'generic-api-key',
    severity: 'high',
    confidence: 0.6
  },
  // Private keys (inline)
  {
    pattern: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/g,
    id: 'private-key',
    severity: 'critical',
    confidence: 0.95
  },
  // SSH private key (inline, single-line)
  {
    pattern: /(?:ssh-rsa\s+AAAA|ssh-ed25519\s+AAAAC3NzaC1lZDI1NTE5)/g,
    id: 'ssh-public-key',
    severity: 'low',
    confidence: 0.5
  },
  // OAuth client secrets
  {
    pattern: /(?:client_secret|clientSecret|CLIENT_SECRET)\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}/g,
    id: 'oauth-client-secret',
    severity: 'high',
    confidence: 0.8
  },
  // Firebase admin SDK (JSON key block)
  {
    pattern:
      /"type"\s*:\s*"service_account"[^}]*"project_id"\s*:\s*"[^"]*"[^}]*"client_email"\s*:\s*"[^"]+@[^"]+\.iam\.gserviceaccount\.com"/g,
    id: 'firebase-service-account',
    severity: 'critical',
    confidence: 0.9
  },
  // Clerk secret key
  { pattern: /sk_test_[A-Za-z0-9]{20,}/g, id: 'clerk-secret-key', severity: 'high', confidence: 0.85 },
  // Supabase service role key (eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... but also full JWT pattern)
  {
    pattern:
      /(?:supabase_service_role|SUPABASE_SERVICE_ROLE)\s*[:=]\s*['"]?eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    id: 'supabase-service-role-key',
    severity: 'critical',
    confidence: 0.9
  },
  // Supabase anon key (less sensitive but still worth flagging)
  {
    pattern:
      /(?:supabase_key|SUPABASE_KEY|supabase_anon)\s*[:=]\s*['"]?eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    id: 'supabase-anon-key',
    severity: 'medium',
    confidence: 0.7
  },
  // Doppler service token
  {
    pattern: /(?:dopler|DOPPLER_TOKEN|dp\.st\.)[A-Za-z0-9_-]{20,}/g,
    id: 'doppler-service-token',
    severity: 'high',
    confidence: 0.85
  }
];

/**
 * Combined patterns list for evaluation.
 */
const ALL_PATTERNS: {
  pattern: RegExp;
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
}[] = [...AI_PATTERNS, ...CLOUD_PATTERNS, ...SAAS_PATTERNS, ...PACKAGE_PATTERNS, ...DB_PATTERNS, ...AUTH_PATTERNS];

// =============================================================================
// Secret detection scanner
// =============================================================================

/**
 * Scanner that detects secrets and credentials in LLM output.
 *
 * Detects 45+ provider-specific patterns across AI/LLM, cloud, SaaS,
 * package registry, database, and auth categories.
 *
 * OWASP: ASI-08 (Data Leakage), ASI-06 (Insecure Data Handling)
 */
export class SecretDetectionScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/secret-detection',
    name: 'Secret Detection Scanner',
    version: '2.0.0',
    description: 'Detects secrets and credentials (45+ provider patterns)',
    priority: 20,
    owaspCategories: ['asi-06', 'asi-08'] as const,
    tags: ['secrets', 'credentials', 'data-leakage', 'compliance', 'providers']
  };

  evaluate(input: string, _context?: Record<string, unknown>): Promise<GuardrailResult> {
    const detections = collectRegexMatches(input, ALL_PATTERNS, 'Secret');

    if (detections.length === 0) {
      return Promise.resolve({ status: 'pass', phase: 'output' });
    }

    // Separate critical vs high/medium for outcome determination
    const critical = detections.filter(d => d.severity === 'critical');

    if (critical.length > 0) {
      return Promise.resolve({
        status: 'block',
        phase: 'output',
        reason: `Critical secrets detected: ${critical.map(d => d.id).join(', ')}`,
        riskScore: Math.min(critical.length * 0.3, 1),
        detections
      });
    }

    return Promise.resolve({
      status: 'escalate',
      phase: 'output',
      reason: `Potential secrets detected: ${detections.map(d => d.id).join(', ')}`,
      riskScore: Math.min(detections.length * 0.15, 0.7),
      detections
    });
  }
}

export { AI_PATTERNS, AUTH_PATTERNS, CLOUD_PATTERNS, DB_PATTERNS, PACKAGE_PATTERNS, SAAS_PATTERNS };
