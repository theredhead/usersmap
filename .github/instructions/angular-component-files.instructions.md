---
description: "Use when creating, editing, or refactoring Angular components. Keep TypeScript, HTML templates, and styles in separate files."
applyTo: "apps/web/src/**/*.ts"
---

# Angular component files

- Name component files `<name>.component.ts`, `<name>.component.html`, and, when needed, `<name>.component.scss`. Name associated tests `<name>.component.spec.ts`.
- Always keep Angular component TypeScript and HTML in separate files. Use `templateUrl`; never inline `template`.
- Keep component styles in separate stylesheet files referenced with `styleUrl` or `styleUrls`; never inline `styles`.
- Do not create empty stylesheets. Omit stylesheet metadata when a component has no styles.
- Apply these rules to all components, including examples and test components.
