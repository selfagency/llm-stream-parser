# @agentsy/scripts

Monorepo maintenance and CI/CD automation for build, test, release, and quality gates.

## Overview

This package contains build scripts, release automation, and repository maintenance tools used exclusively during development and CI/CD. It is never imported by runtime code.

## Role

Acts as the "maintenance crew" for the monorepo:

- **CI/CD Helpers**: Wrappers for Turbo tasks, test result aggregation, and type safety verification
- **Release Automation**: Version bumping, changelog generation, and npm publishing coordination
- **Monorepo Health**: Dependency auditing and license header management

## Key Components

- `src/ci/` - Build and test orchestration
- `src/release/` - Versioning and publishing tooling
- `src/maintenance/` - Repository maintenance scripts

## Development

```bash
# Run all scripts tests
pnpm test

# Type checking (within scripts package only)
cd packages/scripts && pnpm check-types
```

## Implementation Details

See [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) for detailed architecture, tooling choices, and migration constraints.

## License

GPL-3.0-or-later
