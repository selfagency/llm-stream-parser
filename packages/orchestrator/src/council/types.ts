/**
 * Council Mode types for multi-model collaboration
 */

export interface CouncilMember {
  model: string;
  provider: string;
  role?: string;
}

export interface CouncilDefinition {
  chairman: CouncilMember;
  description: string;
  domain: 'coding' | 'research' | 'review' | 'architecture' | 'general';
  maxTokensPerMember?: number;
  members: CouncilMember[];
  name: string;
  timeoutMs?: number;
}

export interface FirstOpinion {
  durationMs: number;
  member: CouncilMember;
  response: string;
  tokenUsage: { input: number; output: number };
}

export interface ReviewScore {
  accuracy: number;
  insight: number;
  reasoning: string;
  reviewer: CouncilMember;
  target: CouncilMember;
}

export interface CouncilResult {
  chairman: CouncilMember;
  dissentingOpinions: Array<{ member: CouncilMember; opinion: string }>;
  finalAnswer: string;
  opinions: FirstOpinion[];
  rankings: Array<{ member: CouncilMember; avgScore: number }>;
  reviews: ReviewScore[];
  totalDurationMs: number;
  totalTokenUsage: { input: number; output: number };
}

export type CouncilEvent =
  | { type: 'council_started'; councilName: string; memberCount: number }
  | { type: 'stage1_started'; memberCount: number }
  | { type: 'opinion_complete'; member: CouncilMember; tokenUsage: { input: number; output: number } }
  | { type: 'stage1_complete'; opinionCount: number }
  | { type: 'stage2_started'; reviewCount: number }
  | { type: 'review_complete'; reviewer: CouncilMember; target: CouncilMember }
  | { type: 'stage2_complete'; rankings: Array<{ member: CouncilMember; avgScore: number }> }
  | { type: 'stage3_started'; chairman: CouncilMember }
  | { type: 'council_complete'; result: CouncilResult }
  | { type: 'council_error'; error: string };
