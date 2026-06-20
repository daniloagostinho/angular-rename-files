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
  console.log('Angular Rename Files extension activated');

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
          openLabel: 'Selecionar pasta para renomear',
        });
        if (!folderUris || folderUris.length === 0) {
          return;
        }
        uri = folderUris[0];
      }

      const oldName = path.basename(uri.fsPath);

      const newName = await vscode.window.showInputBox({
        prompt: `Renomear "${oldName}" para:`,
        value: oldName,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'O nome não pode ficar vazio';
          }
          if (value === oldName) {
            return 'O novo nome precisa ser diferente do atual';
          }
          if (/[<>:"/\\|?*]/.test(value)) {
            return 'O nome contém caracteres inválidos';
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
          `O arquivo "${fileName}" não corresponde à pasta "${folderName}". ` +
          `Este comando funciona melhor quando o nome do arquivo começa com o nome da pasta.`
        );
        return;
      }

      const newName = await vscode.window.showInputBox({
        prompt: `Renomear o componente "${folderName}" para:`,
        value: folderName,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'O nome não pode ficar vazio';
          }
          if (value === folderName) {
            return 'O novo nome precisa ser diferente do atual';
          }
          if (/[<>:"/\\|?*]/.test(value)) {
            return 'O nome contém caracteres inválidos';
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
        `Atualizar ${renames.length} arquivo(s) e referências de "${oldName}" para "${newName}"?`,
        'Renomear',
        'Ver detalhes',
        'Agora não'
      );

      if (result === 'Renomear') {
        await performSmartRename(newUri, oldName, newName, false, true);
      } else if (result === 'Ver detalhes') {
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

  const tokens = buildRenameTokens(oldName, newName);

  // --- Phase A: compute changes (progress notification, no user interaction) ---
  // Kept separate from the preview so the progress notification is NOT showing
  // behind the preview dropdown (that looked redundant).
  const computed = await vscode.window.withProgress(
    {
      // Status-bar progress (a subtle spinner), not a notification card.
      location: vscode.ProgressLocation.Window,
      title: 'Smart Rename',
    },
    async (progress) => {
      progress.report({ message: 'procurando arquivos…' });
      const fileRenames = await computeFileRenames(folderUri, oldName, newName);

      progress.report({ message: 'analisando conteúdo…' });
      const internalChanges = shouldUpdateContents
        ? await computeInternalChanges(folderUri, tokens)
        : [];

      progress.report({ message: 'procurando referências…' });
      const referenceChanges = shouldUpdateReferences
        ? await computeReferenceChanges(folderUri, oldName, tokens)
        : [];

      return { fileRenames, internalChanges, referenceChanges };
    }
  );

  if (!computed) {
    return;
  }

  const { fileRenames, internalChanges, referenceChanges } = computed;
  if (fileRenames.length + internalChanges.length + referenceChanges.length === 0) {
    vscode.window.showInformationMessage('Nenhum arquivo correspondente encontrado.');
    return;
  }

  // --- Phase B: preview / confirm (NO progress notification on screen) ---
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

  // --- Phase C: apply (subtle status-bar progress, no notification card) ---
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: 'Smart Rename',
    },
    async (progress) => {
      progress.report({ message: 'aplicando…' });

      // Apply order matters. You cannot edit a file's text AND rename that same
      // file in one WorkspaceEdit (the text edit marks it dirty and the rename
      // then fails). So: Phase 1 rename files, Phase 2 rename folder, Phase 3
      // text edits — internal content remapped to the new paths + references.

      // Guard: abort if the folder rename target already exists.
      let newFolderUri: vscode.Uri | undefined;
      if (renameFolder) {
        const parentUri = vscode.Uri.file(path.dirname(folderUri.fsPath));
        newFolderUri = vscode.Uri.joinPath(parentUri, newName);
        try {
          await vscode.workspace.fs.stat(newFolderUri);
          vscode.window.showErrorMessage(
            `Já existe uma pasta chamada "${newName}" aqui. Renomeação cancelada.`
          );
          return;
        } catch {
          // Target does not exist — good to proceed.
        }
      }

      // Phase 1: rename selected child files (no text edits).
      if (toApply.fileRenames.length > 0) {
        const renameEdit = new vscode.WorkspaceEdit();
        addFileRenames(toApply.fileRenames, renameEdit);
        const ok = await vscode.workspace.applyEdit(renameEdit);
        if (!ok) {
          vscode.window.showErrorMessage(
            `Não foi possível renomear os arquivos (${oldName} → ${newName}). Nada foi alterado.`
          );
          return;
        }
      }

      // Phase 2: rename the folder itself (no text edits).
      let contentFolderUri = folderUri;
      if (renameFolder && newFolderUri) {
        const folderEdit = new vscode.WorkspaceEdit();
        folderEdit.renameFile(folderUri, newFolderUri, { overwrite: false });
        const ok = await vscode.workspace.applyEdit(folderEdit);
        if (!ok) {
          vscode.window.showWarningMessage(
            `Os arquivos foram renomeados, mas não foi possível renomear a pasta ` +
            `"${oldName}" → "${newName}". Renomeie a pasta manualmente.`
          );
          return;
        }
        contentFolderUri = newFolderUri;
      }

      // Phase 3: text edits, targeting the now-renamed files.
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
          `Os arquivos foram renomeados, mas não foi possível atualizar o conteúdo/referências. ` +
          `Confira as referências manualmente.`
        );
      }

      const appliedCount =
        toApply.fileRenames.length +
        toApply.internalChanges.length +
        toApply.referenceChanges.length +
        (renameFolder ? 1 : 0);

      vscode.window.setStatusBarMessage(
        `$(check) Renomeado: ${oldName} → ${newName} (${appliedCount} mudança${appliedCount === 1 ? '' : 's'})`,
        4000
      );
    }
  );
}

export function deactivate() {
  // Cleanup if needed
}
