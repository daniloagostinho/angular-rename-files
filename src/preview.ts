import * as vscode from 'vscode';
import { RenameAction, ContentChange } from './renamer.js';

/** The subset of changes the user chose to apply. */
export interface PreviewSelection {
  fileRenames: RenameAction[];
  internalChanges: ContentChange[];
  referenceChanges: ContentChange[];
}

interface PreviewItem extends vscode.QuickPickItem {
  ref?: { type: 'rename' | 'internal' | 'reference'; index: number };
}

/**
 * Shows a single, scannable multi-select list of every planned change. Each item
 * is checked by default; unchecking excludes it. Returns the selected subset, or
 * null if the user cancelled. Native QuickPick = keyboard + screen-reader friendly.
 */
export async function showPreview(
  fileRenames: RenameAction[],
  internalChanges: ContentChange[],
  referenceChanges: ContentChange[],
  oldName: string,
  newName: string
): Promise<PreviewSelection | null> {
  const total = fileRenames.length + internalChanges.length + referenceChanges.length;
  if (total === 0) {
    vscode.window.showInformationMessage('Smart Rename: No matching files found to rename.');
    return null;
  }

  const items: PreviewItem[] = [];

  if (fileRenames.length) {
    items.push({ label: 'Files to rename', kind: vscode.QuickPickItemKind.Separator });
    fileRenames.forEach((r, index) => {
      items.push({ label: `$(file) ${r.description}`, picked: true, ref: { type: 'rename', index } });
    });
  }

  if (internalChanges.length) {
    items.push({ label: 'Content in component files', kind: vscode.QuickPickItemKind.Separator });
    internalChanges.forEach((c, index) => {
      items.push({
        label: `$(symbol-property) ${vscode.workspace.asRelativePath(c.uri)}`,
        description: `${c.changedLines.length} change${plural(c.changedLines.length)}`,
        detail: firstLinePreview(c),
        picked: true,
        ref: { type: 'internal', index },
      });
    });
  }

  if (referenceChanges.length) {
    items.push({ label: 'References in other files', kind: vscode.QuickPickItemKind.Separator });
    referenceChanges.forEach((c, index) => {
      items.push({
        label: `$(references) ${vscode.workspace.asRelativePath(c.uri)}`,
        description: `${c.changedLines.length} change${plural(c.changedLines.length)}`,
        detail: firstLinePreview(c),
        picked: true,
        ref: { type: 'reference', index },
      });
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: `Smart Rename: ${oldName} → ${newName}`,
    placeHolder: `${summary(fileRenames, internalChanges, referenceChanges)} — uncheck to skip, Enter to apply`,
  });

  if (!picked || picked.length === 0) {
    return null;
  }

  const selection: PreviewSelection = { fileRenames: [], internalChanges: [], referenceChanges: [] };
  for (const item of picked) {
    if (!item.ref) {
      continue;
    }
    if (item.ref.type === 'rename') {
      selection.fileRenames.push(fileRenames[item.ref.index]);
    } else if (item.ref.type === 'internal') {
      selection.internalChanges.push(internalChanges[item.ref.index]);
    } else {
      selection.referenceChanges.push(referenceChanges[item.ref.index]);
    }
  }
  return selection;
}

/** Simple confirmation used when the preview setting is disabled. Applies all. */
export async function showQuickConfirm(
  fileRenames: RenameAction[],
  internalChanges: ContentChange[],
  referenceChanges: ContentChange[],
  oldName: string,
  newName: string
): Promise<boolean> {
  const message =
    `Rename ${oldName} → ${newName}? ${summary(fileRenames, internalChanges, referenceChanges)}`;
  const result = await vscode.window.showInformationMessage(message, 'Yes', 'No');
  return result === 'Yes';
}

function summary(
  fileRenames: RenameAction[],
  internalChanges: ContentChange[],
  referenceChanges: ContentChange[]
): string {
  const parts: string[] = [];
  if (fileRenames.length) {
    parts.push(`${fileRenames.length} file${plural(fileRenames.length)} renamed`);
  }
  if (internalChanges.length) {
    parts.push(`${internalChanges.length} content`);
  }
  if (referenceChanges.length) {
    parts.push(`${referenceChanges.length} reference${plural(referenceChanges.length)}`);
  }
  return parts.join(' · ') || 'no changes';
}

function firstLinePreview(change: ContentChange): string {
  const first = change.changedLines[0];
  if (!first) {
    return '';
  }
  const more = change.changedLines.length - 1;
  const head = `L${first.line}: ${first.oldText} → ${first.newText}`;
  return more > 0 ? `${head}  (+${more} more)` : head;
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}
