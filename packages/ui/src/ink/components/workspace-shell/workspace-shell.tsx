import { Box, Text, useInput } from 'ink';
import { type ReactNode, useState } from 'react';

import type { AcidPalette } from '../../theme/palette.js';

export interface WorkspaceTab {
  /** Tab content. */
  readonly content: ReactNode;
  /** Single-key hotkey (e.g. '1', '2', 'a'). */
  readonly key: string;
  /** Display label. */
  readonly label: string;
}

export interface WorkspaceShellProps {
  /** Controlled active tab key. If omitted, component manages its own state. */
  readonly activeTab?: string;
  /** Optional header banner content (ANSI logo area). */
  readonly banner?: ReactNode;
  /** Called when active tab changes. */
  readonly onTabChange?: (key: string) => void;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Optional bottom status rail content. */
  readonly statusRail?: ReactNode;
  /** Tabs to render. First tab is active by default. */
  readonly tabs: readonly WorkspaceTab[];
}

/**
 * BBS-style tabbed workspace shell.
 *
 * Renders a full-screen terminal IDE frame:
 *   ┌─ banner ──────────────────────────────────────────┐
 *   │ [1]Session  [2]Files  [3]Log  [4]Console          │
 *   ├───────────────────────────────────────────────────┤
 *   │                                                   │
 *   │  <active tab content>                             │
 *   │                                                   │
 *   └─ status rail ─────────────────────────────────────┘
 *
 * Tab switching: press the hotkey shown in brackets.
 * Aesthetic: Cave BBS / Equalizer — dense tab bar, thin borders, neon accents.
 */
export function WorkspaceShell({
  tabs,
  palette,
  statusRail,
  banner,
  onTabChange,
  activeTab: controlledActiveTab
}: WorkspaceShellProps) {
  const [internalActiveTab, setInternalActiveTab] = useState(tabs[0]?.key ?? '');
  const activeKey = controlledActiveTab ?? internalActiveTab;

  useInput(input => {
    const match = tabs.find(t => t.key === input);
    if (match) {
      if (!controlledActiveTab) {
        setInternalActiveTab(match.key);
      }
      onTabChange?.(match.key);
    }
  });

  const activeTab = tabs.find(t => t.key === activeKey) ?? tabs[0];

  return (
    <Box flexDirection="column" width="100%">
      {/* Banner area */}
      {banner ? <Box marginBottom={0}>{banner}</Box> : null}

      {/* Tab bar — BBS style: ═[1]Session══[2]Files══[3]Log═ */}
      <Box borderColor={palette.frameBorder} borderStyle="single" flexDirection="row">
        {tabs.map((tab, i) => {
          const isActive = tab.key === activeKey;
          return (
            <Box key={tab.key} marginRight={i < tabs.length - 1 ? 1 : 0}>
              <Text bold={isActive} color={isActive ? palette.frameBright : palette.muted}>
                {'['}
              </Text>
              <Text bold color={isActive ? palette.assistantAccent : palette.muted}>
                {tab.key}
              </Text>
              <Text bold={isActive} color={isActive ? palette.frameBright : palette.muted}>
                {']'}
              </Text>
              <Text bold={isActive} color={isActive ? palette.frameBright : palette.muted}>
                {tab.label}
              </Text>
            </Box>
          );
        })}
        <Box flexGrow={1} />
        <Text color={palette.muted} dimColor>
          {'ESC=menu'}
        </Text>
      </Box>

      {/* Active tab content */}
      <Box flexDirection="column" flexGrow={1}>
        {activeTab?.content ?? null}
      </Box>

      {/* Status rail */}
      {statusRail ? <Box>{statusRail}</Box> : null}
    </Box>
  );
}
