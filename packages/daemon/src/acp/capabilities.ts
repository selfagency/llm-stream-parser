/**
 * ACP Capabilities — Phase 18 enhancements.
 * @module
 */

import { AGENT_CAPABILITIES as BASE } from './acp-capabilities.js';

export { AGENT_CAPABILITIES } from './acp-capabilities.js';

export interface AgentCapabilities {
  readonly loadSession: boolean;
  readonly mcpCapabilities: { readonly http: boolean; readonly sse: boolean };
  readonly permissionKindProbing: boolean;
  readonly promptCapabilities: { readonly audio: boolean; readonly embeddedContext: boolean; readonly image: boolean };
  readonly sessionCapabilities: {
    readonly additionalDirectories: boolean;
    readonly close: boolean;
    readonly delete: boolean;
    readonly list: boolean;
    readonly resume: boolean;
  };
}

export type ContentBlockType = 'audio' | 'embeddedContext' | 'image' | 'resource' | 'text';

export interface TextBlock {
  readonly text: string;
  readonly type: 'text';
}

export interface ImageBlock {
  readonly data: string;
  readonly mimeType: string;
  readonly type: 'image';
  readonly uri?: string | undefined;
}

export interface AudioBlock {
  readonly data: string;
  readonly mimeType: string;
  readonly transcript?: string | undefined;
  readonly type: 'audio';
}

export interface EmbeddedContextBlock {
  readonly content: string;
  readonly type: 'embeddedContext';
  readonly uri: string;
}

export type PromptContentBlock = AudioBlock | EmbeddedContextBlock | ImageBlock | TextBlock;

export interface ParsedPrompt {
  readonly audios: readonly AudioBlock[];
  readonly embeddedContexts: readonly EmbeddedContextBlock[];
  readonly images: readonly ImageBlock[];
  readonly raw: unknown;
  readonly text: string;
}

export interface VisionModelForward {
  readonly content: Array<{ image_url?: { url: string }; text?: string; type: 'image_url' | 'text' }>;
  readonly hasImages: boolean;
  readonly modelHint: 'vision-capable';
}

export interface ASRResult {
  readonly confidence: number;
  readonly language: string;
  readonly text: string;
}

export interface ASRPipelineOptions {
  readonly language?: string | undefined;
  readonly model?: string | undefined;
}

const SUPPORTED_IMAGE_MIMES = new Set([
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/tiff',
  'image/webp'
]);

const SUPPORTED_AUDIO_MIMES = new Set([
  'audio/aac',
  'audio/flac',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/webm',
  'audio/x-wav'
]);

const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

export function isImageBlock(block: unknown): block is ImageBlock {
  if (typeof block !== 'object' || block === null) {
    return false;
  }
  const b = block as Record<string, unknown>;
  return b.type === 'image' && typeof b.data === 'string' && typeof b.mimeType === 'string';
}

export function isAudioBlock(block: unknown): block is AudioBlock {
  if (typeof block !== 'object' || block === null) {
    return false;
  }
  const b = block as Record<string, unknown>;
  return b.type === 'audio' && typeof b.data === 'string' && typeof b.mimeType === 'string';
}

export function isTextBlock(block: unknown): block is TextBlock {
  if (typeof block !== 'object' || block === null) {
    return false;
  }
  const b = block as Record<string, unknown>;
  return b.type === 'text' && typeof b.text === 'string';
}

function extractBase64Data(data: string): string {
  if (data.includes(',')) {
    return data.split(',').pop() ?? '';
  }
  return data;
}

export function validateImageBlock(block: ImageBlock): { valid: boolean; error?: string } {
  if (!SUPPORTED_IMAGE_MIMES.has(block.mimeType.toLowerCase())) {
    return { valid: false, error: `Unsupported image mimeType: ${block.mimeType}` };
  }
  if (block.data.length === 0) {
    return { valid: false, error: 'Image data is empty' };
  }
  const raw = extractBase64Data(block.data);
  if (raw.length === 0) {
    return { valid: false, error: 'Image base64 data is empty after stripping prefix' };
  }
  const cleaned = raw.replace(/\s/g, '');
  if (cleaned.length > 28_000_000) {
    return { valid: false, error: 'Image too large (max ~20MB base64)' };
  }
  const lenOk = cleaned.length % 4 === 0;
  if (lenOk) {
    const patternOk = BASE64_REGEX.test(cleaned);
    if (!patternOk) {
      try {
        Buffer.from(cleaned, 'base64');
      } catch {
        return { valid: false, error: 'Invalid base64 image data' };
      }
    }
  } else {
    try {
      Buffer.from(cleaned, 'base64');
    } catch {
      return { valid: false, error: 'Invalid base64 image data' };
    }
  }
  return { valid: true };
}

export function validateAudioBlock(block: AudioBlock): { valid: boolean; error?: string } {
  if (!SUPPORTED_AUDIO_MIMES.has(block.mimeType.toLowerCase())) {
    return { valid: false, error: `Unsupported audio mimeType: ${block.mimeType}` };
  }
  if (block.data.length === 0) {
    return { valid: false, error: 'Audio data is empty' };
  }
  const raw = extractBase64Data(block.data);
  const cleaned = raw.replace(/\s/g, '');
  if (cleaned.length > 50_000_000) {
    return { valid: false, error: 'Audio too large (max ~35MB base64)' };
  }
  return { valid: true };
}

// Internal accumulator
interface Acc {
  audios: AudioBlock[];
  embeddedContexts: EmbeddedContextBlock[];
  images: ImageBlock[];
  textParts: string[];
}

function accPushImage(acc: Acc, item: ImageBlock): void {
  const v = validateImageBlock(item);
  if (v.valid) {
    acc.images.push(item);
  }
}

function accPushAudio(acc: Acc, item: AudioBlock): void {
  const v = validateAudioBlock(item);
  if (v.valid) {
    acc.audios.push(item);
  }
}

function handleMapObject(obj: Record<string, unknown>, acc: Acc): void {
  if (obj.type === 'embeddedContext' && typeof obj.uri === 'string') {
    acc.embeddedContexts.push({
      type: 'embeddedContext',
      uri: obj.uri,
      content: typeof obj.content === 'string' ? obj.content : ''
    });
    return;
  }
  if (obj.type === 'text' && typeof obj.text === 'string') {
    acc.textParts.push(obj.text);
    return;
  }
  if (typeof obj.text === 'string') {
    acc.textParts.push(obj.text);
    return;
  }
  if (typeof obj.content === 'string') {
    acc.textParts.push(obj.content);
  }
}

function handleSingleItem(item: unknown, acc: Acc): void {
  if (isImageBlock(item)) {
    accPushImage(acc, item);
    return;
  }
  if (isAudioBlock(item)) {
    accPushAudio(acc, item);
    return;
  }
  if (typeof item === 'object' && item !== null) {
    handleMapObject(item as Record<string, unknown>, acc);
    return;
  }
  if (typeof item === 'string') {
    acc.textParts.push(item);
  }
}

function parseArrayPrompt(items: unknown[]): ParsedPrompt {
  const acc: Acc = { images: [], audios: [], embeddedContexts: [], textParts: [] };
  for (const item of items) {
    handleSingleItem(item, acc);
  }
  return {
    text: acc.textParts.join('\n'),
    images: acc.images,
    audios: acc.audios,
    embeddedContexts: acc.embeddedContexts,
    raw: items
  };
}

function collectImages(arr: unknown[]): ImageBlock[] {
  const out: ImageBlock[] = [];
  for (const im of arr) {
    if (isImageBlock(im)) {
      out.push(im);
    }
  }
  return out;
}

function collectAudios(arr: unknown[]): AudioBlock[] {
  const out: AudioBlock[] = [];
  for (const au of arr) {
    if (isAudioBlock(au)) {
      out.push(au);
    }
  }
  return out;
}

function parseObjectPrompt(obj: Record<string, unknown>, original: unknown): ParsedPrompt | null {
  if (typeof obj.prompt !== 'string') {
    return null;
  }
  const images = Array.isArray(obj.images) ? collectImages(obj.images) : [];
  const audios = Array.isArray(obj.audio) ? collectAudios(obj.audio) : [];
  return {
    text: obj.prompt,
    images,
    audios,
    embeddedContexts: [],
    raw: original
  };
}

export function parsePromptContent(prompt: unknown): ParsedPrompt {
  if (typeof prompt === 'string') {
    return { text: prompt, images: [], audios: [], embeddedContexts: [], raw: prompt };
  }
  if (Array.isArray(prompt)) {
    return parseArrayPrompt(prompt);
  }
  if (typeof prompt === 'object' && prompt !== null) {
    const obj = prompt as Record<string, unknown>;
    const fromObject = parseObjectPrompt(obj, prompt);
    if (fromObject) {
      return fromObject;
    }
    const values = Object.values(obj).flat() as unknown[];
    if (values.length > 0) {
      return parseArrayPrompt(values);
    }
  }
  return { text: String(prompt ?? ''), images: [], audios: [], embeddedContexts: [], raw: prompt };
}

export function forwardImagesToVisionModel(parsed: ParsedPrompt): VisionModelForward {
  if (parsed.images.length === 0) {
    return { hasImages: false, content: [{ type: 'text', text: parsed.text }], modelHint: 'vision-capable' };
  }
  const content: Array<{ image_url?: { url: string }; text?: string; type: 'image_url' | 'text' }> = [];
  if (parsed.text.trim()) {
    content.push({ type: 'text', text: parsed.text });
  }
  for (const img of parsed.images) {
    const dataUrl = img.data.startsWith('data:') ? img.data : `data:${img.mimeType};base64,${img.data}`;
    content.push({ type: 'image_url', image_url: { url: dataUrl } });
  }
  return { hasImages: true, content, modelHint: 'vision-capable' };
}

export function createASRPipelineStub() {
  return {
    transcribe(audio: AudioBlock, options?: ASRPipelineOptions): Promise<ASRResult> {
      const v = validateAudioBlock(audio);
      if (!v.valid) {
        return Promise.reject(new Error(v.error ?? 'Invalid audio block'));
      }
      if (audio.transcript?.trim()) {
        return Promise.resolve({ text: audio.transcript, confidence: 1, language: options?.language ?? 'en' });
      }
      return Promise.resolve({
        text: `[Audio transcription pending: ${audio.mimeType}, ${Math.round(audio.data.length / 1000)}kB]`,
        confidence: 0.5,
        language: options?.language ?? 'en'
      });
    },

    transcribeBatch(audios: readonly AudioBlock[], options?: ASRPipelineOptions): Promise<readonly ASRResult[]> {
      const results: ASRResult[] = audios.map(a => {
        const v = validateAudioBlock(a);
        if (!v.valid) {
          return { text: '', confidence: 0, language: options?.language ?? 'en' };
        }
        if (a.transcript) {
          return { text: a.transcript, confidence: 1, language: options?.language ?? 'en' };
        }
        return {
          text: `[Audio transcription pending: ${a.mimeType}]`,
          confidence: 0.5,
          language: options?.language ?? 'en'
        };
      });
      return Promise.resolve(results);
    }
  };
}

export function getPromptCapabilities() {
  return { ...BASE.promptCapabilities };
}

export function getMCPCapabilities() {
  return { ...BASE.mcpCapabilities };
}

export function getSessionCapabilities() {
  return { ...BASE.sessionCapabilities };
}

export function validateCapabilitiesAdvertisement(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!BASE.promptCapabilities.image) {
    missing.push('promptCapabilities.image');
  }
  if (!BASE.promptCapabilities.audio) {
    missing.push('promptCapabilities.audio');
  }
  if (!BASE.mcpCapabilities.http) {
    missing.push('mcpCapabilities.http');
  }
  if (!BASE.mcpCapabilities.sse) {
    missing.push('mcpCapabilities.sse');
  }
  return { valid: missing.length === 0, missing };
}
