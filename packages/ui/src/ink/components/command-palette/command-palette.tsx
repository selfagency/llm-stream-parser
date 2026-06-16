import { Box, Text, useInput } from 'ink';

import type { AcidPalette } from '../../theme/palette.js';

export interface CommandEntry {
  /** Optional badge/tag (e.g. 'NEW!', '3'). */
  readonly badge?: string;
  /** Whether this entry is currently available. */
  readonly enabled?: boolean;
  /** Single-key hotkey (e.g. 'r', 'p', 'a'). */
  readonly key: string;
  /** Display label. */
  readonly label: string;
}

export interface CommandGroup {
  /** Commands in this group. */
  readonly entries: readonly CommandEntry[];
  /** Group header label (e.g. 'Agent Commands'). */
  readonly header: string;
}

export interface CommandPaletteProps {
  /** Command groups to render in columns. Max 3 groups for 3-column layout. */
  readonly groups: readonly CommandGroup[];
  /** Whether this palette is focused (receives keyboard input). */
  readonly isFocused?: boolean;
  /** Called when a command key is pressed. */
  readonly onCommand?: (key: string) => void;
  /** Semantic palette. */
  readonly palette: AcidPalette;
}

/**
 * BBS-style 3-column command palette.
 *
 * Renders hotkey-driven command grid in the style of Equalizer / Cave BBS:
 *
 *   ═Agent Commands══════  ═Session══════════  ═System══════════
 *   [R] Run Agent          [N] New Session     [C] Config
 *   [P] Plan Task          [L] Load Session    [M] Model Select
 *   [A] Approve            [S] Save Session    [Q] Quit
 *   [E] Edit Prompt        [H] History         [?] Help
 *
 * Hotkey letter is highlighted in accent color; rest of label in normal text.
 * Disabled entries are dimmed. Badge appears after label in warning color.
 */
export function CommandPalette({ groups, palette, onCommand, isFocused = true }: CommandPaletteProps) {
  useInput(
    input => {
      if (onCommand) {
        const lower = input.toLowerCase();
        for (const group of groups) {
          const match = group.entries.find(e => e.key.toLowerCase() === lower && (e.enabled ?? true));
          if (match) {
            onCommand(match.key);
            return;
          }
        }
      }
    },
    { isActive: isFocused }
  );

  // Pad groups to always render 3 columns
  const cols = [...groups].slice(0, 3);
  while (cols.length < 3) {
    cols.push({ header: '', entries: [] });
  }

  return (
    <Box flexDirection="column">
      {/* Column headers — ═Section Header═ style */}
      <Box flexDirection="row">
        {cols.map((group, i) => (
          <Box flexBasis={0} flexGrow={1} key={group.header || `col-${i}`}>
            {group.header ? (
              <Text color={palette.frameBorder}>
                {'═'}
                <Text bold color={palette.frameBright}>
                  {group.header}
                </Text>
                {'═'}
              </Text>
            ) : null}
          </Box>
        ))}
      </Box>

      {/* Command rows — render row by row across columns */}
      {renderCommandRows(cols, palette)}
    </Box>
  );
}

function renderCommandRows(cols: readonly CommandGroup[], palette: AcidPalette) {
  const maxRows = Math.max(...cols.map(g => g.entries.length));
  const rows: React.ReactElement[] = [];

  for (let row = 0; row < maxRows; row++) {
    rows.push(
      <Box flexDirection="row" key={row}>
        {cols.map((group, colIdx) => {
          const entry = group.entries.at(row);
          return (
            <Box flexBasis={0} flexGrow={1} key={group.header || `col-${colIdx}`}>
              {entry ? <CommandEntryRow entry={entry} palette={palette} /> : null}
            </Box>
          );
        })}
      </Box>
    );
  }

  return rows;
}

interface CommandEntryRowProps {
  readonly entry: CommandEntry;
  readonly palette: AcidPalette;
}

function CommandEntryRow({ entry, palette }: CommandEntryRowProps) {
  const enabled = entry.enabled ?? true;
  const keyColor = enabled ? palette.assistantAccent : palette.muted;
  const labelColor = enabled ? palette.frameBright : palette.muted;

  return (
    <Box flexDirection="row">
      <Text color={palette.frameDim}>{'['}</Text>
      <Text bold color={keyColor}>
        {entry.key.toUpperCase()}
      </Text>
      <Text color={palette.frameDim}>{'] '}</Text>
      <Text color={labelColor} dimColor={!enabled}>
        {entry.label}
      </Text>
      {entry.badge ? (
        <Text bold color={palette.warning}>
          {' '}
          {entry.badge}
        </Text>
      ) : null}
    </Box>
  );
}
