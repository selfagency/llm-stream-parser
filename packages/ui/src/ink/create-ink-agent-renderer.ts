import type { InkRuntimeController } from './ink-runtime-state.js';
import type { AcidPalette } from './theme/palette.js';
import type { Theme } from './themes/types.js';

export interface InkAgentRendererOptions {
  controller: InkRuntimeController;
  onInput(text: string): Promise<void>;
  palette?: AcidPalette;
  theme?: Theme;
}

export interface InkAgentRendererHandle {
  unmount(): void;
  waitUntilExit(): Promise<void>;
}

interface HistoryEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export async function createInkAgentRenderer(options: InkAgentRendererOptions): Promise<InkAgentRendererHandle> {
  const { controller, onInput } = options;

  const [inkNS, reactNS, { default: InkStreamRenderer }, { MessageBubble }, { defaultTheme }, { defaultAcidPalette }] =
    await Promise.all([
      import('ink'),
      import('react'),
      import('./ink-stream-renderer.js'),
      import('./components/chat/message-bubble.js'),
      import('./themes/index.js'),
      import('./theme/palette.js')
    ]);

  const { render, Box, Text, useInput, useApp } = inkNS;
  const { createElement: h, useState, useRef, useCallback } = reactNS;

  const theme = options.theme ?? defaultTheme;
  const palette = options.palette ?? defaultAcidPalette;

  function AgentChatApp() {
    const [inputBuffer, setInputBuffer] = useState('');
    const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const submittingRef = useRef(false);
    const { exit } = useApp();

    const handleSubmit = useCallback(
      async (text: string) => {
        submittingRef.current = true;
        setInputBuffer('');
        setHistory(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);

        controller.stateRef.text = '';
        controller.stateRef.thinking = '';
        controller.stateRef.toolCalls = [];
        controller.stateRef.isStreaming = true;
        setIsStreaming(true);

        try {
          await onInput(text);
          const assistantText = controller.stateRef.text;
          setHistory(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: assistantText }]);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          setHistory(prev => [...prev, { id: `e-${Date.now()}`, role: 'assistant', text: `Error: ${msg}` }]);
        } finally {
          controller.stateRef.isStreaming = false;
          setIsStreaming(false);
          submittingRef.current = false;
        }
      },
      [controller.stateRef, onInput]
    );

    const handleReturn = useCallback(() => {
      const text = inputBuffer.trim();
      if (!text || submittingRef.current) {
        return;
      }
      handleSubmit(text);
    }, [inputBuffer, handleSubmit]);

    const handleBackspaceOrDelete = useCallback(() => {
      setInputBuffer(prev => prev.slice(0, -1));
    }, []);

    const handleCtrlC = useCallback(() => {
      exit();
    }, [exit]);

    const handleCharacterInput = useCallback((ch: string) => {
      setInputBuffer(prev => prev + ch);
    }, []);

    useInput(
      useCallback(
        (input: string, key: { return: boolean; backspace: boolean; delete: boolean; ctrl: boolean }) => {
          if (isStreaming) {
            return;
          }

          if (key.return) {
            handleReturn();
            return;
          }

          if (key.backspace || key.delete) {
            handleBackspaceOrDelete();
            return;
          }

          if (key.ctrl && input === 'c') {
            handleCtrlC();
            return;
          }

          if (input && !key.ctrl) {
            handleCharacterInput(input);
          }
        },
        [isStreaming, handleReturn, handleBackspaceOrDelete, handleCtrlC, handleCharacterInput]
      )
    );

    return h(
      Box,
      { flexDirection: 'column' },
      // Conversation history
      h(
        Box,
        { flexDirection: 'column' },
        ...history.map(entry =>
          h(MessageBubble, {
            key: entry.id,
            text: entry.text,
            role: entry.role,
            palette
          })
        )
      ),
      // Active stream rendering
      isStreaming
        ? h(InkStreamRenderer, {
            stateRef: controller.stateRef,
            forceUpdateRef: controller.forceUpdateRef,
            setForceUpdate: (fn: () => void) => {
              controller.forceUpdateRef.current = fn;
            },
            options: { theme, showThinking: true, showToolCalls: true }
          })
        : null,
      // Input prompt (only when not streaming)
      isStreaming
        ? null
        : h(
            Box,
            { flexDirection: 'row', marginTop: 1 },
            h(Text, { color: palette.userText, bold: true }, '\u25B8 '),
            h(Text, {}, inputBuffer),
            h(Text, { color: palette.frameDim }, '\u2587')
          )
    );
  }

  const { unmount, waitUntilExit: waitUntilExitRaw } = render(h(AgentChatApp, {}));

  return {
    unmount,
    waitUntilExit: async () => {
      await waitUntilExitRaw();
    }
  };
}
