import { describe, expect, it } from 'vitest';
import type { Message } from './state/schema.js';
import { SessionTree } from './tree.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function msg(content: string, role: Message['role'] = 'user'): Message {
  return { content, role };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionTree', () => {
  describe('addEntry', () => {
    it('creates a root entry when no parentId is given', () => {
      const tree = new SessionTree();
      const entry = tree.addEntry([msg('hello')]);
      expect(entry.id).toBeTypeOf('string');
      expect(entry.parentId).toBeNull();
      expect(entry.messages).toEqual([msg('hello')]);
      expect(entry.createdAt).toBeTypeOf('string');
    });

    it('creates a child entry when parentId is given', () => {
      const tree = new SessionTree();
      const root = tree.addEntry([msg('root')]);
      const child = tree.addEntry([msg('child')], root.id);

      expect(child.parentId).toBe(root.id);
      expect(child.messages).toEqual([msg('child')]);
    });

    it('throws when parentId refers to a non-existent entry', () => {
      const tree = new SessionTree();
      expect(() => tree.addEntry([msg('orphan')], 'nonexistent')).toThrow(/not found/i);
    });

    it('supports multiple children under the same parent', () => {
      const tree = new SessionTree();
      const root = tree.addEntry([msg('root')]);
      const a = tree.addEntry([msg('a')], root.id);
      const b = tree.addEntry([msg('b')], root.id);

      expect(a.parentId).toBe(root.id);
      expect(b.parentId).toBe(root.id);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('fork', () => {
    it('creates a new root entry with all ancestor messages', () => {
      const tree = new SessionTree();
      const root = tree.addEntry([msg('m1')]);
      const child = tree.addEntry([msg('m2')], root.id);
      const grandchild = tree.addEntry([msg('m3')], child.id);

      const forked = tree.fork(grandchild.id);

      expect(forked.parentId).toBeNull();
      // Should contain m1 + m2 + m3 in order
      expect(forked.messages).toHaveLength(3);
      expect(forked.messages[0]?.content).toBe('m1');
      expect(forked.messages[1]?.content).toBe('m2');
      expect(forked.messages[2]?.content).toBe('m3');
    });

    it('preserves message order from root to forked entry', () => {
      const tree = new SessionTree();
      const root = tree.addEntry([msg('first')]);
      const child = tree.addEntry([msg('second')], root.id);

      const forked = tree.fork(child.id);
      expect(forked.messages.map(m => m.content)).toEqual(['first', 'second']);
    });

    it('throws when fromEntryId does not exist', () => {
      const tree = new SessionTree();
      expect(() => tree.fork('missing')).toThrow(/not found/i);
    });

    it('fork from root copies only root messages', () => {
      const tree = new SessionTree();
      const root = tree.addEntry([msg('only')]);
      const forked = tree.fork(root.id);

      expect(forked.messages).toHaveLength(1);
      expect(forked.messages[0]?.content).toBe('only');
      expect(forked.parentId).toBeNull();
    });
  });

  describe('clone', () => {
    it('clones a single leaf entry', () => {
      const tree = new SessionTree();
      const root = tree.addEntry([msg('root')]);
      const cloned = tree.clone(root.id);

      expect(cloned).toHaveLength(1);
      expect(cloned[0]?.id).not.toBe(root.id);
      expect(cloned[0]?.parentId).toBeNull();
      expect(cloned[0]?.messages).toEqual([msg('root')]);
    });

    it('clones an entry and all its descendants', () => {
      const tree = new SessionTree();
      const root = tree.addEntry([msg('root')]);
      const child = tree.addEntry([msg('child')], root.id);
      const _grandchild = tree.addEntry([msg('gc')], child.id);

      const cloned = tree.clone(child.id);

      // child + grandchild should be cloned
      expect(cloned).toHaveLength(2);
      expect(cloned[0]?.parentId).toBeNull(); // cloned child is root in cloned branch
      expect(cloned[1]?.parentId).toBe(cloned[0]?.id); // cloned gc's parent is cloned child
    });

    it('preserves message content in cloned entries', () => {
      const tree = new SessionTree();
      const root = tree.addEntry([msg('do'), msg('re')]);
      const _child = tree.addEntry([msg('mi')], root.id);

      const [clonedRoot] = tree.clone(root.id);
      expect(clonedRoot?.messages.map(m => m.content)).toEqual(['do', 're']);
    });

    it('throws when branchEntryId does not exist', () => {
      const tree = new SessionTree();
      expect(() => tree.clone('missing')).toThrow(/not found/i);
    });
  });

  describe('getTree', () => {
    it('returns empty array for tree with no entries', () => {
      const tree = new SessionTree();
      expect(tree.getTree()).toEqual([]);
    });

    it('returns roots with nested children', () => {
      const tree = new SessionTree();
      const root = tree.addEntry([msg('root')]);
      const child = tree.addEntry([msg('child')], root.id);
      const grandchild = tree.addEntry([msg('gc')], child.id);

      const treeNodes = tree.getTree();
      expect(treeNodes).toHaveLength(1);
      expect(treeNodes[0]?.entry.id).toBe(root.id);
      expect(treeNodes[0]?.children).toHaveLength(1);
      expect(treeNodes[0]?.children[0]?.entry.id).toBe(child.id);
      expect(treeNodes[0]?.children[0]?.children).toHaveLength(1);
      expect(treeNodes[0]?.children[0]?.children[0]?.entry.id).toBe(grandchild.id);
    });

    it('handles multiple root entries', () => {
      const tree = new SessionTree();
      tree.addEntry([msg('a')]);
      tree.addEntry([msg('b')]);
      expect(tree.getTree()).toHaveLength(2);
    });
  });

  describe('summarizeLongRunning', () => {
    it('returns entries whose message count meets the threshold', () => {
      const tree = new SessionTree();
      tree.addEntry([msg('a'), msg('b'), msg('c'), msg('d'), msg('e')]); // 5 messages
      const shortEntry = tree.addEntry([msg('x')]); // 1 message

      const longRunning = tree.summarizeLongRunning(5);
      expect(longRunning).toHaveLength(1);
      expect(longRunning[0]?.id).not.toBe(shortEntry.id);
    });

    it('returns entries whose depth meets the threshold', () => {
      const tree = new SessionTree();
      const root = tree.addEntry([msg('r')]);
      const a = tree.addEntry([msg('a')], root.id);
      const b = tree.addEntry([msg('b')], a.id);
      const c = tree.addEntry([msg('c')], b.id);
      const d = tree.addEntry([msg('d')], c.id);
      // depth 0: root, depth 1: a, depth 2: b, depth 3: c, depth 4: d

      const longRunning = tree.summarizeLongRunning(4);
      // Entry at depth >= 4 from root
      expect(longRunning.map(e => e.id)).toContain(d.id);
      expect(longRunning.map(e => e.id)).not.toContain(root.id);
    });

    it('returns empty when no entries exceed threshold', () => {
      const tree = new SessionTree();
      tree.addEntry([msg('a')]);
      tree.addEntry([msg('b')]);
      expect(tree.summarizeLongRunning(10)).toEqual([]);
    });
  });

  describe('parentId integrity', () => {
    it('preserves correct parentId after multiple operations', () => {
      const tree = new SessionTree();
      const root = tree.addEntry([msg('root')]);
      const child = tree.addEntry([msg('c')], root.id);
      const forkEntry = tree.fork(child.id);

      // Fork creates a root entry
      expect(forkEntry.parentId).toBeNull();

      // Original parent relationship still intact
      expect(child.parentId).toBe(root.id);
    });

    it('clone maintains correct parentId relationships within cloned branch', () => {
      const tree = new SessionTree();
      const root = tree.addEntry([msg('r')]);
      const a = tree.addEntry([msg('a')], root.id);
      const _b = tree.addEntry([msg('b')], a.id);

      const cloned = tree.clone(root.id);
      expect(cloned).toHaveLength(3);

      // Root clone has no parent
      expect(cloned[0]?.parentId).toBeNull();
      // a clone's parent is root clone
      expect(cloned[1]?.parentId).toBe(cloned[0]?.id);
      // b clone's parent is a clone
      expect(cloned[2]?.parentId).toBe(cloned[1]?.id);
    });
  });
});
