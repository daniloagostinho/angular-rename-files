import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface RenameAction {
  oldUri: vscode.Uri;
  newUri: vscode.Uri;
  type: 'file' | 'content';
  description: string;
}

export interface ContentChange {
  file: vscode.Uri;
  oldText: string;
  newText: string;
  line: number;
  description: string;
}

export interface RenameResult {
  fileRenames: RenameAction[];
  contentChanges: ContentChange[];
}

/**
 * Scans a folder and finds all files whose name starts with the old folder name.
 * Returns a list of rename actions (old path -> new path).
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
        // Recursively handle subfolders if file name matches
        if (fileName.startsWith(oldName)) {
          const newFolderName = fileName.replace(oldName, newName);
          const oldUri = vscode.Uri.joinPath(folderUri, fileName);
          const newUri = vscode.Uri.joinPath(folderUri, newFolderName);
          renames.push({
            oldUri,
            newUri,
            type: 'file',
            description: `Rename folder: ${fileName} → ${newFolderName}`,
          });
        }
        continue;
      }

      // Check if file name starts with the old folder name
      if (fileName.startsWith(oldName)) {
        const newFileName = fileName.replace(oldName, newName);
        const oldUri = vscode.Uri.joinPath(folderUri, fileName);
        const newUri = vscode.Uri.joinPath(folderUri, newFileName);

        renames.push({
          oldUri,
          newUri,
          type: 'file',
          description: `${fileName} → ${newFileName}`,
        });
      }
    }
  } catch (err) {
    console.error('Smart Rename: Error reading folder', err);
  }

  return renames;
}

/**
 * Given a list of file renames, scans the workspace for files that import/reference
 * the old paths and computes content changes.
 */
export async function computeContentChangesInFolder(
  folderUri: vscode.Uri,
  oldName: string,
  newName: string
): Promise<ContentChange[]> {
  const changes: ContentChange[] = [];

  try {
    const entries = await vscode.workspace.fs.readDirectory(folderUri);

    for (const [fileName, fileType] of entries) {
      if (fileType === vscode.FileType.Directory) {
        continue;
      }

      const fileUri = vscode.Uri.joinPath(folderUri, fileName);
      const contentBytes = await vscode.workspace.fs.readFile(fileUri);
      const content = Buffer.from(contentBytes).toString('utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for various patterns where the old name might appear
        const patterns = getContentPatterns(oldName, newName);

        for (const pattern of patterns) {
          if (pattern.regex.test(line)) {
            changes.push({
              file: fileUri,
              oldText: line.trim(),
              newText: line.replace(pattern.regex, pattern.replacement).trim(),
              line: i + 1,
              description: pattern.description,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Smart Rename: Error scanning folder contents', err);
  }

  return changes;
}

interface ContentPattern {
  regex: RegExp;
  replacement: string;
  description: string;
}

function getContentPatterns(oldName: string, newName: string): ContentPattern[] {
  const oldPascal = toPascalCase(oldName);
  const newPascal = toPascalCase(newName);
  const oldCamel = toCamelCase(oldName);
  const newCamel = toCamelCase(newName);

  return [
    // Angular selector: 'app-old-name' → 'app-new-name'
    {
      regex: new RegExp(`app-${escapeRegex(oldName)}`, 'g'),
      replacement: `app-${newName}`,
      description: `Angular selector: app-${oldName} → app-${newName}`,
    },
    // PascalCase class/component name: OldNameComponent → NewNameComponent
    {
      regex: new RegExp(`${escapeRegex(oldPascal)}`, 'g'),
      replacement: newPascal,
      description: `Class/Component name: ${oldPascal} → ${newPascal}`,
    },
    // camelCase references
    {
      regex: new RegExp(`${escapeRegex(oldCamel)}`, 'g'),
      replacement: newCamel,
      description: `camelCase reference: ${oldCamel} → ${newCamel}`,
    },
    // CSS class with old name: .old-name-xxx → .new-name-xxx
    {
      regex: new RegExp(`\\.${escapeRegex(oldName)}-`, 'g'),
      replacement: `.${newName}-`,
      description: `CSS class: .${oldName}- → .${newName}-`,
    },
    // CSS class exact: .old-name → .new-name
    {
      regex: new RegExp(`\\.${escapeRegex(oldName)}([\\s{,])`, 'g'),
      replacement: `.${newName}$1`,
      description: `CSS class: .${oldName} → .${newName}`,
    },
  ];
}

/**
 * Applies file renames using a WorkspaceEdit for atomic undo.
 */
export async function applyFileRenames(renames: RenameAction[]): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();

  for (const rename of renames) {
    edit.renameFile(rename.oldUri, rename.newUri);
  }

  return vscode.workspace.applyEdit(edit);
}

/**
 * Applies content changes to files in the folder (selectors, class names, etc).
 */
export async function applyContentChangesInFolder(
  folderUri: vscode.Uri,
  oldName: string,
  newName: string
): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();

  try {
    const entries = await vscode.workspace.fs.readDirectory(folderUri);

    for (const [fileName, fileType] of entries) {
      if (fileType === vscode.FileType.Directory) {
        continue;
      }

      const fileUri = vscode.Uri.joinPath(folderUri, fileName);
      const contentBytes = await vscode.workspace.fs.readFile(fileUri);
      const content = Buffer.from(contentBytes).toString('utf-8');
      const patterns = getContentPatterns(oldName, newName);

      let newContent = content;
      let hasChanges = false;

      for (const pattern of patterns) {
        if (pattern.regex.test(newContent)) {
          // Reset regex lastIndex since we use 'g' flag
          pattern.regex.lastIndex = 0;
          newContent = newContent.replace(pattern.regex, pattern.replacement);
          hasChanges = true;
        }
      }

      if (hasChanges) {
        const fullRange = new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(content.split('\n').length, 0)
        );
        edit.replace(fileUri, fullRange, newContent);
      }
    }
  } catch (err) {
    console.error('Smart Rename: Error applying content changes', err);
    return false;
  }

  return vscode.workspace.applyEdit(edit);
}

// --- Utility functions ---

export function toPascalCase(str: string): string {
  return str
    .split(/[-_.]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
