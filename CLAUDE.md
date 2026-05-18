# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`nodejs-apex-oracle` is a Node.js application integrating with Oracle APEX / Oracle Database. This repository is scaffolded with the **BMad Method v6.6.1** for AI-driven agile development. No application source code exists yet — the project is in the planning/inception phase.

## Key Directories

| Path | Purpose |
|------|---------|
| `docs/` | Project knowledge base — place reference docs, domain knowledge, specs here |
| `_bmad-output/planning-artifacts/` | PRDs, architecture docs, UX specs, epics/stories |
| `_bmad-output/implementation-artifacts/` | Story spec files ready for development |
| `_bmad-output/test-artifacts/` | Test plans, test reviews, traceability matrices |
| `_bmad/custom/config.toml` | Team-wide BMad customizations (committed) |
| `_bmad/custom/config.user.toml` | Personal BMad customizations (gitignored) |

## BMad Development Workflow

The project follows a structured 4-phase flow:

1. **Analysis** — Use `bmad-agent-analyst` (Mary), `bmad-agent-pm` (John), research skills, or `bmad-document-project` to capture requirements and domain knowledge into `docs/`
2. **Planning** — Use `bmad-prd`, `bmad-create-ux-design` (Sally), and `bmad-agent-architect` (Winston) to produce PRDs and architecture in `_bmad-output/planning-artifacts/`
3. **Solutioning** — Use `bmad-create-architecture`, `bmad-create-epics-and-stories`, `bmad-check-implementation-readiness` to finalize the design
4. **Implementation** — Use `bmad-create-story` to generate story files, then `bmad-dev-story` or `bmad-quick-dev` to implement, and `bmad-code-review` to review

### Story Automation

Run the full automated build cycle (create → dev → QA → review → retro) with:
```
/bmad-story-automator
```

### Useful Skills Reference

| Skill | When to use |
|-------|-------------|
| `/bmad-help` | Unsure what to do next |
| `/bmad-quick-dev` | Build/fix/refactor any code |
| `/bmad-investigate` | Trace bugs or understand unfamiliar code |
| `/bmad-code-review` | Adversarial code review |
| `/bmad-sprint-planning` | Generate sprint tracking from epics |
| `/bmad-sprint-status` | Check sprint risks and blockers |
| `/bmad-testarch-framework` | Set up Playwright/Cypress test framework |
| `/bmad-generate-project-context` | Create `project-context.md` with AI coding rules |

## Document Language

Planning artifacts and documentation should be produced in **English and Vietnamese** (as configured in `_bmad/config.toml`).

## BMad Configuration

- **Do not edit** `_bmad/config.toml` directly — it is regenerated on every BMad install
- Team overrides go in `_bmad/custom/config.toml`
- Personal overrides go in `_bmad/custom/config.user.toml`
