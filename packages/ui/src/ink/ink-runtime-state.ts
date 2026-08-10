import { randomUUID } from 'node:crypto';

import type { XmlToolCall } from '@agentsy/core/tool-calls';
import type { JsonObject } from '@agentsy/shared';
// @ts-expect-error -- ink has no default export; needed for type-only reference
import type typeInk from 'ink';
import type typeReact from 'react';

export interface InkToolCallState {
  arguments: JsonObject;
  done: boolean;
  id: string;
  name: string;
}

export interface InkRuntimeState {
  isStreaming: boolean;
  text: string;
  thinking: string;
  toolCalls: InkToolCallState[];
}

export interface InkRuntimeListeners {
  done: () => void;
  text: (delta: string) => void;
  thinking: (delta: string) => void;
  tool_call: (part: XmlToolCall) => void;
  warning: (message: string) => void;
}

export interface InkRuntimeController {
  forceUpdateRef: { current: () => void };
  listeners: InkRuntimeListeners;
  stateRef: InkRuntimeState;
}

export interface InkRuntimeControllerOptions {
  onFinish?: () => void;
  onWarning: (message: string) => void;
}

export interface InkRenderModules {
  ink: typeof typeInk;
  react: typeof typeReact;
}

export const createInkRuntimeController = (options: InkRuntimeControllerOptions): InkRuntimeController => {
  const stateRef: InkRuntimeState = {
    isStreaming: true,
    text: '',
    thinking: '',
    toolCalls: []
  };

  const forceUpdateRef = {
    current: () => {
      /* noop */
    }
  };

  const listeners: InkRuntimeListeners = {
    done: () => {
      stateRef.isStreaming = false;
      forceUpdateRef.current();
      options.onFinish?.();
    },
    text: (delta: string) => {
      stateRef.text += delta;
      forceUpdateRef.current();
    },
    thinking: (delta: string) => {
      stateRef.thinking += delta;
      forceUpdateRef.current();
    },
    tool_call: (part: XmlToolCall) => {
      stateRef.toolCalls.push({
        arguments: part.parameters,
        done: true,
        id: part.id ?? randomUUID(),
        name: part.name
      });
      forceUpdateRef.current();
    },
    warning: (message: string) => {
      options.onWarning(message);
    }
  };

  return {
    forceUpdateRef,
    listeners,
    stateRef
  };
};

export async function loadInkRenderModules(): Promise<InkRenderModules> {
  try {
    const ink = await import('ink');
    const react = await import('react');
    return { ink, react };
  } catch {
    throw new Error('ink and react are required peer dependencies. Install them with: pnpm add ink react');
  }
}
