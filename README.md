# Smart Rename

[![Version](https://img.shields.io/visual-studio-marketplace/v/danilodevsilva.smart-rename?label=version&color=blue)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.smart-rename)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/danilodevsilva.smart-rename?color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.smart-rename)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/danilodevsilva.smart-rename?color=orange)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.smart-rename)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.100+-blue?logo=visualstudiocode)](https://code.visualstudio.com/)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.smart-rename)
[![License](https://img.shields.io/github/license/daniloagostinho/smart-rename?color=green)](LICENSE)

> **Rename a folder and all matching files inside — automatically.**
> Updates imports, class names, selectors, and references across your entire project.

---

## Why Smart Rename?

Every component-based framework follows the same pattern: a folder with files that share its name.

```
home/
  home.component.ts
  home.component.html
  home.component.scss
  home.component.spec.ts
```

Renaming `home` to `dashboard` means renaming the folder **and** every file inside, then hunting down every import, selector, and class reference across the project. Manually. One by one.

**Smart Rename does all of this in a single action.** Right-click, type the new name, done. Works with Angular, React, Vue, Svelte, Next.js, Nuxt — any framework, any language.

---

## Features

### Rename folder + all matching files

Right-click any folder in the Explorer and select **"Smart Rename: Rename Folder & Files"**. Every file whose name starts with the folder name gets renamed automatically.

```
Before:                          After:
home/                            dashboard/
  home.component.ts       →       dashboard.component.ts
  home.component.html     →       dashboard.component.html
  home.component.scss     →       dashboard.component.scss
  home.component.spec.ts  →       dashboard.component.spec.ts
```

### Auto-detect folder renames

Rename a folder the normal way (F2 in the Explorer) — Smart Rename detects it and offers to rename the files inside. No extra clicks needed, just confirm.

### Update imports across the project

All `import`, `require()`, dynamic `import()`, and CSS `@import` statements referencing the old paths are updated automatically.

```typescript
// Before
import { HomeComponent } from './home/home.component';

// After
import { DashboardComponent } from './dashboard/dashboard.component';
```

### Update file contents

Class names, Angular selectors, CSS classes, and camelCase references inside the renamed files are updated too.

| What | Before | After |
|---|---|---|
| **Angular selector** | `app-home` | `app-dashboard` |
| **Component class** | `HomeComponent` | `DashboardComponent` |
| **CSS class** | `.home-container` | `.dashboard-container` |
| **camelCase ref** | `homeService` | `dashboardService` |

### Preview before applying

See exactly what will change before anything is modified. Review file renames, content changes, and import updates — then apply or cancel.

### Atomic undo

All changes (file renames + content edits + import updates) are applied as a single `WorkspaceEdit`. One **Ctrl+Z** undoes everything.

### Rename from file context

Right-click any file and select **"Smart Rename: Rename This Component"** — it renames the parent folder and all sibling files that share the folder name.

---

## Supported Frameworks

Smart Rename is **framework-agnostic**. It works with any project structure where files share the folder name:

| Framework | Typical pattern |
|---|---|
| **Angular** | `name.component.ts`, `name.module.ts`, `name.service.ts`, `name.spec.ts` |
| **React** | `Name.tsx`, `Name.test.tsx`, `Name.styles.ts`, `Name.stories.tsx` |
| **Vue** | `Name.vue`, `Name.spec.ts` |
| **Svelte** | `Name.svelte`, `Name.test.ts` |
| **Next.js / Nuxt** | Works with any of the above |
| **Plain TypeScript/JavaScript** | Any `name.*` pattern |
| **CSS/SCSS/SASS/Less** | `name.module.css`, `name.styles.scss` |

---

## How It Works

1. **Scan** — reads the folder contents and finds all files whose name starts with the old folder name
2. **Compute** — builds the list of file renames, content replacements (PascalCase, camelCase, kebab-case), and import path updates
3. **Preview** — shows all planned changes for your review (optional, configurable)
4. **Apply** — executes everything as a single atomic `WorkspaceEdit`
5. **Done** — one Ctrl+Z to undo if needed

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `smartRename.autoRenameOnFolderChange` | `true` | Auto-detect folder renames and offer to rename files inside |
| `smartRename.updateImports` | `true` | Update import paths and references across the project |
| `smartRename.updateFileContents` | `true` | Update class names, selectors, and references inside files |
| `smartRename.showPreview` | `true` | Show a preview of all changes before applying |
| `smartRename.filePatterns` | *(see below)* | Glob patterns for files to consider when renaming |
| `smartRename.excludeFolders` | `["node_modules", ".git", "dist", "build", ...]` | Folders to exclude when scanning for import references |

<details>
<summary><strong>Default file patterns</strong></summary>

```json
[
  "*.component.ts", "*.component.html", "*.component.css", "*.component.scss",
  "*.component.sass", "*.component.less", "*.component.spec.ts",
  "*.module.ts", "*.service.ts", "*.service.spec.ts",
  "*.directive.ts", "*.pipe.ts", "*.guard.ts", "*.resolver.ts", "*.interceptor.ts",
  "*.stories.tsx", "*.stories.ts",
  "*.test.ts", "*.test.tsx", "*.test.js", "*.test.jsx",
  "*.spec.ts", "*.spec.tsx", "*.spec.js", "*.spec.jsx",
  "*.styles.ts", "*.styles.css", "*.styles.scss",
  "*.module.css", "*.module.scss",
  "*.tsx", "*.ts", "*.jsx", "*.js", "*.vue", "*.svelte", "*.html", "*.css", "*.scss", "*.sass", "*.less"
]
```
</details>

---

## Installation

Search **Smart Rename** in the VS Code Extensions panel, or:

```bash
code --install-extension danilodevsilva.smart-rename
```

---

## Usage

### Option 1: Right-click a folder

1. Right-click any folder in the Explorer sidebar
2. Select **"Smart Rename: Rename Folder & Files"**
3. Type the new name
4. Review the preview and confirm

### Option 2: Right-click a file

1. Right-click any file in the Explorer sidebar
2. Select **"Smart Rename: Rename This Component"**
3. Type the new name
4. The parent folder and all sibling files are renamed

### Option 3: Just rename the folder normally

1. Select a folder and press **F2** (or right-click → Rename)
2. Type the new name
3. Smart Rename detects the change and asks if you want to rename the files inside

### Option 4: Command Palette

1. Open the Command Palette (**Ctrl+Shift+P** / **Cmd+Shift+P**)
2. Search for **"Smart Rename"**
3. Choose one of the available commands

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

---

## Feedback & Issues

Found a bug or have a feature request? [Open an issue on GitHub](https://github.com/daniloagostinho/smart-rename/issues).

If this extension saves you time, consider leaving a review on the Marketplace — it really helps!

---

## License

[MIT](LICENSE)
