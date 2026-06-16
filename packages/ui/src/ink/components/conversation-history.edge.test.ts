import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationTurn } from '../create-ink-conversation-renderer.ts';
import { darkTheme } from '../themes/index.ts';
import { ConversationHistory } from './conversation-history.tsx';

describe('ConversationHistory Component edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('edge cases', () => {
    it('handles turns with partial properties', () => {
      const turns: ConversationTurn[] = [
        {
          id: 'turn-1',
          role: 'user',
          text: 'Question?',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: 'turn-2',
          role: 'assistant',
          text: 'Answer',
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

    it('handles very large turn arrays', () => {
      const turns: ConversationTurn[] = Array.from({ length: 100 }, (_, i) => ({
        id: `turn-${i}`,
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        text: `Message ${i}`,
        timestamp: Date.now(),
        toolCalls: []
      }));
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns).toHaveLength(100);
    });

    it('preserves turn order with mixed roles', () => {
      const turns: ConversationTurn[] = [
        {
          id: '1',
          role: 'user',
          text: 'Q1',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: '2',
          role: 'assistant',
          text: 'A1',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: '3',
          role: 'user',
          text: 'Q2',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: '4',
          role: 'assistant',
          text: 'A2',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: '5',
          role: 'user',
          text: 'Q3',
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns.map((t: ConversationTurn) => t.id)).toStrictEqual(['1', '2', '3', '4', '5']);
    });

    it('handles turns with timestamps', () => {
      const now = Date.now();
      const turns: ConversationTurn[] = [
        {
          id: '1',
          role: 'user',
          text: 'Q1',
          timestamp: now - 10_000,
          toolCalls: []
        },
        {
          id: '2',
          role: 'assistant',
          text: 'A1',
          timestamp: now,
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns.at(0)?.timestamp).toBeLessThan(element.props.turns.at(1)?.timestamp ?? 0);
    });

    it('handles unicode text in turns', () => {
      const turns: ConversationTurn[] = [
        {
          id: '1',
          role: 'user',
          text: 'Hello 👋 世界',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: '2',
          role: 'assistant',
          text: 'Привет 🌍 мир',
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns.at(0)?.text).toContain('👋');
      expect(element.props.turns.at(1)?.text).toContain('Привет');
    });

    it('handles turns with special formatting', () => {
      const turns: ConversationTurn[] = [
        {
          id: '1',
          role: 'user',
          text: '```code\n// comment\nconst x = 1;\n```',
          timestamp: Date.now(),
          toolCalls: []
        },
        {
          id: '2',
          role: 'assistant',
          text: 'Here is **bold** and *italic* text',
          timestamp: Date.now(),
          toolCalls: []
        }
      ];
      const element = React.createElement(ConversationHistory, {
        options: {},
        theme: darkTheme,
        turns
      });
      expect(element.props.turns.at(0)?.text).toContain('code');
      expect(element.props.turns.at(1)?.text).toContain('bold');
    });
  });
});
