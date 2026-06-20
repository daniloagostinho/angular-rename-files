import * as vscode from 'vscode';
import * as path from 'path';
import {
  computeFileRenames,
  computeInternalChanges,
  computeReferenceChanges,
  buildRenameTokens,
  addFileRenames,
  addContentChanges,
} from './renamer.js';
import { showPreview, showQuickConfirm } from './preview.js';

export function activate(context: vscode.ExtensionContext) {
  console.log('Smart Rename extension activated');

  // Command: Right-click a folder → "Smart Rename: Rename Folder & Files"
  const renameFolderCommand = vscode.commands.registerCommand(
    'smartRename.renameFolder',
    async (uri: vscode.Uri) => {
      if (!uri) {
        // Fallback: if no URI, ask user to pick
        const folderUris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Select Folder to Rename',
        });
        if (!folderUris || folderUris.length === 0) {
          return;
        }
        uri = folderUris[0];
      }

      const oldName = path.basename(uri.fsPath);

      const newName = await vscode.window.showInputBox({
        prompt: `Rename "${oldName}" to:`,
        value: oldName,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Name cannot be empty';
          }
          if (value === oldName) {
            return 'New name must be different from old name';
          }
          if (/[<>:"/\\|?*]/.test(value)) {
            return 'Name contains invalid characters';
          }
          return undefined;
        },
      });

      if (!newName) {
        return;
      }

      await performSmartRename(uri, oldName, newName, true);
    }
  );

  // Command: Right-click a file → "Smart Rename: Rename This Component"
  const renameFromFileCommand = vscode.commands.registerCommand(
    'smartRename.renameFromFile',
    async (uri: vscode.Uri) => {
      if (!uri) {
        return;
      }

      const folderUri = vscode.Uri.file(path.dirname(uri.fsPath));
      const folderName = path.basename(folderUri.fsPath);
      const fileName = path.basename(uri.fsPath);

      // Check if the file name starts with the folder name
      if (!fileName.startsWith(folderName)) {
        vscode.window.showWarningMessage(
          `Smart Rename: File "${fileName}" doesn't match folder name "${folderName}". ` +
          `This command works best when the file name starts with the folder name.`
        );
        return;
      }

      const newName = await vscode.window.showInputBox({
        prompt: `Rename component "${folderName}" to:`,
        value: folderName,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Name cannot be empty';
          }
          if (value === folderName) {
            return 'New name must be different from old name';
          }
          if (/[<>:"/\\|?*]/.test(value)) {
            return 'Name contains invalid characters';
          }
          return undefined;
        },
      });

      if (!newName) {
        return;
      }

      await performSmartRename(folderUri, folderName, newName, true);
    }
  );

  // Auto-detect folder renames in the explorer
  const fileWatcher = vscode.workspace.onDidRenameFiles(async (event) => {
    const config = vscode.workspace.getConfiguration('smartRename');
    const autoRename = config.get<boolean>('autoRenameOnFolderChange', true);

    if (!autoRename) {
      return;
    }

    for (const { oldUri, newUri } of event.files) {
      // Check if it's a directory rename
      try {
        const stat = await vscode.workspace.fs.stat(newUri);
        if (stat.type !== vscode.FileType.Directory) {
          continue;
        }
      } catch {
        continue;
      }

      const oldName = path.basename(oldUri.fsPath);
      const newName = path.basename(newUri.fsPath);

      if (oldName === newName) {
        continue;
      }

      // Check if there are files matching the old name pattern
      const renames = await computeFileRenames(newUri, oldName, newName);

      if (renames.length === 0) {
        continue;
      }

      // Offer to rename
      const result = await vscode.window.showInformationMessage(
        `Smart Rename: Found ${renames.length} file(s) matching "${oldName}" in the renamed folder. Rename them to "${newName}"?`,
        'Yes, rename all',
        'Preview changes',
        'No'
      );

      if (result === 'Yes, rename all') {
        await performSmartRename(newUri, oldName, newName, false, true);
      } else if (result === 'Preview changes') {
        await performSmartRename(newUri, oldName, newName);
      }
    }
  });

  context.subscriptions.push(renameFolderCommand, renameFromFileCommand, fileWatcher);
}

async function performSmartRename(
  folderUri: vscode.Uri,
  oldName: string,
  newName: string,
  renameFolder: boolean = false,
  skipPreview: boolean = false
): Promise<void> {
  const config = vscode.workspace.getConfiguration('smartRename');
  const shouldUpdateReferences = config.get<boolean>('updateImports', true);
  const shouldUpdateContents = config.get<boolean>('updateFileContents', true);
  const shouldShowPreview = config.get<boolean>('showPreview', true) && !skipPreview;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Smart Rename: ${oldName} → ${newName}`,
      cancellable: true,
    },
    async (progress, token) => {
      const tokens = buildRenameTokens(oldName, newName);

      // Step 1: file renames (boundary-aware: only files that are the unit).
      progress.report({ message: 'Scanning files...', increment: 10 });
      const fileRenames = await computeFileRenames(folderUri, oldName, newName);
      if (token.isCancellationRequested) {
        return;
      }

      // Step 2: content changes inside the component's own folder.
      progress.report({ message: 'Analyzing content...', increment: 20 });
      const internalChanges = shouldUpdateContents
        ? await computeInternalChanges(folderUri, tokens)
        : [];
      if (token.isCancellationRequested) {
        return;
      }

      // Step 3: references in OTHER files across the workspace.
      progress.report({ message: 'Scanning references...', increment: 30 });
      const referenceChanges = shouldUpdateReferences
        ? await computeReferenceChanges(folderUri, oldName, tokens)
        : [];
      if (token.isCancellationRequested) {
        return;
      }

      const totalChanges = fileRenames.length + internalChanges.length + referenceChanges.length;
      if (totalChanges === 0) {
        vscode.window.showInformationMessage('Smart Rename: No matching files found.');
        return;
      }

      // Step 4: preview or quick confirm. The user can uncheck individual items.
      let toApply = { fileRenames, internalChanges, referenceChanges };
      if (shouldShowPreview) {
        const selection = await showPreview(fileRenames, internalChanges, referenceChanges, oldName, newName);
        if (!selection) {
          return;
        }
        toApply = selection;
      } else if (!skipPreview) {
        const confirmed = await showQuickConfirm(fileRenames, internalChanges, referenceChanges, oldName, newName);
        if (!confirmed) {
          return;
        }
      }

      if (
        toApply.fileRenames.length === 0 &&
        toApply.internalChanges.length === 0 &&
        toApply.referenceChanges.length === 0
      ) {
        return;
      }

      // Step 5: Apply — RENAME FIRST, then edit text.
      //
      // Hard rule learned the hard way: you cannot edit a file's text AND rename
      // that same file in the same WorkspaceEdit. The text edit marks the file
      // dirty and the rename then fails, making applyEdit return false while the
      // text edit already stuck. So we strictly order the phases:
      //   Phase 1: rename child files (inside the still-old folder).
      //   Phase 2: rename the folder itself.
      //   Phase 3: text edits — internal content (remapped to the NEW paths)
      //            + references in other files (paths unchanged, computed above).
      progress.report({ message: 'Applying changes...', increment: 30 });

      // Guard: abort if the folder rename target already exists.
      let newFolderUri: vscode.Uri | undefined;
      if (renameFolder) {
        const parentUri = vscode.Uri.file(path.dirname(folderUri.fsPath));
        newFolderUri = vscode.Uri.joinPath(parentUri, newName);
        try {
          await vscode.workspace.fs.stat(newFolderUri);
          vscode.window.showErrorMessage(
            `Smart Rename: A folder named "${newName}" already exists here. Rename aborted.`
          );
          return;
        } catch {
          // Target does not exist — good to proceed.
        }
      }

      // --- Phase 1: rename selected child files (no text edits) ---
      if (toApply.fileRenames.length > 0) {
        const renameEdit = new vscode.WorkspaceEdit();
        addFileRenames(toApply.fileRenames, renameEdit);
        const ok = await vscode.workspace.applyEdit(renameEdit);
        if (!ok) {
          vscode.window.showErrorMessage(
            `Smart Rename: Failed to rename files for "${oldName} → ${newName}". Nothing was changed.`
          );
          return;
        }
      }

      // --- Phase 2: rename the folder itself (no text edits) ---
      let contentFolderUri = folderUri;
      if (renameFolder && newFolderUri) {
        const folderEdit = new vscode.WorkspaceEdit();
        folderEdit.renameFile(folderUri, newFolderUri, { overwrite: false });
        const ok = await vscode.workspace.applyEdit(folderEdit);
        if (!ok) {
          vscode.window.showWarningMessage(
            `Smart Rename: Files were renamed, but renaming the folder ` +
            `"${oldName}" → "${newName}" failed. Rename the folder manually.`
          );
          return;
        }
        contentFolderUri = newFolderUri;
      }

      // --- Phase 3: text edits, targeting the now-renamed files ---
      // Map each internal change's original path to its final path: the folder may
      // have moved (Phase 2) and its own file may have been renamed (Phase 1).
      const renamedBase = new Map<string, string>();
      for (const r of toApply.fileRenames) {
        renamedBase.set(path.basename(r.oldUri.fsPath), path.basename(r.newUri.fsPath));
      }
      const remappedInternal = toApply.internalChanges.map((change) => {
        const base = path.basename(change.uri.fsPath);
        const finalBase = renamedBase.get(base) ?? base;
        return { ...change, uri: vscode.Uri.joinPath(contentFolderUri, finalBase) };
      });

      const textEdit = new vscode.WorkspaceEdit();
      addContentChanges(remappedInternal, textEdit);
      addContentChanges(toApply.referenceChanges, textEdit);
      const textOk = await vscode.workspace.applyEdit(textEdit);
      if (!textOk) {
        vscode.window.showWarningMessage(
          `Smart Rename: Files were renamed, but updating contents/references failed. ` +
          `Check the references manually.`
        );
      }

      const appliedCount =
        toApply.fileRenames.length +
        toApply.internalChanges.length +
        toApply.referenceChanges.length +
        (renameFolder ? 1 : 0);

      progress.report({ message: 'Done!', increment: 10 });

      vscode.window.showInformationMessage(
        `Smart Rename: Successfully applied ${appliedCount} change(s). (${oldName} → ${newName})`
      );
    }
  );
}

export function deactivate() {
  // Cleanup if needed
}
