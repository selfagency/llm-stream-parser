import { Box, Text, useInput } from 'ink';
import { useState } from 'react';

import type { AcidPalette } from '../../theme/palette.js';

export interface TreeNode {
  /** Nesting depth (0 = root). */
  readonly depth: number;
  /** Whether this directory is expanded. */
  readonly expanded?: boolean;
  /** Unique node id. */
  readonly id: string;
  /** Optional metadata (size, git status, etc.). */
  readonly meta?: string;
  /** Display name. */
  readonly name: string;
  /** Node type — affects icon and color. */
  readonly type: 'directory' | 'file' | 'agent-workspace' | 'modified' | 'untracked';
}

export interface WorkspaceTreeProps {
  /** Controlled cursor index. */
  readonly cursorIndex?: number;
  /** Whether this tree is focused. */
  readonly isFocused?: boolean;
  /** Flat list of tree nodes (pre-ordered, depth-indented). */
  readonly nodes: readonly TreeNode[];
  /** Called when diff is requested (D key). */
  readonly onDiff?: (node: TreeNode) => void;
  /** Called when a node is selected (Enter). */
  readonly onSelect?: (node: TreeNode) => void;
  /** Called when a node is toggled (expand/collapse). */
  readonly onToggle?: (node: TreeNode) => void;
  /** Semantic palette. */
  readonly palette: AcidPalette;
}

const NODE_ICONS: Record<TreeNode['type'], string> = {
  directory: '▸',
  file: ' ',
  'agent-workspace': '⬡',
  modified: '~',
  untracked: '+'
};

const NODE_COLORS: Record<TreeNode['type'], keyof AcidPalette> = {
  directory: 'assistantAccent',
  file: 'frameBright',
  'agent-workspace': 'warning',
  modified: 'warning',
  untracked: 'success'
};

/**
 * BBS-style file/workspace tree browser.
 *
 * Renders a navigable file tree in the style of Acid Underworld's file browser:
 *
 *   ▸ src/                          <DIRECTORY>
 *     ▸ ink/                        <DIRECTORY>
 *       framed-panel.tsx            09/08/17  10:07p
 *     ~ workspace-shell.tsx         <MODIFIED>
 *     + new-component.tsx           <UNTRACKED>
 *
 * Navigation: ↑/↓ move cursor, Enter=select, D=diff, G=git status.
 * Active row is highlighted with accent background treatment.
 * Aesthetic: Acid Underworld file list — dense, monospace, column-aligned.
 */
export function WorkspaceTree({
  nodes,
  palette,
  onSelect,
  onToggle,
  onDiff,
  isFocused = true,
  cursorIndex: controlledCursor
}: WorkspaceTreeProps) {
  const [internalCursor, setInternalCursor] = useState(0);
  const cursor = controlledCursor ?? internalCursor;

  useInput(
    (input, key) => {
      if (key.upArrow) {
        setInternalCursor(c => Math.max(0, c - 1));
      } else if (key.downArrow) {
        setInternalCursor(c => Math.min(nodes.length - 1, c + 1));
      } else if (key.return) {
        const node = nodes[cursor];
        if (node) {
          if (node.type === 'directory') {
            onToggle?.(node);
          } else {
            onSelect?.(node);
          }
        }
      } else if (input === 'd' || input === 'D') {
        const node = nodes[cursor];
        if (node) {
          onDiff?.(node);
        }
      }
    },
    { isActive: isFocused }
  );

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={0}>
        <Text color={palette.frameBorder}>{'═'}</Text>
        <Text bold color={palette.frameBright}>
          {'Workspace'}
        </Text>
        <Text color={palette.frameBorder}>{'═'}</Text>
        <Box flexGrow={1} />
        <Text color={palette.muted} dimColor>
          {'[↑↓]nav [↵]open [D]iff'}
        </Text>
      </Box>

      {/* Tree rows */}
      {nodes.map((node, i) => {
        const isActive = i === cursor && isFocused;
        const indent = '  '.repeat(node.depth);
        const icon = node.expanded === false && node.type === 'directory' ? '▸' : (NODE_ICONS[node.type] ?? ' ');
        const colorKey = NODE_COLORS[node.type] ?? 'frameBright';
        const color = palette[colorKey];

        return (
          <Box flexDirection="row" key={node.id}>
            {/* Cursor indicator */}
            <Text color={palette.assistantAccent}>{isActive ? '▶' : ' '}</Text>
            {/* Indent + icon */}
            <Text color={palette.frameDim}>{indent}</Text>
            <Text bold={isActive} color={isActive ? palette.frameBright : color}>
              {icon} {node.name}
            </Text>
            {/* Meta column — right-aligned */}
            <Box flexGrow={1} />
            {node.meta ? (
              <Text color={palette.muted} dimColor>
                {node.meta}
              </Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
