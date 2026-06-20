import * as vscode from 'vscode';
import { RenameAction, ContentChange } from './renamer.js';

/** O subconjunto de mudanças que o usuário escolheu aplicar. */
export interface PreviewSelection {
  fileRenames: RenameAction[];
  internalChanges: ContentChange[];
  referenceChanges: ContentChange[];
}

interface PreviewItem extends vscode.QuickPickItem {
  ref?: { type: 'rename' | 'internal' | 'reference'; index: number };
}

/**
 * Passo leve por padrão (progressive disclosure): mostra só um resumo de uma
 * linha e a ação principal. Os detalhes item a item ficam a um clique de
 * distância, em "Ver detalhes". Reduz a carga cognitiva no caso comum.
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
    vscode.window.showInformationMessage('Nenhum arquivo correspondente encontrado.');
    return null;
  }

  const resumo = resumir(fileRenames, internalChanges, referenceChanges);

  const choice = await vscode.window.showQuickPick(
    [
      { label: '$(check) Renomear', description: resumo, action: 'apply' },
      { label: '$(list-selection) Ver detalhes', description: 'Escolher item a item', action: 'details' },
    ],
    {
      title: `Renomear  ${oldName} → ${newName}`,
      placeHolder: resumo,
    }
  );

  if (!choice) {
    return null;
  }
  if (choice.action === 'details') {
    return showDetails(fileRenames, internalChanges, referenceChanges, oldName, newName);
  }
  return { fileRenames, internalChanges, referenceChanges };
}

/** Lista completa multi-seleção — para quem quer controle fino. */
async function showDetails(
  fileRenames: RenameAction[],
  internalChanges: ContentChange[],
  referenceChanges: ContentChange[],
  oldName: string,
  newName: string
): Promise<PreviewSelection | null> {
  const items: PreviewItem[] = [];

  if (fileRenames.length) {
    items.push({ label: 'Arquivos a renomear', kind: vscode.QuickPickItemKind.Separator });
    fileRenames.forEach((r, index) => {
      items.push({ label: `$(file) ${r.description}`, picked: true, ref: { type: 'rename', index } });
    });
  }

  if (internalChanges.length) {
    items.push({ label: 'Conteúdo do componente', kind: vscode.QuickPickItemKind.Separator });
    internalChanges.forEach((c, index) => {
      items.push({
        label: `$(symbol-property) ${vscode.workspace.asRelativePath(c.uri)}`,
        description: contar(c.changedLines.length),
        picked: true,
        ref: { type: 'internal', index },
      });
    });
  }

  if (referenceChanges.length) {
    items.push({ label: 'Referências em outros arquivos', kind: vscode.QuickPickItemKind.Separator });
    referenceChanges.forEach((c, index) => {
      items.push({
        label: `$(references) ${vscode.workspace.asRelativePath(c.uri)}`,
        description: contar(c.changedLines.length),
        picked: true,
        ref: { type: 'reference', index },
      });
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: `Renomear  ${oldName} → ${newName}`,
    placeHolder: 'Desmarque o que não quer alterar · Enter para aplicar',
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

/** Confirmação simples usada quando o preview está desativado nas configurações. */
export async function showQuickConfirm(
  fileRenames: RenameAction[],
  internalChanges: ContentChange[],
  referenceChanges: ContentChange[],
  oldName: string,
  newName: string
): Promise<boolean> {
  const resumo = resumir(fileRenames, internalChanges, referenceChanges);
  const result = await vscode.window.showInformationMessage(
    `Renomear ${oldName} → ${newName}? (${resumo})`,
    'Sim',
    'Não'
  );
  return result === 'Sim';
}

function resumir(
  fileRenames: RenameAction[],
  internalChanges: ContentChange[],
  referenceChanges: ContentChange[]
): string {
  const parts: string[] = [];
  if (fileRenames.length) {
    parts.push(`${fileRenames.length} ${fileRenames.length === 1 ? 'arquivo' : 'arquivos'}`);
  }
  if (internalChanges.length) {
    parts.push(`${internalChanges.length} no conteúdo`);
  }
  if (referenceChanges.length) {
    parts.push(`${referenceChanges.length} ${referenceChanges.length === 1 ? 'referência' : 'referências'}`);
  }
  return parts.join(' · ') || 'nenhuma mudança';
}

function contar(n: number): string {
  return n === 1 ? '1 alteração' : `${n} alterações`;
}
