import type { JsonObject } from '@agentsy/shared';
import { Box } from 'ink';
import { useEffect, useState } from 'react';

import type { KeyboardOptions } from './components/keyboard-handler.js';
import { KeyboardHandler } from './components/keyboard-handler.js';
import { StreamingText } from './components/streaming-text.js';
import { ThinkingBlock } from './components/thinking-block.js';
import { ToolCallBlock } from './components/tool-call-block.js';
import type { Theme } from './themes/types.js';

interface InkStreamRendererProps {
  readonly forceUpdateRef: { current: () => void };
  readonly options: {
    readonly showThinking?: boolean | undefined;
    readonly thinkingStyle?: 'blockquote' | 'inline' | 'suppress' | undefined;
    readonly showToolCalls?: boolean | undefined;
    readonly markdown?: boolean | undefined;
    readonly theme: Theme;
    readonly screenReader?: boolean | undefined;
    readonly syntaxHighlight?: boolean | undefined;
    readonly keyboard?: KeyboardOptions | undefined;
  };
  readonly setForceUpdate: (fn: () => void) => void;
  readonly stateRef: {
    text: string;
    thinking: string;
    toolCalls: readonly {
      id: string;
      name: string;
      arguments: JsonObject;
      done: boolean;
    }[];
    isStreaming: boolean;
  };
}

interface RenderOptions {
  readonly markdown: boolean;
  readonly screenReader: boolean;
  readonly showThinking: boolean;
  readonly showToolCalls: boolean;
  readonly syntaxHighlight: boolean;
  readonly theme: Theme;
  readonly thinkingStyle: 'blockquote' | 'inline' | 'suppress';
}

function ToolCallsRenderer({
  toolCalls,
  theme,
  screenReader
}: {
  readonly toolCalls: readonly {
    id: string;
    name: string;
    arguments: JsonObject;
    done: boolean;
  }[];
  readonly theme: Theme;
  readonly screenReader: boolean;
}) {
  if (!toolCalls.length) {
    return null;
  }
  return (
    <>
      {toolCalls.map(call => (
        <ToolCallBlock call={call} key={call.id} screenReader={screenReader} theme={theme} />
      ))}
    </>
  );
}

function ThinkingSection({
  thinking,
  isStreaming,
  options
}: {
  readonly thinking: string;
  readonly isStreaming: boolean;
  readonly options: RenderOptions;
}) {
  if (!(options.showThinking && thinking)) {
    return null;
  }
  return (
    <ThinkingBlock
      isStreaming={isStreaming}
      screenReader={options.screenReader}
      style={options.thinkingStyle}
      text={thinking}
      theme={options.theme}
    />
  );
}

function ToolCallsSection({
  toolCalls,
  options
}: {
  readonly toolCalls: readonly {
    id: string;
    name: string;
    arguments: JsonObject;
    done: boolean;
  }[];
  readonly options: RenderOptions;
}) {
  if (!options.showToolCalls) {
    return null;
  }
  return <ToolCallsRenderer screenReader={options.screenReader} theme={options.theme} toolCalls={toolCalls} />;
}

function ThinkingContent({
  thinking,
  isStreaming,
  options
}: {
  readonly thinking: string;
  readonly isStreaming: boolean;
  readonly options: RenderOptions;
}) {
  return <ThinkingSection isStreaming={isStreaming} options={options} thinking={thinking} />;
}

function ToolCallsContent({
  toolCalls,
  options
}: {
  readonly toolCalls: readonly {
    id: string;
    name: string;
    arguments: JsonObject;
    done: boolean;
  }[];
  readonly options: RenderOptions;
}) {
  return <ToolCallsSection options={options} toolCalls={toolCalls} />;
}

function TextContent({
  text,
  isStreaming,
  options
}: {
  readonly text: string;
  readonly isStreaming: boolean;
  readonly options: RenderOptions;
}) {
  return (
    <StreamingText
      isStreaming={isStreaming}
      markdown={options.markdown}
      screenReader={options.screenReader}
      syntaxHighlight={options.syntaxHighlight}
      text={text}
      theme={options.theme}
    />
  );
}

function ContentRenderer({
  text,
  thinking,
  toolCalls,
  isStreaming,
  options
}: {
  readonly text: string;
  readonly thinking: string;
  readonly toolCalls: readonly {
    id: string;
    name: string;
    arguments: JsonObject;
    done: boolean;
  }[];
  readonly isStreaming: boolean;
  readonly options: RenderOptions;
}) {
  return (
    <Box flexDirection="column">
      <ThinkingContent isStreaming={isStreaming} options={options} thinking={thinking} />
      <ToolCallsContent options={options} toolCalls={toolCalls} />
      <TextContent isStreaming={isStreaming} options={options} text={text} />
    </Box>
  );
}

function buildRenderOptions(options: InkStreamRendererProps['options']): RenderOptions {
  return {
    markdown: options.markdown ?? true,
    screenReader: options.screenReader ?? false,
    showThinking: options.showThinking ?? true,
    showToolCalls: options.showToolCalls ?? true,
    syntaxHighlight: options.syntaxHighlight ?? false,
    theme: options.theme,
    thinkingStyle: options.thinkingStyle ?? 'blockquote'
  };
}

// fallow-ignore-next-line unused-export
export default function InkStreamRenderer({
  stateRef,
  forceUpdateRef: _forceUpdateRef,
  setForceUpdate,
  options
}: InkStreamRendererProps) {
  // nosemgrep: react-use-state-destructure
  // _tick is intentionally unused; setTick is used to force re-renders when stateRef is mutated externally.
  const [_tick, setTick] = useState(0);

  useEffect(() => {
    setForceUpdate(() => {
      setTick(t => t + 1);
    });
  }, [setForceUpdate]);

  const renderOptions = buildRenderOptions(options);

  return (
    <Box flexDirection="column">
      <ContentRenderer
        isStreaming={stateRef.isStreaming}
        options={renderOptions}
        text={stateRef.text}
        thinking={stateRef.thinking}
        toolCalls={stateRef.toolCalls}
      />
      {options.keyboard?.enabled === true && <KeyboardHandler keyboard={options.keyboard} />}
    </Box>
  );
}
