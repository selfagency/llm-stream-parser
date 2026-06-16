import { Box, Text } from 'ink';

import type { AcidPalette } from '../../theme/palette.ts';
import { SearchInput } from '../model-picker/search-input.tsx';

export type AgentProvenance = 'bundled' | 'user' | 'workspace' | 'plugin';

export interface AgentEntry {
  /** Whether this agent is currently active. */
  readonly active: boolean;
  /** Short description. */
  readonly description: string;
  /** Agent identifier (e.g. "superagents/research"). */
  readonly id: string;
  /** Preferred model (if specified). */
  readonly model?: string;
  /** Display name. */
  readonly name: string;
  /** Where this agent came from. */
  readonly provenance: AgentProvenance;
  /** Number of tools available. */
  readonly toolCount?: number;
}

export interface AgentPickerProps {
  /** Available agents. */
  readonly agents: readonly AgentEntry[];
  /** Whether the component is focused. */
  readonly focused?: boolean;
  /** Current highlight index for keyboard nav. */
  readonly highlightIndex: number;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Current search query. */
  readonly query: string;
}

const provenanceTokens = new Map<AgentProvenance, { label: string; color: keyof AcidPalette }>([
  ['bundled', { label: 'built-in', color: 'info' }],
  ['user', { label: 'user', color: 'success' }],
  ['workspace', { label: 'project', color: 'warning' }],
  ['plugin', { label: 'plugin', color: 'pending' }]
]);

/* ── Pure helpers ──────────────────────────────────────────────── */

function filterAgents(agents: readonly AgentEntry[], query: string): AgentEntry[] {
  if (query.length === 0) {
    return [...agents];
  }
  const lower = query.toLowerCase();
  return agents.filter(a => a.name.toLowerCase().includes(lower) || a.description.toLowerCase().includes(lower));
}

/* ── Sub-components ────────────────────────────────────────────── */

function EmptyState({ query, palette }: { readonly query: string; readonly palette: AcidPalette }) {
  return (
    <Box>
      <Text color={palette.muted}>No agents match &quot;{query}&quot;</Text>
    </Box>
  );
}

function ProvenanceBadge({
  provenance,
  palette
}: {
  readonly provenance: AgentProvenance;
  readonly palette: AcidPalette;
}) {
  const token = provenanceTokens.get(provenance);
  const color = palette[token?.color ?? 'muted'];
  const label = token?.label ?? 'unknown';
  return <Text color={color}> [{label}]</Text>;
}

function AgentMetaBar({ agent, palette }: { readonly agent: AgentEntry; readonly palette: AcidPalette }) {
  const activeMark = agent.active ? '\u25CF' : '\u25CB';
  return (
    <Box marginLeft={3}>
      <Text color={palette.frameDim}>
        {activeMark} {agent.active ? 'active' : 'inactive'}
      </Text>
      {agent.model ? <Text color={palette.frameDim}> {'\u00B7'} model: </Text> : null}
      {agent.model ? <Text color={palette.info}>{agent.model}</Text> : null}
      {agent.toolCount === undefined ? null : (
        <Text color={palette.frameDim}>
          {' \u00B7 '}
          {agent.toolCount} tool{agent.toolCount === 1 ? '' : 's'}
        </Text>
      )}
    </Box>
  );
}

function AgentRow({
  agent,
  isHighlighted,
  palette
}: {
  readonly agent: AgentEntry;
  readonly isHighlighted: boolean;
  readonly palette: AcidPalette;
}) {
  const arrow = isHighlighted ? '\u25B8' : ' ';
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={palette.assistantAccent}>{arrow} </Text>
        <Text bold={isHighlighted || agent.active} color={isHighlighted ? palette.emphasis : palette.frameBright}>
          {agent.name}
        </Text>
        <ProvenanceBadge palette={palette} provenance={agent.provenance} />
      </Box>

      <Box marginLeft={3}>
        <Text color={palette.assistantDim} dimColor>
          {agent.description}
        </Text>
      </Box>

      <AgentMetaBar agent={agent} palette={palette} />
    </Box>
  );
}

/* ── Public API ────────────────────────────────────────────────── */

/**
 * Searchable agent list with provenance badges.
 *
 * Arrow-key navigation to browse available agents, with
 * model preference and tool access summary per agent.
 */
export function AgentPicker({ agents, query, highlightIndex, palette, focused = true }: AgentPickerProps) {
  const filtered = filterAgents(agents, query);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Search header */}
      <Box marginBottom={1}>
        <SearchInput focused={focused} palette={palette} placeholder="Search agents\u2026" query={query} />
      </Box>

      {/* Agent list */}
      {filtered.length === 0 ? (
        <EmptyState palette={palette} query={query} />
      ) : (
        <Box flexDirection="column">
          {filtered.map((agent, idx) => (
            <AgentRow agent={agent} isHighlighted={idx === highlightIndex} key={agent.id} palette={palette} />
          ))}
        </Box>
      )}
    </Box>
  );
}
