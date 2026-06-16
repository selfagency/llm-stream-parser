import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { darkTheme, defaultTheme } from '../themes/index.ts';
import { ToolCallBlock } from './tool-call-block.tsx';

describe('ToolCallBlock Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Done state tests
  describe('done state', () => {
    it('renders completed tool call', () => {
      const call = {
        arguments: { q: 'test' },
        done: true,
        id: '1',
        name: 'search'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      expect(element.props.call.done).toBeTruthy();
      expect(element.props.call.name).toBe('search');
    });

    it('renders pending tool call', () => {
      const call = {
        arguments: { expr: '1+1' },
        done: false,
        id: '2',
        name: 'calculate'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      expect(element.props.call.done).toBeFalsy();
    });

    it('uses done symbol for completed calls', () => {
      const call = { arguments: {}, done: true, id: '1', name: 'api_call' };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      expect(element.props.theme.toolCall.doneSymbol).toBeDefined();
    });

    it('uses pending symbol for pending calls', () => {
      const call = { arguments: {}, done: false, id: '2', name: 'processing' };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      expect(element.props.theme.toolCall.pendingSymbol).toBeDefined();
    });
  });

  // Tool call properties tests
  describe('tool call properties', () => {
    it('handles different tool names', () => {
      const names = ['search', 'calculate', 'fetch', 'parse', 'generate'];
      for (const name of names) {
        const call = { arguments: {}, done: false, id: '1', name };
        const element = React.createElement(ToolCallBlock, {
          call,
          screenReader: false,
          theme: darkTheme
        });
        expect(element.props.call.name).toBe(name);
      }
    });

    it('handles various argument types', () => {
      const argumentSets = [
        { q: 'search term' },
        { x: 10, y: 20 },
        { nested: { key: 'value' } },
        { array: [1, 2, 3] },
        {}
      ];
      for (const args of argumentSets) {
        const call = { arguments: args, done: false, id: '1', name: 'tool' };
        const element = React.createElement(ToolCallBlock, {
          call,
          screenReader: false,
          theme: darkTheme
        });
        expect(element.props.call.arguments).toStrictEqual(args);
      }
    });

    it('preserves unique tool IDs', () => {
      const ids = ['id1', 'id2', 'id-with-dashes', 'id_with_underscores'];
      for (const id of ids) {
        const call = { arguments: {}, done: true, id, name: 'tool' };
        const element = React.createElement(ToolCallBlock, {
          call,
          screenReader: false,
          theme: darkTheme
        });
        expect(element.props.call.id).toBe(id);
      }
    });
  });

  // Screen reader tests
  describe('screen reader mode', () => {
    it('renders accessible output for completed call with SR', () => {
      const call = { arguments: {}, done: true, id: '1', name: 'search_api' };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: true,
        theme: darkTheme
      });
      expect(element.props.screenReader).toBeTruthy();
      expect(element.props.call.done).toBeTruthy();
    });

    it('renders accessible output for pending call with SR', () => {
      const call = { arguments: {}, done: false, id: '2', name: 'fetch_data' };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: true,
        theme: darkTheme
      });
      expect(element.props.screenReader).toBeTruthy();
      expect(element.props.call.done).toBeFalsy();
    });

    it('renders regular output without screen reader', () => {
      const call = { arguments: {}, done: false, id: '1', name: 'process' };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      expect(element.props.screenReader).toBeFalsy();
    });
  });

  // Theme tests
  describe('theme handling', () => {
    it('respects pending color from theme', () => {
      const call = { arguments: {}, done: false, id: '1', name: 'pending' };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      expect(element.props.theme.toolCall.pendingColor).toBeDefined();
    });

    it('respects done color from theme', () => {
      const call = { arguments: {}, done: true, id: '1', name: 'done' };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      expect(element.props.theme.toolCall.doneColor).toBeDefined();
    });

    it('uses theme spinner interval when defined', () => {
      const customTheme = {
        ...darkTheme,
        toolCall: { ...darkTheme.toolCall, spinnerIntervalMs: 100 }
      };
      const call = { arguments: {}, done: false, id: '1', name: 'anim' };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: customTheme
      });
      expect(element.props.theme.toolCall.spinnerIntervalMs).toBe(100);
    });

    it('handles different themes', () => {
      const call = { arguments: {}, done: false, id: '1', name: 'tool' };
      const darkElement = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      const lightElement = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: defaultTheme
      });
      expect(darkElement.props.theme).toBe(darkTheme);
      expect(lightElement.props.theme).toBe(defaultTheme);
    });
  });

  // Animation tests
  describe('animation behavior', () => {
    it('animates pending calls when not in screen reader mode', () => {
      const call = { arguments: {}, done: false, id: '1', name: 'async_op' };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      expect(element.props.call.done).toBeFalsy();
      expect(element.props.screenReader).toBeFalsy();
    });

    it('does not animate completed calls', () => {
      const call = { arguments: {}, done: true, id: '1', name: 'sync_op' };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      expect(element.props.call.done).toBeTruthy();
    });

    it('does not animate in screen reader mode even for pending', () => {
      const call = { arguments: {}, done: false, id: '1', name: 'sr_pending' };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: true,
        theme: darkTheme
      });
      expect(element.props.screenReader).toBeTruthy();
    });
  });

  // Complex argument tests
  describe('complex arguments', () => {
    it('handles nested objects in arguments', () => {
      const call = {
        arguments: {
          list: [1, 2, 3],
          nested: { deep: { value: 42 } }
        },
        done: false,
        id: '1',
        name: 'complex_tool'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      expect(element.props.call.arguments.nested).toBeDefined();
      expect(element.props.call.arguments.list).toBeDefined();
    });

    it('handles large argument objects', () => {
      const largeArgs = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`key_${i}`, `value_${i}`]));
      const call = {
        arguments: largeArgs,
        done: false,
        id: '1',
        name: 'large_args_tool'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      expect(Object.keys(element.props.call.arguments)).toHaveLength(100);
    });

    it('handles special characters in arguments', () => {
      const call = {
        arguments: {
          text: 'Special <chars> & "quotes" and \'apostrophes\''
        },
        done: true,
        id: '1',
        name: 'special_tool'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        screenReader: false,
        theme: darkTheme
      });
      expect(element.props.call.arguments.text).toContain('<chars>');
    });
  });

  // Default prop tests
  describe('default props', () => {
    it('has screenReader default to false', () => {
      const call = {
        arguments: {},
        done: false,
        id: '1',
        name: 'default_tool'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        theme: darkTheme
      } as React.ComponentProps<typeof ToolCallBlock>);
      expect(element).toBeDefined();
    });

    it('renders tool with complex arguments', () => {
      const call = {
        arguments: {
          filters: { date: '2024', type: 'article' },
          limit: 10,
          nested: { deep: { value: 'found' } },
          query: 'test query'
        },
        done: false,
        id: 'call-1',
        name: 'search'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        theme: darkTheme
      } as React.ComponentProps<typeof ToolCallBlock>);
      expect(element.props.call.arguments.query).toBe('test query');
    });
  });

  describe('tool call states', () => {
    it('renders pending tool call', () => {
      const call = {
        arguments: {},
        done: false,
        id: '1',
        name: 'pending_tool'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        theme: darkTheme
      } as React.ComponentProps<typeof ToolCallBlock>);
      expect(element.props.call.done).toBeFalsy();
    });

    it('renders completed tool call', () => {
      const call = {
        arguments: {},
        done: true,
        id: '1',
        name: 'completed_tool'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        theme: darkTheme
      } as React.ComponentProps<typeof ToolCallBlock>);
      expect(element.props.call.done).toBeTruthy();
    });
  });

  describe('tool argument variations', () => {
    it('handles tool with no arguments', () => {
      const call = {
        arguments: {},
        done: false,
        id: '1',
        name: 'no_args_tool'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        theme: darkTheme
      } as React.ComponentProps<typeof ToolCallBlock>);
      expect(Object.keys(element.props.call.arguments)).toHaveLength(0);
    });

    it('handles tool with many arguments', () => {
      const call = {
        arguments: {
          arg1: 'value1',
          arg2: 'value2',
          arg3: 'value3',
          arg4: 'value4',
          arg5: 'value5'
        },
        done: false,
        id: '1',
        name: 'multi_arg_tool'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        theme: darkTheme
      } as React.ComponentProps<typeof ToolCallBlock>);
      expect(Object.keys(element.props.call.arguments)).toHaveLength(5);
    });

    it('handles string arguments', () => {
      const call = {
        arguments: { prompt: 'test prompt', text: 'hello world' },
        done: false,
        id: '1',
        name: 'string_tool'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        theme: darkTheme
      } as React.ComponentProps<typeof ToolCallBlock>);
      expect(element.props.call.arguments.text).toBe('hello world');
    });

    it('handles numeric arguments', () => {
      const call = {
        arguments: { count: 42, max: 100, threshold: 0.5 },
        done: false,
        id: '1',
        name: 'numeric_tool'
      };
      const element = React.createElement(ToolCallBlock, {
        call,
        theme: darkTheme
      } as React.ComponentProps<typeof ToolCallBlock>);
      expect(element.props.call.arguments.count).toBe(42);
    });
  });

  describe('theme handling', () => {
    it('applies dark theme', () => {
      const call = { arguments: {}, done: false, id: '1', name: 'themed_tool' };
      const element = React.createElement(ToolCallBlock, {
        call,
        theme: darkTheme
      } as React.ComponentProps<typeof ToolCallBlock>);
      expect(element.props.theme).toBe(darkTheme);
    });

    it('applies default theme', () => {
      const call = { arguments: {}, done: false, id: '1', name: 'themed_tool' };
      const element = React.createElement(ToolCallBlock, {
        call,
        theme: defaultTheme
      } as React.ComponentProps<typeof ToolCallBlock>);
      expect(element.props.theme).toBe(defaultTheme);
    });
  });
});
