import * as vscode from 'vscode';
import { RenameAction, ContentChange } from './renamer.js';
import { ImportChange } from './import-updater.js';

export interface PreviewItem {
  label: string;
  description: string;
  detail?: string;
  picked: boolean;
  type: 'file-rename' | 'content-change' | 'import-change';
  data: RenameAction | ContentChange | ImportChange;
}

/**
 * Shows a preview of all planned changes and lets the user confirm or cancel.
 * Returns true if the user confirmed, false if cancelled.
 */
export async function showPreview(
  fileRenames: RenameAction[],
  contentChanges: ContentChange[],
  importChanges: ImportChange[],
  oldName: string,
  newName: string
): Promise<'apply' | 'apply-selected' | 'cancel'> {
  const totalChanges = fileRenames.length + contentChanges.length + importChanges.length;

  if (totalChanges === 0) {
    vscode.window.showInformationMessage('Smart Rename: No matching files found to rename.');
    return 'cancel';
  }

  // Build a detailed message
  const lines: string[] = [
    `Smart Rename: ${oldName} → ${newName}`,
    '',
  ];

  if (fileRenames.length > 0) {
    lines.push(`📁 File renames (${fileRenames.length}):`);
    for (const rename of fileRenames) {
      lines.push(`  ${rename.description}`);
    }
    lines.push('');
  }

  if (contentChanges.length > 0) {
    lines.push(`📝 Content changes in folder (${contentChanges.length}):`);
    for (const change of contentChanges) {
      lines.push(`  ${change.description} (line ${change.line})`);
    }
    lines.push('');
  }

  if (importChanges.length > 0) {
    lines.push(`🔗 Import/reference updates (${importChanges.length}):`);
    const byFile = groupImportsByFile(importChanges);
    for (const [filePath, changes] of byFile) {
      lines.push(`  ${filePath}:`);
      for (const change of changes) {
        lines.push(`    L${change.line}: ${change.oldText} → ${change.newText}`);
      }
    }
    lines.push('');
  }

  lines.push(`Total: ${totalChanges} changes`);

  // Show as QuickPick with items for selection
  const items: vscode.QuickPickItem[] = [
    {
      label: '$(check) Apply All Changes',
      description: `${totalChanges} changes`,
      detail: 'Apply all file renames, content changes, and import updates',
    },
    {
      label: '$(list-flat) Show Details',
      description: 'View all changes before applying',
    },
    {
      label: '$(close) Cancel',
      description: 'Cancel the rename operation',
    },
  ];

  const selection = await vscode.window.showQuickPick(items, {
    title: `Smart Rename: ${oldName} → ${newName} (${totalChanges} changes)`,
    placeHolder: 'Choose an action',
  });

  if (!selection) {
    return 'cancel';
  }

  if (selection.label.includes('Cancel')) {
    return 'cancel';
  }

  if (selection.label.includes('Show Details')) {
    // Show detailed output in an output channel
    const outputChannel = vscode.window.createOutputChannel('Smart Rename Preview');
    outputChannel.clear();
    outputChannel.appendLine(lines.join('\n'));
    outputChannel.show();

    // Ask again after showing details
    const confirm = await vscode.window.showInformationMessage(
      `Smart Rename: Apply ${totalChanges} changes? (${oldName} → ${newName})`,
      { modal: true },
      'Apply All',
      'Cancel'
    );

    if (confirm === 'Apply All') {
      return 'apply';
    }
    return 'cancel';
  }

  return 'apply';
}

/**
 * Shows a simple confirmation dialog (used when preview is disabled in settings).
 */
export async function showQuickConfirm(
  fileRenames: RenameAction[],
  contentChanges: ContentChange[],
  importChanges: ImportChange[],
  oldName: string,
  newName: string
): Promise<boolean> {
  const parts: string[] = [];

  if (fileRenames.length > 0) {
    parts.push(`${fileRenames.length} file(s)`);
  }
  if (contentChanges.length > 0) {
    parts.push(`${contentChanges.length} content change(s)`);
  }
  if (importChanges.length > 0) {
    parts.push(`${importChanges.length} import(s)`);
  }

  const message = `Rename ${parts.join(', ')}: ${oldName} → ${newName}?`;

  const result = await vscode.window.showInformationMessage(
    message,
    'Yes',
    'No'
  );

  return result === 'Yes';
}

function groupImportsByFile(changes: ImportChange[]): Map<string, ImportChange[]> {
  const grouped = new Map<string, ImportChange[]>();

  for (const change of changes) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(change.fileUri);
    const relativePath = workspaceFolder
      ? vscode.workspace.asRelativePath(change.fileUri)
      : change.fileUri.fsPath;

    if (!grouped.has(relativePath)) {
      grouped.set(relativePath, []);
    }
    grouped.get(relativePath)!.push(change);
  }

  return grouped;
}
