import * as vscode from 'vscode';
import * as path from 'path';
import {
  computeFileRenames,
  computeContentChangesInFolder,
  applyFileRenames,
  applyContentChangesInFolder,
} from './renamer.js';
import { computeImportUpdates, applyImportUpdates } from './import-updater.js';
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

      await performSmartRename(uri, oldName, newName);
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
  const shouldUpdateImports = config.get<boolean>('updateImports', true);
  const shouldUpdateContents = config.get<boolean>('updateFileContents', true);
  const shouldShowPreview = config.get<boolean>('showPreview', true) && !skipPreview;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Smart Rename: ${oldName} → ${newName}`,
      cancellable: true,
    },
    async (progress, token) => {
      // Step 1: Compute file renames
      progress.report({ message: 'Scanning files...', increment: 10 });
      const fileRenames = await computeFileRenames(folderUri, oldName, newName);

      if (token.isCancellationRequested) {
        return;
      }

      // Step 2: Compute content changes in the folder
      progress.report({ message: 'Analyzing content...', increment: 20 });
      const contentChanges = shouldUpdateContents
        ? await computeContentChangesInFolder(folderUri, oldName, newName)
        : [];

      if (token.isCancellationRequested) {
        return;
      }

      // Step 3: Compute import updates across the workspace
      progress.report({ message: 'Scanning imports...', increment: 30 });
      const importChanges = shouldUpdateImports
        ? await computeImportUpdates(folderUri.fsPath, oldName, newName)
        : [];

      if (token.isCancellationRequested) {
        return;
      }

      const totalChanges = fileRenames.length + contentChanges.length + importChanges.length;

      if (totalChanges === 0) {
        vscode.window.showInformationMessage('Smart Rename: No matching files found.');
        return;
      }

      // Step 4: Show preview or quick confirm
      if (shouldShowPreview) {
        const decision = await showPreview(fileRenames, contentChanges, importChanges, oldName, newName);
        if (decision === 'cancel') {
          return;
        }
      } else if (!skipPreview) {
        const confirmed = await showQuickConfirm(fileRenames, contentChanges, importChanges, oldName, newName);
        if (!confirmed) {
          return;
        }
      }

      // Step 5: Apply changes
      progress.report({ message: 'Applying changes...', increment: 30 });

      let appliedCount = 0;

      // 5a: Rename the folder itself if requested
      if (renameFolder) {
        const parentUri = vscode.Uri.file(path.dirname(folderUri.fsPath));
        const newFolderUri = vscode.Uri.joinPath(parentUri, newName);
        const folderEdit = new vscode.WorkspaceEdit();
        folderEdit.renameFile(folderUri, newFolderUri);
        const folderRenamed = await vscode.workspace.applyEdit(folderEdit);
        if (folderRenamed) {
          // Update folderUri to point to the new location
          folderUri = newFolderUri;
          appliedCount++;
        }
      }

      // 5b: Apply content changes BEFORE file renames (since we reference old file names)
      if (shouldUpdateContents && contentChanges.length > 0) {
        const contentSuccess = await applyContentChangesInFolder(folderUri, oldName, newName);
        if (contentSuccess) {
          appliedCount += contentChanges.length;
        }
      }

      // 5c: Apply import updates BEFORE file renames
      if (shouldUpdateImports && importChanges.length > 0) {
        const importSuccess = await applyImportUpdates(importChanges);
        if (importSuccess) {
          appliedCount += importChanges.length;
        }
      }

      // 5d: Apply file renames (last, since imports reference old names)
      if (fileRenames.length > 0) {
        const renameSuccess = await applyFileRenames(fileRenames);
        if (renameSuccess) {
          appliedCount += fileRenames.length;
        }
      }

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
