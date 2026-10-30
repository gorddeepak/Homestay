# Engineering Rules

These rules apply to every coding task in the Homestay migration. Read this
document before implementation, follow it while working, and update it only
when a genuinely reusable principle needs to change.

## A. Simple, readable, human-written code

- Write straightforward code that an experienced human engineer would comfortably write, understand, review, and maintain.
- Prefer clear control flow, descriptive names, and direct solutions over clever tricks or unnecessarily sophisticated patterns.
- Avoid excessive nesting, needless helper functions, excessive abstraction, and unnecessary indirection.
- Keep functions and modules reasonably small, but do not split trivial logic into many separate functions or files without a real reason.
- Do not optimize for impressive-looking code. Optimize for correctness, readability, and maintainability.
- Use comments to explain non-obvious decisions, not to narrate every line.
- Avoid generating boilerplate merely to make the architecture look enterprise-grade.

## B. Avoid unnecessary work

- Understand the requirement and inspect existing code before changing anything.
- Reuse working code and existing project conventions whenever appropriate.
- Do not rewrite functioning code without a concrete reason.
- Do not implement unrelated fixes simply because you notice them.
- Do not add speculative features, premature optimizations, or future-proofing that is not justified.
- Do not create duplicate configuration files, documentation, utilities, or testing frameworks.
- Implement the smallest complete solution that satisfies the actual requirements.
- If an issue belongs to a future migration phase, document it briefly and leave it for that phase unless it blocks the current work or creates an immediate security risk.

## C. Prefer suitable packages and built-in features

- Before writing custom infrastructure, check whether the language, framework, or an existing dependency already solves the problem.
- Prefer mature, maintained libraries when they substantially reduce code, complexity, or risk.
- Do not install a package for trivial functionality that can be implemented clearly in a few lines.
- Before adding a dependency, consider compatibility, maintenance, security, runtime cost, and whether it is genuinely needed.
- Do not implement custom authentication protocols, cryptography, streaming protocols, validation frameworks, or other complex infrastructure when suitable established libraries exist.
- Avoid replacing a reliable existing library with a more complicated custom implementation merely to reduce dependencies.
- Do not add a package just because it is popular.

## D. Avoid overengineering

- Implement only the requirements for the current phase.
- Prefer simple, conventional React components, FastAPI endpoints, Pydantic schemas, and database operations.
- Do not introduce repositories, service layers, factories, managers, providers, custom hooks, state-management libraries, or generic frameworks unless they solve a real problem in this project.
- Use established React and FastAPI patterns rather than inventing new ones.
- Avoid excessive configurability and abstractions for hypothetical future requirements.
- Keep the implementation consistent with the approved architecture, but do not copy another project's architecture blindly.
- When multiple approaches are similarly reliable, prefer the one with fewer moving parts and less code.

## E. Correctness and security still matter

Simplicity must not become an excuse to skip essential security or correctness.

- Validate user-controlled input at the API boundary.
- Handle invalid MongoDB ObjectIds properly.
- Do not expose password hashes, authentication secrets, session information, or other private user fields through API responses.
- Do not bypass authorization or data-integrity checks.
- Do not expose internal exceptions or stack traces to clients.
- Avoid catching exceptions without handling them appropriately.
- Keep important business rules explicit and testable.
- Use established security practices and packages where appropriate.

## F. Proportionate testing

- Inspect the existing tests before creating new tests or infrastructure.
- Reuse existing test conventions and extend relevant tests.
- Focus tests on actual behavior and meaningful risks.
- Prioritize authentication, authorization, data integrity, database behavior, and API contracts when those areas are in scope.
- Run tests after completing a coherent batch of related work, not after every tiny edit.
- Run the complete suite at meaningful integration checkpoints.
- Avoid duplicate, redundant, or disproportionately expensive tests.
- Never claim a test passed unless it was actually executed and its result verified.
- Report pre-existing failures separately from regressions introduced by your changes.

## G. Controlled changes

- Keep diffs focused and understandable.
- Preserve user changes and existing functionality.
- Do not upgrade unrelated dependencies or regenerate lockfiles unnecessarily.
- Do not change the project stack without a concrete reason.
- Avoid simultaneous changes to the same files that would create unnecessary merge conflicts.
- Do not commit, push, deploy, or perform production operations without explicit authorization.
- Document consequential limitations and trade-offs.

## H. Frontend components and shadcn/ui

- The React frontend is incrementally adopting shadcn/ui. Prefer its components for new UI (buttons, cards, forms, dialogs) when they genuinely fit the task.
- Add components with the shadcn CLI (`npx shadcn@latest add <component>`). Do not hand-write a complex primitive that shadcn already provides, and do not add a second component library.
- Existing pages and components may stay as they are. Do not rewrite working UI only to adopt shadcn/ui.
- Keep the JavaScript/JSX setup (`components.json` uses `tsx: false`). Do not convert the application to TypeScript for shadcn/ui.
- Preserve the project palette. The shadcn tokens in `frontend/src/index.css` map to the existing `linen`, `clay`, `sand`, `earth`, and `ink` colors.
- Third-party shadcn registries may be used in future work, but review their code, licensing, dependencies, accessibility, and compatibility first. Do not install registry items just because they look attractive.
- Prefer native React state and the existing API helpers. Do not add state-management, form-validation, HTTP, or rating libraries for small features.

## I. Maintain these rules

- Read `docs/ENGINEERING_RULES.md` at the beginning of every coding task before implementation.
- Follow the rules while implementing, testing, and reviewing changes.
- Future coding prompts should reference this document rather than repeatedly copying the complete rules.
- Update the document only when a genuinely reusable engineering principle needs to change.
- Do not continually rewrite it or create duplicate engineering-rules documents.
- Follow explicit user requirements, security, and correctness when a genuine conflict arises, and explain important trade-offs.
