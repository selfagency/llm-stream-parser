import { Box, Text } from 'ink';

import type { AcidPalette } from '../../theme/palette.js';

export type TaskStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled';

export interface ActiveTask {
  /** Optional byte/token count. */
  readonly bytes?: string;
  /** Elapsed time string (e.g. '1.2s'). */
  readonly elapsed?: string;
  /** Unique task id. */
  readonly id: string;
  /** Tool or operation name. */
  readonly name: string;
  /** Progress description (streaming output, current step). */
  readonly progress?: string;
  /** Current status. */
  readonly status: TaskStatus;
}

export interface TaskProgressProps {
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Spinner frame (caller manages animation tick). */
  readonly spinnerFrame?: string;
  /** Active tasks to display. */
  readonly tasks: readonly ActiveTask[];
}

const STATUS_ICONS: Record<TaskStatus, string> = {
  pending: '○',
  running: '◉',
  done: '●',
  error: '✗',
  cancelled: '◌'
};

const STATUS_COLORS: Record<TaskStatus, keyof AcidPalette> = {
  pending: 'muted',
  running: 'assistantAccent',
  done: 'success',
  error: 'error',
  cancelled: 'muted'
};

/**
 * BBS-style task/transfer progress panel.
 *
 * Renders active tool executions in the style of BBS transfer screens:
 *
 *   ═Active Tasks═══════════════════════════════════════
 *   ◉ read_file          src/index.ts          1.2s
 *     ↳ Reading 847 bytes...
 *   ◉ bash               pnpm check-types      0.4s
 *     ↳ Running type check...
 *   ● write_file         done                  0.8s  2.1k
 *   ✗ search             error: timeout        3.1s
 *
 * Running tasks show a spinner icon and streaming progress line.
 * Completed/error tasks show final status.
 */
export function TaskProgress({ tasks, palette, spinnerFrame = '◉' }: TaskProgressProps) {
  if (tasks.length === 0) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={palette.frameBorder}>{'═'}</Text>
          <Text bold color={palette.frameBright}>
            {'Active Tasks'}
          </Text>
          <Text color={palette.frameBorder}>{'═'}</Text>
        </Box>
        <Text color={palette.muted} dimColor>
          {'  no active tasks'}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        <Text color={palette.frameBorder}>{'═'}</Text>
        <Text bold color={palette.frameBright}>
          {'Active Tasks'}
        </Text>
        <Text color={palette.frameBorder}>{'═'}</Text>
        <Box flexGrow={1} />
        <Text color={palette.muted} dimColor>
          {tasks.filter(t => t.status === 'running').length}
          {' running'}
        </Text>
      </Box>

      {/* Task rows */}
      {tasks.map(task => {
        const colorKey = STATUS_COLORS[task.status] ?? 'frameBright';
        const color = palette[colorKey];
        const icon = task.status === 'running' ? spinnerFrame : (STATUS_ICONS[task.status] ?? '○');

        return (
          <Box flexDirection="column" key={task.id}>
            <Box flexDirection="row">
              {/* Status icon */}
              <Text bold color={color}>
                {icon}{' '}
              </Text>
              {/* Tool name — fixed 20-char column */}
              <Text bold color={palette.frameBright}>
                {task.name.padEnd(20).slice(0, 20)}
              </Text>
              {/* Progress/description */}
              <Text color={color}>{(task.progress ?? '').slice(0, 30).padEnd(30)}</Text>
              {/* Elapsed */}
              {task.elapsed ? (
                <Text color={palette.muted} dimColor>
                  {'  '}
                  {task.elapsed}
                </Text>
              ) : null}
              {/* Bytes */}
              {task.bytes ? (
                <Text color={palette.info}>
                  {'  '}
                  {task.bytes}
                </Text>
              ) : null}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
