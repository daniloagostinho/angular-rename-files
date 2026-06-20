import * as vscode from 'vscode';
import * as path from 'path';
import {
  buildRenameTokens,
  applyRename,
  renameFileStem,
  referencesModule,
  RenameTokens,
} from './core.js';

/** A file (or folder) to be renamed on disk. */
export interface RenameAction {
  oldUri: vscode.Uri;
  newUri: vscode.Uri;
  description: string;
}

/** A single changed line, used for the preview. */
export interface ChangedLine {
  line: number;
  oldText: string;
  newText: string;
}

/** A file whose text content changes (component internals OR external references). */
export interface ContentChange {
  uri: vscode.Uri;
  newContent: string;
  /** Line count of the original file — used to build an exact full-document range. */
  oldLineCount: number;
  changedLines: ChangedLine[];
  scope: 'internal' | 'reference';
}

const DEFAULT_EXCLUDES = [
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.angular',
];

/**
 * Finds the direct child files of the folder whose stem matches the old name,
 * e.g. `header.component.ts` -> `loja.component.ts`. Boundary-aware, so
 * `headerbar.component.ts` is left alone.
 */
export async function computeFileRenames(
  folderUri: vscode.Uri,
  oldName: string,
  newName: string
): Promise<RenameAction[]> {
  const renames: RenameAction[] = [];

  try {
    const entries = await vscode.workspace.fs.readDirectory(folderUri);
    for (const [fileName, fileType] of entries) {
      if (fileType === vscode.FileType.Directory) {
        continue;
      }
      const newFileName = renameFileStem(fileName, oldName, newName);
      if (newFileName && newFileName !== fileName) {
        renames.push({
          oldUri: vscode.Uri.joinPath(folderUri, fileName),
          newUri: vscode.Uri.joinPath(folderUri, newFileName),
          description: `${fileName} → ${newFileName}`,
        });
      }
    }
  } catch (err) {
    console.error('Smart Rename: Error reading folder', err);
  }

  return renames;
}

/** Computes the boundary-aware content change for a single file, or null if unchanged. */
async function computeChangeForFile(
  uri: vscode.Uri,
  tokens: RenameTokens,
  scope: 'internal' | 'reference'
): Promise<ContentChange | null> {
  let content: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    content = Buffer.from(bytes).toString('utf-8');
  } catch {
    return null;
  }

  const { text: newContent, count } = applyRename(content, tokens);
  if (count === 0 || newContent === content) {
    return null;
  }

  const oldLines = content.split('\n');
  const newLines = newContent.split('\n');
  const changedLines: ChangedLine[] = [];
  for (let i = 0; i < oldLines.length; i++) {
    if (oldLines[i] !== newLines[i]) {
      changedLines.push({ line: i + 1, oldText: oldLines[i].trim(), newText: newLines[i].trim() });
    }
  }

  return { uri, newContent, oldLineCount: oldLines.length, changedLines, scope };
}

/**
 * Content changes for the component's OWN files (everything inside the folder).
 * Aggressive but safe — the whole folder belongs to the renamed unit.
 */
export async function computeInternalChanges(
  folderUri: vscode.Uri,
  tokens: RenameTokens
): Promise<ContentChange[]> {
  const changes: ContentChange[] = [];
  try {
    const entries = await vscode.workspace.fs.readDirectory(folderUri);
    for (const [fileName, fileType] of entries) {
      if (fileType === vscode.FileType.Directory) {
        continue;
      }
      const change = await computeChangeForFile(
        vscode.Uri.joinPath(folderUri, fileName), tokens, 'internal'
      );
      if (change) {
        changes.push(change);
      }
    }
  } catch (err) {
    console.error('Smart Rename: Error scanning folder contents', err);
  }
  return changes;
}

/**
 * Content changes for OTHER files across the workspace that reference the unit
 * (import its module path or use its selector). Files that merely contain the
 * word but don't reference the module are skipped by `referencesModule`.
 */
export async function computeReferenceChanges(
  folderUri: vscode.Uri,
  oldName: string,
  tokens: RenameTokens
): Promise<ContentChange[]> {
  const config = vscode.workspace.getConfiguration('smartRename');
  const excludeFolders: string[] = config.get('excludeFolders', DEFAULT_EXCLUDES);
  const excludePattern = `{${excludeFolders.map((f) => `**/${f}/**`).join(',')}}`;

  const files = await vscode.workspace.findFiles(
    '**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte,html,css,scss,sass,less}',
    excludePattern
  );

  const folderPrefix = folderUri.fsPath + path.sep;
  const changes: ContentChange[] = [];

  for (const uri of files) {
    // Skip the component's own files — handled by computeInternalChanges.
    if (uri.fsPath === folderUri.fsPath || uri.fsPath.startsWith(folderPrefix)) {
      continue;
    }

    let content: string;
    try {
      content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
    } catch {
      continue;
    }

    if (!referencesModule(content, oldName)) {
      continue;
    }

    const change = await computeChangeForFile(uri, tokens, 'reference');
    if (change) {
      changes.push(change);
    }
  }

  return changes;
}

export { buildRenameTokens };

/** Adds file rename operations to a shared WorkspaceEdit (no text edits). */
export function addFileRenames(renames: RenameAction[], edit: vscode.WorkspaceEdit): void {
  for (const rename of renames) {
    edit.renameFile(rename.oldUri, rename.newUri, { overwrite: false });
  }
}

/** Adds full-file content replacements to a shared WorkspaceEdit. */
export function addContentChanges(changes: ContentChange[], edit: vscode.WorkspaceEdit): void {
  for (const change of changes) {
    // End at (lineCount, 0) — i.e. just past the last line — to cover the whole
    // document exactly, without relying on VSCode clamping an oversized range.
    const fullRange = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(change.oldLineCount, 0)
    );
    edit.replace(change.uri, fullRange, change.newContent);
  }
}
