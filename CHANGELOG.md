# Changelog

All notable changes to **Smart Rename** are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.0.1] — 2026-04-02

### Added
- **Rename folder & files** — right-click a folder to rename it and all matching files inside
- **Rename from file** — right-click a file to rename its parent folder and all sibling files
- **Auto-detect folder renames** — detects when a folder is renamed via F2 and offers to rename files inside
- **Import/reference updater** — scans the entire workspace and updates `import`, `require()`, dynamic `import()`, and CSS `@import` paths
- **Content updater** — updates Angular selectors (`app-xxx`), PascalCase class names, camelCase references, and CSS classes inside renamed files
- **Preview changes** — review all planned changes (file renames, content edits, import updates) before applying
- **Atomic undo** — all changes applied via a single `WorkspaceEdit` for one-step undo
- **Configurable file patterns** — customize which file extensions to consider when renaming
- **Exclude folders** — configurable list of folders to skip when scanning imports (node_modules, dist, etc.)
- **Framework-agnostic** — works with Angular, React, Vue, Svelte, Next.js, Nuxt, plain TS/JS, and any project structure
- Context menu integration in the Explorer sidebar
- Command Palette commands
