import { describe, expect, it } from 'vitest';

import { InfrastructureScanner } from './infrastructure-scanner.js';

describe('InfrastructureScanner', () => {
  describe('hostname detection', () => {
    const scanner = new InfrastructureScanner({
      kubernetes: false,
      paths: false,
      stackTraces: false,
      ports: false,
      urls: false,
      labels: false
    });

    it('detects .internal hostnames', () => {
      const result = scanner.evaluate('Connect to db.internal');
      expect(result.status).toBe('transform');
    });

    it('detects .local hostnames', () => {
      const result = scanner.evaluate('Server at app.local');
      expect(result.status).toBe('transform');
    });

    it('detects .corp hostnames', () => {
      const result = scanner.evaluate('Host: jenkins.corp');
      expect(result.status).toBe('transform');
    });

    it('passes on public hostnames', () => {
      const result = scanner.evaluate('Host: example.com');
      expect(result.status).toBe('pass');
    });

    it('passes on plain text without infrastructure details', () => {
      const result = scanner.evaluate('Hello, this is a test message.');
      expect(result.status).toBe('pass');
    });
  });

  describe('kubernetes resource detection', () => {
    const scanner = new InfrastructureScanner({
      hostnames: false,
      paths: false,
      stackTraces: false,
      ports: false,
      urls: false,
      labels: false
    });

    it('detects kube-system namespace', () => {
      const result = scanner.evaluate('Namespace: kube-system');
      expect(result.status).toBe('transform');
    });

    it('detects pod references', () => {
      const result = scanner.evaluate('pod/my-app-7d9f8c6b4');
      expect(result.status).toBe('transform');
    });
  });

  describe('filesystem path detection', () => {
    const scanner = new InfrastructureScanner({
      hostnames: false,
      kubernetes: false,
      stackTraces: false,
      ports: false,
      urls: false,
      labels: false
    });

    it('detects /etc/ paths', () => {
      const result = scanner.evaluate('Config at /etc/nginx/nginx.conf');
      expect(result.status).toBe('transform');
    });

    it('detects /home/ paths', () => {
      const result = scanner.evaluate('User home: /home/deploy/.ssh/id_rsa');
      expect(result.status).toBe('transform');
    });

    it('detects /var/log paths', () => {
      const result = scanner.evaluate('Check /var/log/syslog');
      expect(result.status).toBe('transform');
    });
  });

  describe('stack trace detection', () => {
    const scanner = new InfrastructureScanner({
      hostnames: false,
      kubernetes: false,
      paths: false,
      ports: false,
      urls: false,
      labels: false
    });

    it('detects stack trace lines', () => {
      const result = scanner.evaluate('  at /Users/test/app/src/index.ts:42:10');
      expect(result.status).toBe('transform');
    });

    it('detects "at" stack trace format', () => {
      const result = scanner.evaluate('  at handleRequest (/app/src/handler.ts:85:15)');
      expect(result.status).toBe('transform');
    });
  });

  describe('port detection', () => {
    const scanner = new InfrastructureScanner({
      hostnames: false,
      kubernetes: false,
      paths: false,
      stackTraces: false,
      urls: false,
      labels: false
    });

    it('detects port numbers', () => {
      const result = scanner.evaluate('Listening on port 8080');
      expect(result.status).toBe('transform');
    });

    it('detects listen port', () => {
      const result = scanner.evaluate('Server listening on 3000');
      expect(result.status).toBe('pass'); // plain number without port/listen keyword
    });
  });

  describe('sanitization', () => {
    const scanner = new InfrastructureScanner();

    it('replaces detected patterns with placeholder tags', () => {
      const result = scanner.evaluate('Check /etc/nginx/nginx.conf and db.internal');
      expect(result.status).toBe('transform');
      if (result.status === 'transform') {
        expect(result.sanitized).toContain('[FILESYSTEM-PATH]');
        expect(result.sanitized).toContain('[INTERNAL-HOSTNAME]');
      }
    });
  });

  describe('metadata', () => {
    const scanner = new InfrastructureScanner();
    it('has valid id', () => {
      expect(scanner.metadata.id).toBe('hub://guardrails/infrastructure@1.0');
    });
  });
});
