<div align="center">
  <img src="icon.png" width="128" alt="Angular Component Rename & Refactor icon" />

  <h1>Angular Component Rename & Refactor</h1>

  <p><strong>Safe, reviewable Angular component renames in VS Code.</strong></p>
  <p>Rename the folder, related files, TypeScript class, selector, templates, and workspace references from one command.</p>

  [![Marketplace version](https://img.shields.io/visual-studio-marketplace/v/danilodevsilva.power-rename?label=version&color=C3002F)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.power-rename)
  [![Marketplace installs](https://img.shields.io/visual-studio-marketplace/i/danilodevsilva.power-rename?label=installs&color=2EA44F)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.power-rename)
  [![Marketplace rating](https://img.shields.io/visual-studio-marketplace/r/danilodevsilva.power-rename?label=rating&color=F5A623)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.power-rename&ssr=false#review-details)
  [![License: MIT](https://img.shields.io/badge/license-MIT-007ACC.svg)](LICENSE)

  [Install from the Marketplace](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.power-rename) · [Português (Brasil)](README.pt-BR.md)

  <br />

  <img src="images/demo.gif" alt="Renaming an Angular component and its related files in one command" width="900" />
</div>

---

## Angular refactoring without the rename hunt

Renaming an Angular component usually involves several files and several kinds of references. Missing a class name, selector usage, or lazy import can leave the application in a half-renamed state.

**Angular Component Rename & Refactor** finds the related changes, shows a preview, and lets you choose what to apply.

| Target | Before | After |
|---|---|---|
| Folder | `header/` | `store/` |
| Component | `header.component.ts` | `store.component.ts` |
| Template and styles | `header.component.html`, `header.component.scss` | `store.component.html`, `store.component.scss` |
| Test | `header.component.spec.ts` | `store.component.spec.ts` |
| Class | `HeaderComponent` | `StoreComponent` |
| Selector | `app-header` | `app-store` |
| Import path | `./header/header.component` | `./store/store.component` |

## Why use it

- **Preview before editing** — review the affected files and deselect entries you do not want to change.
- **Boundary-aware renaming** — changes real name tokens without blindly replacing every matching substring.
- **Reference filtering** — scans external files only when they look connected through an import, URL, or Angular selector.
- **Conflict protection** — cancels the folder rename when the destination already exists instead of overwriting it.
- **Local and private** — runs through the VS Code workspace API, with no external service, account, telemetry, or network request.

For example, renaming `header` updates `HeaderComponent`, `app-header`, `./header`, and the exact `.header` class. It intentionally leaves unrelated names such as `subHeader`, `headers`, `header-icon`, and `header-utils` unchanged.

## Quick start

1. In the VS Code Explorer, right-click the Angular component folder.
2. Select **Angular Rename: Renomear pasta e arquivos**.
3. Enter the new component name.
4. Choose **Renomear** to apply the summary or **Ver detalhes** to review entries individually.

You can also start from a component file with **Angular Rename: Renomear este componente**.

> The current in-editor interface is in Brazilian Portuguese. English interface localization is planned.

### Other ways to run it

- **From a file:** right-click any file whose name starts with the component folder name.
- **After a manual folder rename:** rename the folder normally in Explorer; the extension detects it and offers to update the related files and references.
- **From the Command Palette:** run one of the `Angular Rename` commands.

Install from VS Code Quick Open (`Ctrl+P` / `Cmd+P`):

```text
ext install danilodevsilva.power-rename
```

## How it works

```text
Scan the component and workspace
              ↓
Build boundary-aware file and content changes
              ↓
Preview the affected files
              ↓
Apply only the selected entries
```

The extension handles three groups of changes:

1. **File system:** the component folder and direct child files that share its base name.
2. **Component content:** class names, selectors, local paths, templates, and styles inside the component files.
3. **Workspace references:** supported source files that import the component, reference one of its resource paths, or use its selector.

## Compatibility and requirements

- VS Code **1.100.0** or later
- Standalone components and NgModule-based applications
- Classic Angular CLI names such as `header.component.ts`
- Modern suffixless names such as `header.ts`, `header.html`, and `header.spec.ts`
- TypeScript, JavaScript, HTML, CSS, SCSS, Sass, and Less references
- No Angular CLI installation or external service required

The folder and its direct child files should share the same base name:

```text
header/
├─ header.component.ts
├─ header.component.html
├─ header.component.scss
└─ header.component.spec.ts
```

## Settings

Open VS Code Settings and search for **Angular Rename Files**.

| Setting | Default | Description |
|---|---:|---|
| `smartRename.showPreview` | `true` | Shows the preview before applying changes. |
| `smartRename.updateImports` | `true` | Updates supported import paths and workspace references. |
| `smartRename.updateFileContents` | `true` | Updates names and references inside the component files. |
| `smartRename.autoRenameOnFolderChange` | `true` | Detects manual folder renames and offers to update related files. |
| `smartRename.excludeFolders` | `node_modules`, `.git`, `dist`, … | Excludes folders from the workspace reference scan. |

The `smartRename.filePatterns` setting is visible in the current release but is reserved for a future matching update. File selection currently uses the shared base name.

## Known limitations

- The engine is convention- and text-based; it does not use the Angular compiler or TypeScript AST.
- TypeScript path aliases, barrel exports, and indirect references may require a manual check.
- Related files inside nested subfolders are not renamed; component files must be direct children of the selected folder.
- In a file that already references the component, another standalone token with the same name can also be selected. Review the preview before applying.
- BEM variants such as `.header-title` are intentionally left unchanged to avoid confusing them with sibling components such as `header-icon`.
- The operation is applied in phases. Depending on the editor state, reverting the complete rename can require more than one Undo action; using Source Control before a broad refactor is recommended.

## Support

If something does not work as expected, [open an issue](https://github.com/daniloagostinho/smart-rename/issues) and include:

- VS Code version and operating system
- Angular project structure (standalone or NgModule)
- Original and intended component names
- A minimal example of any reference that was missed or changed incorrectly

Feature ideas are welcome in the same issue tracker.

## Project

- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Contributing guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [MIT License](LICENSE)

---

<sub>Independent open-source extension. Not affiliated with or endorsed by Google or the Angular team. Angular is a trademark of its respective owner.</sub>
