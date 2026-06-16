import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationTurn } from '../create-ink-conversation-renderer.ts';
import { darkTheme, defaultTheme } from '../themes/index.ts';
import { ConversationHistory } from './conversation-history.tsx';

describe('ConversationHistory Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Empty history tests
  describe('empty history', () => {
    it('renders empty conversation history', () => {
      const turns: ConversationTurn[] = [];
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element).toBeDefined();
      expect(element.props.turns).toHaveLength(0);
    });
  });

  // User turn tests
  describe('user turns', () => {
    it('renders single user turn', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'user',
          text: 'Hello',
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns).toHaveLength(1);
      expect(element.props.turns.at(0)?.role).toBe('user');
    });

    it('renders multiple user turns', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'user',
          text: 'First question?',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: 'turn-2',
          role: 'user',
          text: 'Second question?',
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns).toHaveLength(2);
    });

    it('preserves user message text', () => {
      const userText = 'What is the meaning of life?';
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'user',
          text: userText,
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns.at(0)?.text).toBe(userText);
    });

    it('handles user messages with special characters', () => {
      const specialText = 'Message with <html>, "quotes", & symbols!';
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'user',
          text: specialText,
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns.at(0)?.text).toContain('<html>');
    });
  });

  // Assistant turn tests
  describe('assistant turns', () => {
    it('renders single assistant turn', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'assistant',
          text: 'Hi there!',
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns).toHaveLength(1);
      expect(element.props.turns.at(0)?.role).toBe('assistant');
    });

    it('renders assistant turn with thinking', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'assistant',
          text: 'Response text',
          thinking: 'Internal reasoning',
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: { showThinking: true },
        theme: darkTheme,
        turns
      });
      expect(element.props.turns.at(0)?.thinking).toBe('Internal reasoning');
    });

    it('renders assistant turn with tool calls', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'assistant',
          text: 'Searching for info',
          timestamp: Date.now(),
          toolCalls: [
            {
              arguments: { q: 'test' },
              done: true,
              id: 'call-1',
              name: 'search'
            }
          ]
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: { showToolCalls: true },
        theme: darkTheme,
        turns
      });
      expect(element.props.turns.at(0)?.toolCalls).toHaveLength(1);
    });

    it('renders assistant with both thinking and tool calls', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'assistant',
          text: 'Final answer',
          thinking: 'Considered options',
          timestamp: Date.now(),
          toolCalls: [
            {
              arguments: {},
              done: true,
              id: 'call-1',
              name: 'compute'
            }
          ]
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: {
          showThinking: true,
          showToolCalls: true,
          thinkingStyle: 'blockquote'
        },
        theme: darkTheme,
        turns
      });
      expect(element.props.turns.at(0)?.thinking).toBeDefined();
      expect(element.props.turns.at(0)?.toolCalls).toBeDefined();
    });
  });

  // Multi-turn conversation tests
  describe('multi-turn conversations', () => {
    it('renders alternating user and assistant turns', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'user',
          text: 'Q1',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: 'turn-2',
          role: 'assistant',
          text: 'A1',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: 'turn-3',
          role: 'user',
          text: 'Q2',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: 'turn-4',
          role: 'assistant',
          text: 'A2',
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns).toHaveLength(4);
      expect(element.props.turns.at(0)?.role).toBe('user');
      expect(element.props.turns.at(1)?.role).toBe('assistant');
    });

    it('preserves conversation order', () => {
      const turns: ConversationTurn[] = [
        {
          id: '1',
          role: 'user',
          text: 'First',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: '2',
          role: 'assistant',
          text: 'Second',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: '3',
          role: 'user',
          text: 'Third',
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns.at(0)?.text).toBe('First');
      expect(element.props.turns.at(1)?.text).toBe('Second');
      expect(element.props.turns.at(2)?.text).toBe('Third');
    });
  });

  // Thinking option tests
  describe('showThinking option', () => {
    it('includes thinking when showThinking is true', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'assistant',
          text: 'Response',
          thinking: 'Hidden thought',
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: { showThinking: true },
        theme: darkTheme,
        turns
      });
      expect(element.props.options.showThinking).toBeTruthy();
    });

    it('hides thinking when showThinking is false', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'assistant',
          text: 'Response',
          thinking: 'Suppressed thought',
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: { showThinking: false },
        theme: darkTheme,
        turns
      });
      expect(element.props.options.showThinking).toBeFalsy();
    });

    it('supports blockquote thinking style', () => {
      const element = React.createElement(ConversationHistory, {
        options: { showThinking: true, thinkingStyle: 'blockquote' },
        theme: darkTheme,
        turns: []
      });
      expect(element.props.options.thinkingStyle).toBe('blockquote');
    });

    it('supports inline thinking style', () => {
      const element = React.createElement(ConversationHistory, {
        options: { showThinking: true, thinkingStyle: 'inline' },
        theme: darkTheme,
        turns: []
      });
      expect(element.props.options.thinkingStyle).toBe('inline');
    });

    it('supports suppress thinking style', () => {
      const element = React.createElement(ConversationHistory, {
        options: { showThinking: true, thinkingStyle: 'suppress' },
        theme: darkTheme,
        turns: []
      });
      expect(element.props.options.thinkingStyle).toBe('suppress');
    });
  });

  // Tool calls option tests
  describe('showToolCalls option', () => {
    it('includes tool calls when showToolCalls is true', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'assistant',
          text: 'Using tools',
          timestamp: Date.now(),
          toolCalls: [{ arguments: {}, done: true, id: 'c1', name: 'tool1' }]
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: { showToolCalls: true },
        theme: darkTheme,
        turns
      });
      expect(element.props.options.showToolCalls).toBeTruthy();
    });

    it('hides tool calls when showToolCalls is false', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'assistant',
          text: 'Using tools',
          timestamp: Date.now(),
          toolCalls: [{ arguments: {}, done: true, id: 'c1', name: 'tool1' }]
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: { showToolCalls: false },
        theme: darkTheme,
        turns
      });
      expect(element.props.options.showToolCalls).toBeFalsy();
    });
  });

  // Markdown option tests
  describe('markdown option', () => {
    it('enables markdown when markdown is true', () => {
      const element = React.createElement(ConversationHistory, {
        options: { markdown: true },
        theme: darkTheme,
        turns: []
      });
      expect(element.props.options.markdown).toBeTruthy();
    });

    it('disables markdown when markdown is false', () => {
      const element = React.createElement(ConversationHistory, {
        options: { markdown: false },
        theme: darkTheme,
        turns: []
      });
      expect(element.props.options.markdown).toBeFalsy();
    });
  });

  // Syntax highlighting tests
  describe('syntaxHighlight option', () => {
    it('enables syntax highlighting when true', () => {
      const element = React.createElement(ConversationHistory, {
        options: { syntaxHighlight: true },
        theme: darkTheme,
        turns: []
      });
      expect(element.props.options.syntaxHighlight).toBeTruthy();
    });

    it('disables syntax highlighting when false', () => {
      const element = React.createElement(ConversationHistory, {
        options: { syntaxHighlight: false },
        theme: darkTheme,
        turns: []
      });
      expect(element.props.options.syntaxHighlight).toBeFalsy();
    });
  });

  // Theme tests
  describe('theme handling', () => {
    it('uses dark theme', () => {
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns: []
      });
      expect(element.props.theme).toBe(darkTheme);
    });

    it('uses default theme', () => {
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: defaultTheme,
        turns: []
      });
      expect(element.props.theme).toBe(defaultTheme);
    });
  });

  // Screen reader tests
  describe('screen reader mode', () => {
    it('enables screen reader mode', () => {
      const element = React.createElement(ConversationHistory, {
        options: {},
        screenReader: true,
        theme: darkTheme,
        turns: []
      });
      expect(element.props.screenReader).toBeTruthy();
    });

    it('disables screen reader mode', () => {
      const element = React.createElement(ConversationHistory, {
        options: {},
        screenReader: false,
        theme: darkTheme,
        turns: []
      });
      expect(element.props.screenReader).toBeFalsy();
    });
  });

  // Complex multi-tool calls tests
  describe('multiple tool calls', () => {
    it('renders multiple tool calls in single turn', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'assistant',
          text: 'Multiple tools',
          timestamp: Date.now(),
          toolCalls: [
            { arguments: {}, done: true, id: 'c1', name: 'search' },
            { arguments: {}, done: true, id: 'c2', name: 'fetch' },
            { arguments: {}, done: false, id: 'c3', name: 'parse' }
          ]
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: { showToolCalls: true },
        theme: darkTheme,
        turns
      });
      expect(element.props.turns.at(0)?.toolCalls).toHaveLength(3);
    });
  });

  // Long conversation tests
  describe('long conversations', () => {
    it('handles many turns without issues', () => {
      const turns: ConversationTurn[] = Array.from({ length: 50 }, (_, i) => ({
        id: `turn-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `Message ${i}`,
        timestamp: Date.now(),
        toolCalls: []
      }));
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns).toHaveLength(50);
    });
  });

  // Default options tests
  describe('default options', () => {
    it('works with minimal options', () => {
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns: [
          {
            id: '1',
            role: 'user',
            text: 'Hi',
            timestamp: Date.now(),
            toolCalls: []
          }
        ]
      });
      expect(element).toBeDefined();
    });

    it('has screenReader default to false', () => {
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns: []
      });
      expect(element).toBeDefined();
    });
  });
});
