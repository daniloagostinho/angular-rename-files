import * as vscode from 'vscode';
import * as path from 'path';

export interface ImportChange {
  fileUri: vscode.Uri;
  line: number;
  oldText: string;
  newText: string;
}

/**
 * Scans the entire workspace for files that reference the old folder/file paths
 * and computes the necessary import/reference updates.
 */
export async function computeImportUpdates(
  folderPath: string,
  oldName: string,
  newName: string
): Promise<ImportChange[]> {
  const config = vscode.workspace.getConfiguration('smartRename');
  const excludeFolders: string[] = config.get('excludeFolders', [
    'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.angular',
  ]);

  const changes: ImportChange[] = [];

  // Build exclude pattern
  const excludePattern = `{${excludeFolders.map((f) => `**/${f}/**`).join(',')}}`;

  // Search patterns for common import/require syntaxes
  const searchPatterns = buildSearchPatterns(oldName, folderPath);

  for (const searchPattern of searchPatterns) {
    try {
      const files = await vscode.workspace.findFiles(
        '**/*.{ts,tsx,js,jsx,vue,svelte,html,css,scss,sass,less}',
        excludePattern
      );

      for (const fileUri of files) {
        const fileChanges = await scanFileForImports(fileUri, oldName, newName, folderPath);
        changes.push(...fileChanges);
      }

      // Only do one full scan — patterns are applied inside scanFileForImports
      break;
    } catch (err) {
      console.error('Smart Rename: Error scanning imports', err);
    }
  }

  return deduplicateChanges(changes);
}

async function scanFileForImports(
  fileUri: vscode.Uri,
  oldName: string,
  newName: string,
  folderPath: string
): Promise<ImportChange[]> {
  const changes: ImportChange[] = [];

  try {
    const contentBytes = await vscode.workspace.fs.readFile(fileUri);
    const content = Buffer.from(contentBytes).toString('utf-8');
    const lines = content.split('\n');

    // Get relative folder path from workspace root
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
    if (!workspaceFolder) {
      return changes;
    }

    const relativeFolderPath = path.relative(workspaceFolder.uri.fsPath, folderPath);
    const relativeFromFile = path.relative(path.dirname(fileUri.fsPath), folderPath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineChanges = findImportReferences(line, i + 1, fileUri, oldName, newName, relativeFromFile);
      changes.push(...lineChanges);
    }
  } catch (err) {
    // Skip files that can't be read
  }

  return changes;
}

function findImportReferences(
  line: string,
  lineNumber: number,
  fileUri: vscode.Uri,
  oldName: string,
  newName: string,
  relativeFromFile: string
): ImportChange[] {
  const changes: ImportChange[] = [];
  const escapedOld = escapeRegex(oldName);

  // Normalize path separators for matching
  const normalizedRelPath = relativeFromFile.replace(/\\/g, '/');

  // Patterns to match various import/require styles:
  // import ... from './path/old-name/old-name.component'
  // import ... from '../old-name/old-name.service'
  // require('./old-name/old-name')
  // @import './old-name/old-name.styles'
  // templateUrl: './old-name.component.html'
  // styleUrls: ['./old-name.component.css']

  const importPatterns = [
    // ES import/export: from '...old-name...'
    new RegExp(`(from\\s+['"\`])([^'"\`]*/)${escapedOld}(/[^'"\`]*['"\`])`, 'g'),
    // ES import/export: from '...old-name/old-name...'
    new RegExp(`(from\\s+['"\`][^'"\`]*/${escapedOld}/)${escapedOld}`, 'g'),
    // require('...old-name...')
    new RegExp(`(require\\s*\\(\\s*['"\`])([^'"\`]*/)${escapedOld}(/[^'"\`]*['"\`])`, 'g'),
    // require('...old-name/old-name...')
    new RegExp(`(require\\s*\\(\\s*['"\`][^'"\`]*/${escapedOld}/)${escapedOld}`, 'g'),
    // Angular templateUrl/styleUrls: './old-name.xxx'
    new RegExp(`(['"\`]\\s*\\./)${escapedOld}(\\.[^'"\`]*['"\`])`, 'g'),
    // CSS @import './old-name/old-name.xxx'
    new RegExp(`(@import\\s+['"\`][^'"\`]*/)${escapedOld}(/[^'"\`]*['"\`])`, 'g'),
    // CSS @import '...old-name/old-name...'
    new RegExp(`(@import\\s+['"\`][^'"\`]*/${escapedOld}/)${escapedOld}`, 'g'),
    // Dynamic import: import('...old-name...')
    new RegExp(`(import\\s*\\(\\s*['"\`])([^'"\`]*/)${escapedOld}(/[^'"\`]*['"\`])`, 'g'),
    // Dynamic import: import('...old-name/old-name...')
    new RegExp(`(import\\s*\\(\\s*['"\`][^'"\`]*/${escapedOld}/)${escapedOld}`, 'g'),
    // Vue/Svelte component src: src="./old-name.xxx"
    new RegExp(`(src=['"\`]\\s*[^'"\`]*/)${escapedOld}(\\.[^'"\`]*['"\`])`, 'g'),
  ];

  for (const pattern of importPatterns) {
    if (pattern.test(line)) {
      pattern.lastIndex = 0;
      const newLine = line.replace(pattern, (match) => {
        return match.replace(new RegExp(escapedOld, 'g'), newName);
      });

      if (newLine !== line) {
        changes.push({
          fileUri,
          line: lineNumber,
          oldText: line.trim(),
          newText: newLine.trim(),
        });
      }
    }
  }

  return changes;
}

/**
 * Applies all import updates as a single WorkspaceEdit (atomic undo).
 */
export async function applyImportUpdates(changes: ImportChange[]): Promise<boolean> {
  if (changes.length === 0) {
    return true;
  }

  const edit = new vscode.WorkspaceEdit();

  // Group changes by file
  const changesByFile = new Map<string, ImportChange[]>();
  for (const change of changes) {
    const key = change.fileUri.toString();
    if (!changesByFile.has(key)) {
      changesByFile.set(key, []);
    }
    changesByFile.get(key)!.push(change);
  }

  // For each file, read content and apply all replacements
  for (const [, fileChanges] of changesByFile) {
    const fileUri = fileChanges[0].fileUri;

    try {
      const contentBytes = await vscode.workspace.fs.readFile(fileUri);
      const content = Buffer.from(contentBytes).toString('utf-8');
      const lines = content.split('\n');

      // Apply changes in reverse order to preserve line numbers
      const sortedChanges = [...fileChanges].sort((a, b) => b.line - a.line);

      for (const change of sortedChanges) {
        const lineIndex = change.line - 1;
        if (lineIndex >= 0 && lineIndex < lines.length) {
          // Find the old text in the line and replace it
          const oldLine = lines[lineIndex];
          const newLine = oldLine.replace(change.oldText.trim(), change.newText.trim());

          if (oldLine !== newLine) {
            const range = new vscode.Range(
              new vscode.Position(lineIndex, 0),
              new vscode.Position(lineIndex, oldLine.length)
            );
            edit.replace(fileUri, range, newLine);
          }
        }
      }
    } catch (err) {
      console.error(`Smart Rename: Error updating imports in ${fileUri.fsPath}`, err);
    }
  }

  return vscode.workspace.applyEdit(edit);
}

function buildSearchPatterns(oldName: string, folderPath: string): string[] {
  return [oldName];
}

function deduplicateChanges(changes: ImportChange[]): ImportChange[] {
  const seen = new Set<string>();
  return changes.filter((change) => {
    const key = `${change.fileUri.toString()}:${change.line}:${change.oldText}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
