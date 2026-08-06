import { describe, expect, it } from 'vitest';
import { handleCarriageReturns, isProgressBarLine, removeProgressBars, stripAnsi } from './filters/ansi.js';
import {
  createCargoFilter,
  createDockerFilter,
  createGitFilter,
  createGoFilter,
  createJvmFilter,
  createNpmFilter
} from './filters/index.js';
import { createShellMinimizer, minimizeShellOutput, stripAnsiCodes } from './minimizer.js';

describe('pi-shell minimizer - ANSI strip', () => {
  it('strips simple ANSI colors', () => {
    const input = '\x1B[31mred\x1B[0m normal';
    expect(stripAnsi(input)).toBe('red normal');
  });

  it('strips 256-color and RGB', () => {
    const input = '\x1B[38;5;196merror\x1B[0m \x1B[38;2;255;0;0mred\x1B[0m';
    expect(stripAnsi(input)).toBe('error red');
  });

  it('strips cursor and erase sequences', () => {
    const input = '\x1B[2K\x1B[1A\x1B[0mhello';
    expect(stripAnsi(input)).toBe('hello');
  });

  it('stripAnsiCodes convenience includes carriage handling', () => {
    const input = 'foo\x1B[31mbar\x1B[0m\r\rbaz';
    const out = stripAnsiCodes(input);
    expect(out).not.toContain('\x1B');
    expect(out).toContain('baz');
  });

  it('contains no ANSI after strip in verbose npm log', () => {
    const input = '\x1B[2m\x1B[90mnpm\x1B[0m \x1B[35msill\x1B[0m fetchMetadata';
    const out = minimizeShellOutput(input, 'npm install');
    expect(out.output).not.toContain('\x1B');
    expect(out.hadAnsi).toBe(true);
  });
});

describe('pi-shell minimizer - progress bar removal', () => {
  it('detects progress bar patterns', () => {
    expect(isProgressBarLine('[====================    ] 80%')).toBe(true);
    expect(isProgressBarLine('  45%')).toBe(true);
    expect(isProgressBarLine('⠋ fetching packages...')).toBe(true);
  });

  it('does not detect error lines as progress', () => {
    expect(isProgressBarLine('error: something failed [80%]')).toBe(false);
    expect(isProgressBarLine('warning: 80% threshold exceeded')).toBe(false);
  });

  it('removes progress bars from lines', () => {
    const lines = [
      'Compiling foo',
      '[====>               ] 20%',
      'Compiling bar',
      '   Compiling baz v0.1.0',
      '⠋ installing',
      'added 10 packages'
    ];
    const out = removeProgressBars(lines);
    expect(out.join('\n')).not.toContain('20%');
    expect(out.join('\n')).not.toContain('⠋');
    expect(out).toContain('added 10 packages');
  });

  it('handles carriage return overwriting', () => {
    const input = 'Downloading 10%\rDownloading 50%\rDownloading 100%\nDone';
    const processed = handleCarriageReturns(input);
    expect(processed).toContain('Downloading 100%');
    expect(processed).toContain('Done');
  });

  it('minimizer strips progress by default', () => {
    const input = ['some output', '[████                ] 25%', 'more output', '  75%  ', 'final'].join('\n');
    const result = minimizeShellOutput(input, 'cargo build');
    expect(result.output).not.toMatch(/\[\s*█+/);
    expect(result.output).toContain('some output');
    expect(result.output).toContain('final');
  });
});

describe('cargo filter', () => {
  const cargoFilter = createCargoFilter();

  it('detects cargo command', () => {
    expect(cargoFilter.detect({ command: 'cargo build' })).toBe(true);
    expect(cargoFilter.detect({ command: 'cargo test --verbose' })).toBe(true);
  });

  it('filters Compiling and Fresh noise but keeps errors', () => {
    const verbose = [
      '   Compiling libc v0.2.0',
      '   Compiling cfg-if v1.0.0',
      '   Compiling autocfg v1.0.0',
      '   Compiling proc-macro2 v1.0.0',
      '   Compiling unicode-ident v1.0.0',
      '   Fresh unicode-ident v1.0.0',
      '   Fresh proc-macro2 v1.0.0',
      '   Compiling my-crate v0.1.0 (/path/to/crate)',
      'error[E0425]: cannot find value `foo` in this scope',
      ' --> src/main.rs:10:5',
      '  |',
      '10 |     foo;',
      '  |     ^^^ not found',
      '  = note: ...',
      'error: could not compile `my-crate`',
      'Finished dev [unoptimized] target(s) in 0.5s'
    ];
    const out = cargoFilter.filter(verbose);
    const joined = out.join('\n');
    // No raw Compiling lines
    expect(joined).not.toContain('Compiling libc');
    expect(joined).not.toContain('Fresh unicode-ident');
    // Errors preserved
    expect(joined).toContain('cannot find value');
    expect(joined).toContain('--> src/main.rs:10:5');
    expect(joined).toContain('could not compile');
  });

  it('preserves test results', () => {
    const lines = [
      '   Compiling my-crate v0.1.0',
      '    Finished test [unoptimized + debuginfo] target(s) in 0.2s',
      '     Running unittests src/lib.rs (target/debug/deps/mycrate-abc123)',
      'running 2 tests',
      'test tests::test_foo ... ok',
      'test tests::test_bar ... FAILED',
      'failures:',
      '---- tests::test_bar stdout ----',
      "thread 'tests::test_bar' panicked",
      'test result: FAILED. 1 passed; 1 failed;'
    ];
    const out = cargoFilter.filter(lines);
    const j = out.join('\n');
    expect(j).toContain('test_bar ... FAILED');
    expect(j).toContain('test result: FAILED');
    expect(j).toContain('panicked');
  });

  it('minimizer integration for cargo', () => {
    const input = [
      '\x1B[32m   Compiling\x1B[0m a v0.1.0',
      '\x1B[32m   Compiling\x1B[0m b v0.1.0',
      '\x1B[32m   Compiling\x1B[0m c v0.1.0',
      '\x1B[32m   Compiling\x1B[0m d v0.1.0',
      '\x1B[32m   Compiling\x1B[0m e v0.1.0',
      'error[E0308]: mismatched types',
      ' --> src/lib.rs:5:1',
      'Finished dev profile'
    ].join('\n');
    const res = minimizeShellOutput(input, 'cargo build');
    expect(res.detectedTool).toBe('cargo');
    expect(res.output).toContain('mismatched types');
    expect(res.output).toContain('src/lib.rs:5:1');
    expect(res.filteredLines).toBeLessThan(res.originalLines);
  });
});

describe('go filter', () => {
  const goFilter = createGoFilter();

  it('detects go command', () => {
    expect(goFilter.detect({ command: 'go test ./...' })).toBe(true);
    expect(goFilter.detect({ command: 'go build -o bin/app' })).toBe(true);
  });

  it('filters go mod download noise but keeps failures', () => {
    const lines = [
      'go: downloading github.com/foo/bar v1.2.3',
      'go: downloading github.com/baz/qux v0.4.5',
      'go: found github.com/foo/bar in github.com/foo/bar v1.2.3',
      '# my/pkg',
      'my/pkg/file.go:12:6: undefined: FooBar',
      'my/pkg/file.go:15:2: not enough arguments in call',
      'FAIL\tmy/pkg\t0.123s'
    ];
    const out = goFilter.filter(lines);
    const joined = out.join('\n');
    expect(joined).not.toContain('downloading github.com/foo/bar');
    expect(joined).toContain('undefined: FooBar');
    expect(joined).toContain('FAIL\tmy/pkg');
  });

  it('keeps panic and stack traces', () => {
    const lines = [
      '=== RUN   TestFoo',
      '--- FAIL: TestFoo (0.01s)',
      '    foo_test.go:10: expected 1 got 2',
      'panic: runtime error: index out of range [3] with length 2',
      'goroutine 1 [running]:',
      'my/pkg.TestFoo(0xc0000)',
      '\t/app/foo_test.go:10 +0xab',
      'FAIL'
    ];
    const out = goFilter.filter(lines);
    expect(out.join('\n')).toContain('panic: runtime error');
    expect(out.join('\n')).toContain('goroutine 1');
    expect(out.join('\n')).toContain('FAIL');
  });

  it('minimizer integration for go', () => {
    const input = [
      'go: downloading example.com/mod v1.0.0',
      'go: downloading example.com/mod v1.0.1',
      'go: downloading example.com/mod v1.0.2',
      '# example/project',
      'main.go:20: error is here',
      'FAIL\texample/project\t0.001s'
    ].join('\n');
    const res = minimizeShellOutput(input, 'go test ./...');
    expect(res.detectedTool).toBe('go');
    expect(res.output).toContain('main.go:20');
    expect(res.output).toContain('FAIL');
  });
});

describe('npm filter', () => {
  const npmFilter = createNpmFilter();

  it('detects npm/yarn/pnpm/bun', () => {
    expect(npmFilter.detect({ command: 'npm install' })).toBe(true);
    expect(npmFilter.detect({ command: 'yarn add lodash' })).toBe(true);
    expect(npmFilter.detect({ command: 'pnpm install' })).toBe(true);
    expect(npmFilter.detect({ command: 'bun install' })).toBe(true);
  });

  it('filters npm timing/silly/http but keeps errors and summary', () => {
    const lines = [
      'npm timing config:load:file:/path Completed in 1ms',
      'npm sill fetch manifest lodash@^4.0.0',
      'npm verb shrinkwrap Skipping...',
      'npm http fetch GET https://registry.npmjs.org/lodash 200 123ms',
      'npm WARN deprecated old-package@1.0.0 is deprecated',
      'npm ERR! code E404',
      'npm ERR! 404 Not Found - GET https://registry.npmjs.org/does-not-exist',
      'added 100 packages, and audited 101 packages in 2s',
      'found 0 vulnerabilities'
    ];
    const out = npmFilter.filter(lines);
    const j = out.join('\n');
    expect(j).not.toContain('timing config:load');
    expect(j).not.toContain('sill fetch manifest');
    expect(j).not.toContain('http fetch GET');
    expect(j).toContain('WARN deprecated');
    expect(j).toContain('ERR! code E404');
    expect(j).toContain('added 100 packages');
  });

  it('filters yarn idealTree and progress', () => {
    const lines = [
      '[1/4] Resolving packages...',
      '[2/4] Fetching packages...',
      '[3/4] Linking dependencies...',
      '[4/4] Building fresh packages...',
      'Done in 1.23s.',
      'error Something failed'
    ];
    const out = npmFilter.filter(lines);
    expect(out.join('\n')).toContain('Done in 1.23s');
    expect(out.join('\n')).toContain('error Something failed');
    expect(out.join('\n')).not.toContain('Resolving packages');
  });

  it('minimizer integration for npm', () => {
    const input = [
      '\x1B[90mnpm\x1B[0m \x1B[35msill\x1B[0m fetchMetadata: sill fetch',
      'npm timing idealTree Completed in 100ms',
      'npm WARN deprecated request@2.88.2',
      'npm ERR! missing script: build',
      'added 5 packages in 1s'
    ].join('\n');
    const res = minimizeShellOutput(input, 'npm install');
    expect(res.detectedTool).toBe('npm');
    expect(res.output).toContain('WARN deprecated');
    expect(res.output).toContain('ERR!');
    expect(res.output).not.toContain('fetchMetadata');
  });
});

describe('jvm filter', () => {
  const jvmFilter = createJvmFilter();

  it('detects gradle and mvn', () => {
    expect(jvmFilter.detect({ command: './gradlew build' })).toBe(true);
    expect(jvmFilter.detect({ command: 'mvn clean install' })).toBe(true);
    expect(jvmFilter.detect({ command: 'gradle test' })).toBe(true);
  });

  it('filters UP-TO-DATE and download noise but keeps failures', () => {
    const lines = [
      '> Task :compileJava UP-TO-DATE',
      '> Task :processResources UP-TO-DATE',
      '> Task :classes UP-TO-DATE',
      '> Task :compileTestJava UP-TO-DATE',
      '> Task :test FAILED',
      '> Task :compileJava FAILED',
      'FAILURE: Build failed with an exception.',
      '* What went wrong:',
      "Execution failed for task ':test'.",
      '* Try:',
      'BUILD FAILED in 1s'
    ];
    const out = jvmFilter.filter(lines);
    const j = out.join('\n');
    expect(j).not.toContain('UP-TO-DATE');
    expect(j).toContain('FAILED');
    expect(j).toContain('What went wrong');
    expect(j).toContain('BUILD FAILED');
  });

  it('handles maven', () => {
    const lines = [
      '[INFO] Downloading from central: https://repo.maven.apache.org/maven2/foo/bar.pom',
      '[INFO] Downloaded from central: https://repo.maven.apache.org/maven2/foo/bar.pom (2.3 kB at 10 kB/s)',
      '[INFO] Building my-app 1.0-SNAPSHOT',
      '[ERROR] /src/main/java/App.java:[10,5] cannot find symbol',
      '[INFO] BUILD FAILURE',
      '[INFO] Tests run: 1, Failures: 1'
    ];
    const out = jvmFilter.filter(lines);
    const j = out.join('\n');
    expect(j).not.toContain('Downloading from central');
    expect(j).toContain('cannot find symbol');
    expect(j).toContain('BUILD FAILURE');
    expect(j).toContain('Tests run:');
  });
});

describe('docker filter', () => {
  const dockerFilter = createDockerFilter();

  it('detects docker command', () => {
    expect(dockerFilter.detect({ command: 'docker build -t app .' })).toBe(true);
    expect(dockerFilter.detect({ command: 'podman build .' })).toBe(true);
  });

  it('filters internal load and cached layers but keeps errors', () => {
    const lines = [
      '#1 [internal] load build definition from Dockerfile',
      '#1 transferring dockerfile: 32B done',
      '#1 DONE 0.0s',
      '#2 [internal] load .dockerignore',
      '#2 DONE 0.0s',
      '#3 [internal] load metadata for docker.io/library/node:18',
      '#4 [1/5] FROM docker.io/library/node:18@sha256:abc',
      '#4 DONE 0.0s',
      '#5 [2/5] WORKDIR /app',
      '#5 CACHED',
      '#6 [3/5] COPY package.json ./',
      '#6 CACHED',
      '#7 [4/5] RUN npm install',
      '#7 12.3s',
      '#7 ERROR: failed to run',
      '=> ERROR [4/5] RUN npm install',
      'failed to solve: process did not complete successfully'
    ];
    const out = dockerFilter.filter(lines);
    const j = out.join('\n');
    expect(j).not.toContain('[internal] load build definition');
    expect(j).toContain('ERROR: failed to run');
    expect(j).toContain('failed to solve');
  });
});

describe('git filter', () => {
  const gitFilter = createGitFilter();

  it('detects git command', () => {
    expect(gitFilter.detect({ command: 'git push origin main' })).toBe(true);
    expect(gitFilter.detect({ command: 'git clone https://github.com/foo/bar' })).toBe(true);
  });

  it('filters git progress percentage but keeps summary', () => {
    const lines = [
      'Enumerating objects: 10, done.',
      'Counting objects: 100% (10/10), done.',
      'Compressing objects: 100% (5/5), done.',
      'Writing objects: 100% (6/6), 1.23 KiB | 1.23 MiB/s, done.',
      'Total 6 (delta 0), reused 0 (delta 0), pack-reused 0',
      'To https://github.com/foo/bar.git',
      '   a1b2c3d..e4f5g6h  main -> main',
      ' 3 files changed, 10 insertions(+)'
    ];
    const out = gitFilter.filter(lines);
    const j = out.join('\n');
    expect(j).toContain('To https://github.com/foo/bar.git');
    expect(j).toContain('files changed');
    expect(j).toContain('main -> main');
  });

  it('keeps errors', () => {
    const lines = [
      'remote: Enumerating objects: 5',
      "error: failed to push some refs to 'https://github.com/foo/bar.git'",
      'hint: Updates were rejected because the remote contains work',
      'fatal: The current branch main has no upstream branch'
    ];
    const out = gitFilter.filter(lines);
    expect(out.join('\n')).toContain('failed to push some refs');
    expect(out.join('\n')).toContain('fatal:');
  });
});

describe('integration: minimized output still contains error context for failed builds', () => {
  it('cargo failed build keeps error context', () => {
    const failingCargoOutput = [
      '   Compiling proc-macro2 v1.0.0',
      '   Compiling unicode-ident v1.0.0',
      '   Compiling syn v2.0.0',
      '   Compiling quote v1.0.0',
      '   Compiling my-app v0.1.0 (/app)',
      'error[E0425]: cannot find value `undefined_var` in this scope',
      '  --> src/main.rs:42:5',
      '   |',
      '42 |     undefined_var;',
      '   |     ^^^^^^^^^^^^^ not found in this scope',
      '   |',
      '   = help: you might have meant to use `defined_var`',
      'error: could not compile `my-app` (bin "my-app") due to 1 previous error',
      'warning: unused import: `std::collections::HashMap`',
      ' --> src/lib.rs:1:5'
    ].join('\n');

    const result = minimizeShellOutput(failingCargoOutput, 'cargo build');
    expect(result.output).toContain('cannot find value');
    expect(result.output).toContain('src/main.rs:42:5');
    expect(result.output).toContain('could not compile');
    expect(result.output).toContain('unused import');
    expect(result.output.length).toBeLessThan(failingCargoOutput.length);
  });

  it('go failed test keeps context', () => {
    const goOutput = [
      'go: downloading foo/bar v1.0.0',
      'go: downloading baz/qux v2.0.0',
      'go: downloading more/deps v0.1.0',
      '# example.com/project',
      'main.go:10:2: imported and not used: "fmt"',
      'main.go:15:6: undefined: MyFunc',
      'FAIL\texample.com/project [build failed]'
    ].join('\n');

    const result = minimizeShellOutput(goOutput, 'go build ./...');
    expect(result.output).toContain('imported and not used');
    expect(result.output).toContain('undefined: MyFunc');
    expect(result.output).toContain('FAIL');
    expect(result.output).not.toContain('downloading foo/bar');
  });

  it('npm failed install keeps error', () => {
    const npmOutput = [
      'npm timing config:load Completed',
      'npm sill fetch manifest react@^18.0.0',
      'npm http fetch GET https://registry.npmjs.org/react',
      'npm timing idealTree:node_modules/react Completed in 10ms',
      'npm ERR! code ERESOLVE',
      'npm ERR! ERESOLVE unable to resolve dependency tree',
      'npm ERR! Found: react@17.0.0',
      'npm ERR! Could not resolve dependency: peer react@^18.0.0 from my-lib@1.0.0',
      'npm ERR! Fix the upstream dependency conflict, or retry with --force',
      'added 0 packages in 2s'
    ].join('\n');

    const result = minimizeShellOutput(npmOutput, 'npm install');
    expect(result.output).toContain('ERESOLVE');
    expect(result.output).toContain('unable to resolve dependency tree');
    expect(result.output).toContain('peer react@^18.0.0');
  });

  it('jvm failed build keeps exception', () => {
    const gradleOutput = [
      '> Task :compileJava UP-TO-DATE',
      '> Task :processResources UP-TO-DATE',
      '> Task :compileTestJava',
      '> Task :compileTestJava FAILED',
      'FAILURE: Build failed with an exception.',
      '* What went wrong:',
      "Execution failed for task ':compileTestJava'.",
      '> Compilation failed; see the compiler error output for details.',
      '* Try:',
      '> Run with --stacktrace option to get the stack trace.',
      'BUILD FAILED in 2s',
      '4 tasks: 2 executed, 2 up-to-date'
    ].join('\n');

    const result = minimizeShellOutput(gradleOutput, './gradlew build');
    expect(result.output).toContain('What went wrong');
    expect(result.output).toContain('FAILED');
    expect(result.output).toContain('BUILD FAILED');
    expect(result.filteredLines).toBeLessThan(result.originalLines);
  });

  it('docker failed build keeps error', () => {
    const dockerOutput = [
      '#1 [internal] load build definition from Dockerfile',
      '#1 DONE 0.0s',
      '#2 [internal] load metadata for docker.io/library/node:18',
      '#2 DONE 1.2s',
      '#3 [2/4] RUN npm install',
      '#3 5.1s',
      '#3 ERROR: npm ERR! code E404',
      '------',
      ' > [2/4] RUN npm install:',
      'npm ERR! 404 Not Found - GET https://registry.npmjs.org/nonexistent',
      '------',
      'ERROR: failed to solve: process "/bin/sh -c npm install" did not complete successfully: exit code: 1'
    ].join('\n');

    const result = minimizeShellOutput(dockerOutput, 'docker build .');
    expect(result.output).toContain('ERROR: npm ERR!');
    expect(result.output).toContain('404 Not Found');
    expect(result.output).toContain('failed to solve');
  });

  it('head-tail buffer truncates huge output but keeps errors', () => {
    const minimizer = createShellMinimizer();
    const manyLines = Array.from({ length: 1000 }, (_, i) => `line ${i} - some verbose log output`).join('\n');
    const withErrors = `${manyLines}\nerror: critical failure at line 999\nFAIL test`;
    const result = minimizer.minimize(withErrors, 'cargo build', { maxLines: 100 });
    expect(result.truncated).toBe(true);
    expect(result.output).toContain('truncated');
    expect(result.output).toContain('critical failure');
    expect(result.output.length).toBeLessThan(withErrors.length);
  });
});

describe('detectTool', () => {
  const minimizer = createShellMinimizer();

  it('detects cargo', () => {
    expect(minimizer.detectTool('cargo build --release')).toBe('cargo');
  });
  it('detects go', () => {
    expect(minimizer.detectTool('go test ./...')).toBe('go');
  });
  it('detects npm variants', () => {
    expect(minimizer.detectTool('npm install')).toBe('npm');
    expect(minimizer.detectTool('yarn add foo')).toBe('npm');
    expect(minimizer.detectTool('pnpm install')).toBe('npm');
  });
  it('detects docker', () => {
    expect(minimizer.detectTool('docker build -t app .')).toBe('docker');
  });
  it('detects git', () => {
    expect(minimizer.detectTool('git push origin main')).toBe('git');
  });
  it('detects jvm', () => {
    expect(minimizer.detectTool('./gradlew build')).toBe('jvm');
    expect(minimizer.detectTool('mvn test')).toBe('jvm');
  });
});
