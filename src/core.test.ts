import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toPascalCase,
  toCamelCase,
  toKebabCase,
  buildRenameTokens,
  applyRename,
  renameFileStem,
  referencesModule,
} from './core.js';

function rename(text: string, oldName: string, newName: string): string {
  return applyRename(text, buildRenameTokens(oldName, newName)).text;
}

// --- case transforms ---

test('case transforms: single word', () => {
  assert.equal(toPascalCase('header'), 'Header');
  assert.equal(toCamelCase('header'), 'header');
  assert.equal(toKebabCase('header'), 'header');
});

test('case transforms: multi word kebab', () => {
  assert.equal(toPascalCase('user-profile'), 'UserProfile');
  assert.equal(toCamelCase('user-profile'), 'userProfile');
  assert.equal(toKebabCase('user-profile'), 'user-profile');
  assert.equal(toKebabCase('userProfile'), 'user-profile');
});

// --- boundary-aware replacement: the things that MUST change ---

test('renames PascalCase class with suffix', () => {
  assert.equal(rename('export class HeaderComponent {}', 'header', 'loja'),
    'export class LojaComponent {}');
});

test('renames Angular selector', () => {
  assert.equal(rename("selector: 'app-header',", 'header', 'loja'),
    "selector: 'app-loja',");
});

test('renames selector usage in template', () => {
  assert.equal(rename('<app-header></app-header>', 'header', 'loja'),
    '<app-loja></app-loja>');
});

test('renames relative import path', () => {
  assert.equal(rename("import { Header } from './header';", 'header', 'loja'),
    "import { Loja } from './loja';");
});

test('renames nested import path (folder + file)', () => {
  assert.equal(rename("from './components/header/header.component'", 'header', 'loja'),
    "from './components/loja/loja.component'");
});

test('renames templateUrl and styleUrls', () => {
  assert.equal(rename("templateUrl: './header.component.html',", 'header', 'loja'),
    "templateUrl: './loja.component.html',");
});

test('renames exact css class selector', () => {
  assert.equal(rename('.header { color: red; }', 'header', 'loja'),
    '.loja { color: red; }');
});

test('does NOT rename BEM-style css variants (safe trade-off vs sibling kebab)', () => {
  // `.header-title` is left alone because a trailing `-` is indistinguishable
  // from a sibling component like `app-header-icon`. Renaming the exact `.header`
  // is safe; the BEM element is the user's to adjust.
  assert.equal(rename('.header-title { }', 'header', 'loja'),
    '.header-title { }');
});

test('renames camelCase identifier', () => {
  assert.equal(rename('const headerColor = 1;', 'header', 'loja'),
    'const lojaColor = 1;');
});

test('renames multi-word component everywhere', () => {
  assert.equal(rename('class UserProfileComponent', 'user-profile', 'customer'),
    'class CustomerComponent');
  assert.equal(rename("'app-user-profile'", 'user-profile', 'customer'),
    "'app-customer'");
  assert.equal(rename("from './user-profile/user-profile'", 'user-profile', 'customer'),
    "from './customer/customer'");
});

// --- the things that MUST NOT change (false positives) ---

test('does not touch a longer word that contains the name as prefix', () => {
  assert.equal(rename('const headers = [];', 'header', 'loja'), 'const headers = [];');
  assert.equal(rename('let headerless = true;', 'header', 'loja'), 'let headerless = true;');
});

test('does not touch a word where the name is a suffix', () => {
  assert.equal(rename('class SubHeaderComponent {}', 'header', 'loja'),
    'class SubHeaderComponent {}');
  assert.equal(rename('const pageHeader = 1;', 'header', 'loja'), 'const pageHeader = 1;');
});

test('does not touch the name embedded mid-word', () => {
  assert.equal(rename('theheaderbar', 'header', 'loja'), 'theheaderbar');
});

test('does not match a different unrelated component', () => {
  assert.equal(rename('<app-header-icon>', 'header', 'loja'), '<app-header-icon>');
  assert.equal(rename("from './header-utils'", 'header', 'loja'), "from './header-utils'");
});

// --- file stem renaming ---

test('renames file stem only when it is the unit', () => {
  assert.equal(renameFileStem('header.component.ts', 'header', 'loja'), 'loja.component.ts');
  assert.equal(renameFileStem('header.html', 'header', 'loja'), 'loja.html');
  assert.equal(renameFileStem('header.spec.ts', 'header', 'loja'), 'loja.spec.ts');
  assert.equal(renameFileStem('header', 'header', 'loja'), 'loja');
});

test('does not rename unrelated files', () => {
  assert.equal(renameFileStem('headerbar.component.ts', 'header', 'loja'), null);
  assert.equal(renameFileStem('not-header.ts', 'header', 'loja'), null);
  assert.equal(renameFileStem('index.ts', 'header', 'loja'), null);
});

// --- referencesModule gate ---

test('detects files that reference the module', () => {
  assert.ok(referencesModule("import { Header } from './header';", 'header'));
  assert.ok(referencesModule("from '../components/header/header.component'", 'header'));
  assert.ok(referencesModule("templateUrl: './header.component.html'", 'header'));
  assert.ok(referencesModule('<app-header></app-header>', 'header'));
  assert.ok(referencesModule("@import './header/header.styles';", 'header'));
});

test('ignores files that do not reference the module', () => {
  assert.equal(referencesModule("import { Footer } from './footer';", 'header'), false);
  assert.equal(referencesModule('const x = "this is a header in prose";', 'header'), false);
  assert.equal(referencesModule("from './header-utils'", 'header'), false);
});

// --- realistic consumer scenarios (whole-file rename gated by referencesModule) ---

test('consumer: standalone imports array is fixed along with the import', () => {
  const file = [
    "import { HeaderComponent } from './header/header';",
    '@Component({',
    '  imports: [HeaderComponent],',
    '})',
    'export class AppComponent {}',
  ].join('\n');
  assert.ok(referencesModule(file, 'header'));
  const out = rename(file, 'header', 'loja');
  assert.ok(out.includes("from './loja/loja'"));
  assert.ok(out.includes('imports: [LojaComponent]'));
  assert.ok(!out.includes('HeaderComponent'));
});

test('consumer: lazy route loadComponent path + symbol', () => {
  const file =
    "{ path: 'x', loadComponent: () => import('./header/header').then(m => m.HeaderComponent) }";
  const out = rename(file, 'header', 'loja');
  assert.equal(out,
    "{ path: 'x', loadComponent: () => import('./loja/loja').then(m => m.LojaComponent) }");
});

test('consumer: an unrelated local named header is the only real risk', () => {
  // documents current behavior: inside a referencing file, a bare `header` token
  // is also renamed. Acceptable + visible in preview.
  const out = rename("import { HeaderComponent } from './header';\nconst header = 1;", 'header', 'loja');
  assert.ok(out.includes('const loja = 1;'));
});
