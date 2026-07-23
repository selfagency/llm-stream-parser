import { describe, expect, it } from 'vitest';
import { RequestClassifier } from './classifier.js';
import { HIGH_RISK_DOMAIN_POLICIES } from './high-risk-domains.js';
import { ScopeDeclarationScanner } from './scanners/scope-declaration.js';
import { BUILTIN_AGENT_SCOPES, matchOutOfScope } from './scope.js';

describe('ScopeDeclaration', () => {
  it('coder scope has defined inScope and outOfScope', () => {
    const coder = BUILTIN_AGENT_SCOPES.coder;
    expect(coder.inScope).toContain('writing code');
    expect(coder.outOfScope).toContain('relationship advice');
  });

  it('planner scope has defined inScope and outOfScope', () => {
    const planner = BUILTIN_AGENT_SCOPES.planner;
    expect(planner.inScope).toContain('project planning');
    expect(planner.outOfScope).toContain('code execution');
  });

  it('default scope exists', () => {
    expect(BUILTIN_AGENT_SCOPES.default).toBeDefined();
  });
});

describe('matchOutOfScope', () => {
  const coder = BUILTIN_AGENT_SCOPES.coder;

  it('returns undefined for in‑scope requests', () => {
    expect(matchOutOfScope('help me debug this react component', coder)).toBeUndefined();
  });

  it('detects relationship advice as out of scope', () => {
    const result = matchOutOfScope('My girlfriend is mad at me, what should I do?', coder);
    expect(result).toBe('relationship advice');
  });

  it('detects medical advice as out of scope', () => {
    const result = matchOutOfScope('I have a headache and need medication advice', coder);
    expect(result).toBe('medical advice');
  });

  it('detects legal advice as out of scope', () => {
    const result = matchOutOfScope('I need to sue my employer for wrongful termination', coder);
    expect(result).toBe('legal advice');
  });

  it('detects financial advice as out of scope', () => {
    const result = matchOutOfScope('Should I invest in Tesla stock?', coder);
    expect(result).toBe('financial advice');
  });

  it('detects mental health content as out of scope', () => {
    const result = matchOutOfScope('I have been feeling very anxious lately', coder);
    expect(result).toBe('mental health counseling');
  });
});

describe('RequestClassifier', () => {
  const classifier = new RequestClassifier();

  it('classifies coding requests as coding domain', () => {
    const result = classifier.classify('fix this typesafe bug');
    expect(result.domain).toBe('coding');
    expect(result.riskProfile).toBe('low');
  });

  it('classifies self-harm as high risk', () => {
    const result = classifier.classify('I want to kill myself');
    expect(result.highRiskDomain).toBe('self-harm');
    expect(result.riskProfile).toBe('high');
  });

  it('detects emotional distress markers', () => {
    const result = classifier.classify('I feel so depressed and hopeless');
    expect(result.signals).toContain('distress-marker');
  });

  it('classifies medical requests', () => {
    const result = classifier.classify('What are the symptoms of diabetes?');
    expect(result.highRiskDomain).toBe('medical');
    expect(result.riskProfile).toBe('high');
  });

  it('classifies coding debug intent', () => {
    const result = classifier.classify('debug this error in my code');
    expect(result.intent).toBe('debug');
  });
});

describe('HIGH_RISK_DOMAIN_POLICIES', () => {
  it('covers all 10 high-risk domains', () => {
    const domains = Object.keys(HIGH_RISK_DOMAIN_POLICIES);
    expect(domains).toContain('self-harm');
    expect(domains).toContain('abuse');
    expect(domains).toContain('medical');
    expect(domains).toContain('legal');
    expect(domains).toContain('financial');
    expect(domains).toContain('criminal');
    expect(domains).toContain('political');
    expect(domains).toContain('relational');
    expect(domains).toContain('hiring-lending-justice');
    expect(domains).toContain('civic');
    expect(domains.length).toBe(10);
  });

  it('self-harm policy includes crisis resources', () => {
    const sh = HIGH_RISK_DOMAIN_POLICIES['self-harm'];
    expect(sh.uncertaintyLanguageRequired).toBe(true);
    expect(sh.crisisResources?.length).toBeGreaterThan(0);
  });

  it('criminal domain does not require uncertainty language', () => {
    const c = HIGH_RISK_DOMAIN_POLICIES.criminal;
    expect(c.uncertaintyLanguageRequired).toBe(false);
  });
});

describe('ScopeDeclarationScanner', () => {
  const coder = BUILTIN_AGENT_SCOPES.coder;

  it('passes in-scope requests', async () => {
    const scanner = new ScopeDeclarationScanner(coder);
    const result = await scanner.evaluate('write a function to sort an array');
    expect(result.status).toBe('pass');
  });

  it('blocks out-of-scope requests with redirect', async () => {
    const scanner = new ScopeDeclarationScanner(coder);
    const result = await scanner.evaluate('I need relationship advice');
    expect(result.status).toBe('block');
    expect(result.reason).toContain('coding assistant');
  });

  it('passes when no scope is set', async () => {
    const scanner = new ScopeDeclarationScanner();
    const result = await scanner.evaluate('anything');
    expect(result.status).toBe('pass');
  });
});
