/**
 * Council Mode types for multi-model collaboration
 */

export interface CouncilMember {
  model: string;
  provider: string;
  role?: string;
}

export interface CouncilDefinition {
  name: string;
  description: string;
  members: CouncilMember[];
  chairman: CouncilMember;
  domain: 'coding' | 'research' | 'review' | 'architecture' | 'general';
  maxTokensPerMember?: number;
  timeoutMs?: number;
}

export interface FirstOpinion {
  member: CouncilMember;
  response: string;
  tokenUsage: { input: number; output: number };
  durationMs: number;
}

export interface ReviewScore {
  reviewer: CouncilMember;
  target: CouncilMember;
  accuracy: number;
  insight: number;
  reasoning: string;
}

export interface CouncilResult {
  finalAnswer: string;
  opinions: FirstOpinion[];
  reviews: ReviewScore[];
  rankings: Array<{ member: CouncilMember; avgScore: number }>;
  dissentingOpinions: Array<{ member: CouncilMember; opinion: string }>;
  totalTokenUsage: { input: number; output: number };
  totalDurationMs: number;
  chairman: CouncilMember;
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
