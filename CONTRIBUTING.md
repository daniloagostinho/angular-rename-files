# Contributing to Smart Rename

Thanks for your interest in contributing! Here's everything you need to get started.

## Table of Contents

- [Reporting bugs](#reporting-bugs)
- [Suggesting features](#suggesting-features)
- [Development setup](#development-setup)
- [Submitting a pull request](#submitting-a-pull-request)
- [Code style](#code-style)

---

## Reporting bugs

Open a [bug report](https://github.com/daniloagostinho/smart-rename/issues/new) including:

- VS Code version and OS
- The framework/project type you were using (Angular, React, Vue, etc.)
- Steps to reproduce the issue
- What you expected vs. what happened

---

## Suggesting features

Open a [feature request](https://github.com/daniloagostinho/smart-rename/issues/new) describing the problem you're trying to solve. We prioritize features that benefit cross-framework users.

---

## Development setup

**Requirements:** Node.js 18+, VS Code 1.100+

```bash
# Clone the repo
git clone https://github.com/daniloagostinho/smart-rename.git
cd smart-rename

# Install dependencies
npm install

# Compile (watch mode)
npm run watch
```

Then press **F5** in VS Code to open an Extension Development Host with the extension loaded.

**Build once:**
```bash
npm run compile
```

**Lint:**
```bash
npm run lint
```

---

## Submitting a pull request

1. Fork the repository
2. Create a branch: `git checkout -b feat/your-feature` or `fix/your-bug`
3. Make your changes following the [code style](#code-style) below
4. Run `npm run compile` and `npm run lint` — both must pass with zero errors
5. Test manually on at least one framework (Angular, React, or Vue)
6. Open a PR against `main` with a clear description of what changed and why

**PR checklist:**
- [ ] `npm run compile` passes with no TypeScript errors
- [ ] `npm run lint` passes with no ESLint errors
- [ ] Tested manually with a real project (specify which framework)
- [ ] No breaking changes to existing settings
- [ ] Existing rename behavior is preserved (regressions caught)

---

## Code style

- TypeScript strict mode — no `any`, no implicit returns
- Small, focused functions with a single responsibility
- No over-engineering: solve the problem, don't design for hypotheticals
- Use `WorkspaceEdit` for all file/content modifications (enables atomic undo)
- Test rename operations on multiple frameworks before submitting

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
