# Repository Guidelines

## Project Structure & Module Organization

`src/score/` and `src/runtime/` contain framework-free TypeScript view-model helpers shared by Studio and Web. `src/components/` contains stateless React components that render those shared contracts. Keep app state, routing, API calls, filesystem access, browser globals, and scientific/runtime execution out of this package.

## Build, Test, and Development Commands

Use Node from nvm, preferably Node 24:

- `npm install`: install package dependencies.
- `npm run typecheck`: run TypeScript without emitting files.
- `npm run build`: emit ESM JavaScript and declarations under `dist/`.
- `npm test`: run Vitest unit tests.

## Coding Style & Naming Conventions

Use strict TypeScript, ES modules, two-space indentation, and `PascalCase` for React components. Components must be presentational and accept host-provided icons/classes rather than importing app-specific UI libraries.

## Testing Guidelines

Add colocated `*.test.ts` or `*.test.tsx` files for new helpers and components. Prefer deterministic pure-function tests; use `react-dom/server` for simple component rendering tests when DOM behavior is not required.

## Architecture Notes

This package is shared by `nirs4all-studio` and `nirs4all-web`. Do not import from those apps. If a shared component needs domain data, define a small package-level contract and let each host adapt its local runtime objects to that contract.

## Navigation

For indexed code, use CodeGraph first with this checkout's own `.codegraph/` (exact `projectPath`, or its CLI here). Never auto-index or substitute an ancestor or workspace-root index; the workspace index is only for intentional cross-repository tracing of declared included repositories, never Domains. Docs and configs may be read directly. Source, tests and builds are final authority.

## Language and workspace policy

All project content is English (UI text, errors, docs, comments, tests, reports, commits, PRs); converse with the maintainer in French; preserve identifiers, quotations and provenance records. Never commit credentials. Workspace `../AGENTS.md`, when present, adds shared policy on Git identity and release authority. Product frontends, shared UI, browser adapters, pins and generated assets change only in an explicit joint maintainer batch.
