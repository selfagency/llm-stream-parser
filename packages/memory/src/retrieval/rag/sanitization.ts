import type { IngestSource } from './types.js';

const SK_PREFIX = /sk-[a-z0-9]{20,}/giu;
const SK_UNDERSCORE = /sk_[a-z0-9_-]{8,}/giu;
const API_KEY_HEADER = /api[_-]?key\s*[=:]\s*\S+/giu;
const BEARER_TOKEN = /bearer\s+[a-z0-9._-]{10,}/giu;

export function sanitizeIngestSource(source: IngestSource): IngestSource {
  let content = source.content.replace(SK_PREFIX, '[REDACTED]');
  content = content.replace(SK_UNDERSCORE, '[REDACTED]');
  content = content.replace(API_KEY_HEADER, '[REDACTED]');
  content = content.replace(BEARER_TOKEN, '[REDACTED]');
  return {
    ...source,
    content,
    ...(source.metadata === undefined ? {} : { metadata: { ...source.metadata } })
  };
}
