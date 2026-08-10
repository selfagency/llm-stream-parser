import { describe, expect, it } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { ServiceHost } from './service-host.js';

describe('ServiceHost', () => {
  const logger = createMockLogger();

  it('should register and retrieve a service', () => {
    const host = new ServiceHost({ logger });
    host.register('test', { value: 42 });
    expect(host.get<{ value: number }>('test')?.value).toBe(42);
    expect(host.count()).toBe(1);
  });

  it('should unregister a service', () => {
    const host = new ServiceHost({ logger });
    host.register('a', {});
    host.register('b', {});
    expect(host.unregister('a')).toBe(true);
    expect(host.count()).toBe(1);
    expect(host.unregister('nonexistent')).toBe(false);
  });

  it('should track service state', () => {
    const host = new ServiceHost({ logger });
    host.register('db', {});
    expect(host.getState('db')).toBe('stopped');
    host.setState('db', 'running');
    expect(host.getState('db')).toBe('running');
  });

  it('should list all services', () => {
    const host = new ServiceHost({ logger });
    host.register('a', {});
    host.register('b', {});
    host.setState('b', 'running');
    const list = host.list();
    expect(list).toHaveLength(2);
    expect(list.find(s => s.name === 'b')?.state).toBe('running');
  });

  it('should return undefined for unregistered service', () => {
    const host = new ServiceHost({ logger });
    expect(host.get('nonexistent')).toBeUndefined();
    expect(host.getState('nonexistent')).toBeUndefined();
  });
});
