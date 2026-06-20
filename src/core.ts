/**
 * Pure, dependency-free rename logic.
 *
 * This module must NOT import `vscode` so it can be unit-tested with plain Node
 * (`node --test`). All VSCode/filesystem concerns live in the other modules and
 * delegate the actual string/name transformations here.
 *
 * The core idea is **boundary-aware** token replacement: we never replace a raw
 * substring (which caused `header` to match `subheader`, `headerColor`, prose,
 * etc). Instead we match a name only when it stands as its own identifier token
 * across all relevant casings (kebab, camel, Pascal).
 */

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Split a name into its words regardless of input casing (kebab, snake, camel, dot). */
function splitWords(name: string): string[] {
  return name
    // insert a separator at camelCase humps: fooBar -> foo Bar
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_.\s]+/)
    .filter(Boolean);
}

export function toPascalCase(name: string): string {
  return splitWords(name)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

export function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function toKebabCase(name: string): string {
  return splitWords(name).join('-').toLowerCase();
}

export interface RenameTokens {
  /** Map from an old token (in some casing) to its new token. */
  map: Map<string, string>;
  /** Single combined boundary-aware regex matching any old token. */
  regex: RegExp;
}

/**
 * Builds the set of boundary-aware token replacements for an `oldName -> newName`
 * rename, covering the raw form plus kebab/camel/Pascal casings.
 *
 * Boundaries:
 *  - left:  not preceded by alphanumeric/underscore -> avoids `subHeader`, `theheader`
 *  - right: not followed by lowercase/digit/underscore/hyphen
 *             - rejects `headers`, `header2`, `header_x`            (longer word)
 *             - rejects `header-icon`, `header-utils`              (sibling kebab)
 *             - allows an uppercase, so `HeaderComponent` matches `Header`
 *             - allows separators/quotes/slashes, so paths & `app-header` match
 *
 * Trade-off: a sibling whose name *ends* with the renamed name (e.g. `sub-header`
 * when renaming `header`) can't be told apart from the real selector `app-header`
 * by boundaries alone, so it may match. The preview lets the user deselect it.
 */
export function buildRenameTokens(oldName: string, newName: string): RenameTokens {
  const pairs: Array<[string, string]> = [
    [oldName, newName],
    [toKebabCase(oldName), toKebabCase(newName)],
    [toCamelCase(oldName), toCamelCase(newName)],
    [toPascalCase(oldName), toPascalCase(newName)],
  ];

  const map = new Map<string, string>();
  for (const [oldTok, newTok] of pairs) {
    if (oldTok && !map.has(oldTok)) {
      map.set(oldTok, newTok);
    }
  }

  // Longest tokens first so multi-word kebab (`user-profile`) is tried before
  // any shorter token that could be a prefix.
  const alternation = [...map.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|');

  const regex = new RegExp(`(?<![A-Za-z0-9_])(?:${alternation})(?![a-z0-9_-])`, 'g');

  return { map, regex };
}

export interface RenameResult {
  text: string;
  count: number;
}

/**
 * Applies boundary-aware token replacement to a block of text.
 * Single pass — no cascading re-matches of already-written output.
 */
export function applyRename(text: string, tokens: RenameTokens): RenameResult {
  let count = 0;
  const out = text.replace(tokens.regex, (match) => {
    const replacement = tokens.map.get(match);
    if (replacement !== undefined) {
      count++;
      return replacement;
    }
    return match;
  });
  return { text: out, count };
}

/**
 * Computes the new file name when the file belongs to the renamed unit, i.e. its
 * stem (the part before the first separator) equals the old name.
 *
 * `header.component.ts` + (header -> loja) => `loja.component.ts`
 * `headerbar.component.ts`                 => null  (different component)
 * `not-header.ts`                          => null
 */
export function renameFileStem(
  fileName: string,
  oldName: string,
  newName: string
): string | null {
  const re = new RegExp(`^${escapeRegex(oldName)}(?=[.\\-_]|$)`);
  if (re.test(fileName)) {
    return fileName.replace(re, newName);
  }
  return null;
}

/**
 * Heuristic gate for cross-file edits: does this file actually reference the
 * renamed unit? We only touch files that import its module path or use its
 * selector, so unrelated files that merely contain the word are left alone.
 */
export function referencesModule(content: string, oldName: string): boolean {
  const kebab = escapeRegex(toKebabCase(oldName));

  // import/require/dynamic-import/from a path whose last segment is the name
  //   from './header'      from '../x/header'      require('./header/header')
  const importPath = new RegExp(
    `(?:from|import|require)\\s*\\(?\\s*['"\`][^'"\`]*?[\\/.]?${kebab}(?![a-z0-9_-])`
  );
  if (importPath.test(content)) {
    return true;
  }

  // Angular metadata / css references: templateUrl, styleUrls, @import, src=
  const urlRef = new RegExp(
    `(?:templateUrl|styleUrls?|@import|src)\\s*[:=]?\\s*\\[?\\s*['"\`][^'"\`]*?${kebab}(?![a-z0-9_-])`
  );
  if (urlRef.test(content)) {
    return true;
  }

  // Selector usage inside a template tag: <app-header ...> / <foo-header>
  const selector = new RegExp(`<[\\w-]*${kebab}(?![a-z0-9_-])`);
  if (selector.test(content)) {
    return true;
  }

  return false;
}
