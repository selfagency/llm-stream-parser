# Pull Request Template

## Description

<!-- Describe what this change does and why. -->

## Safety and Ethics Review

<!-- If this PR touches safety-relevant areas, complete the checklist below. -->

- [ ] Does this PR touch safety-relevant areas (prompts, policies, middleware, memory, agent templates, UI)?

If yes, answer the following ethics review questions (from ETHICS.md):

1. Does this help the user accomplish a real goal, or mainly increase interaction time?
2. Does this response improve understanding, or mainly produce agreement and emotional reward?
3. Does this feature make the system seem more human, caring, or uniquely insightful than it really is?
4. Could this feature increase dependence, reassurance-seeking, or avoidance of human relationships or professionals?
5. Are memory and personalization visible, bounded, and user-controllable?
6. Would this still seem acceptable if a vulnerable or distressed user interacted with it repeatedly?
7. Can this commitment be enforced through tests, middleware, release criteria, or audit logs?
8. Does this feature assume the most important users are the most privileged or technically dominant?
9. Have communities most affected by this design decision had any input into it?
10. Does this capability advance AGI framing, general autonomy, or post-human aspiration in any way?
11. Is the scope of this agent as narrow as it can be while still being useful?
12. Does this feature serve present people in real communities, or does it justify itself through speculative future benefit?

- [ ] I have run `agentsy guardrails benchmark` and confirmed no regressions.

## Testing

- [ ] Existing tests pass
- [ ] New tests added for new behavior
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

## Documentation

- [ ] If this PR changes ETHICS.md, SAFETY.md, GOVERNANCE.md, or docs/constitution.md, I have added a safety-changelog entry.
