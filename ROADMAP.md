# Smart Rename — Roadmap de Implementação

> Documento vivo. Serve como histórico de decisões e plano de execução.
> Última atualização: 2026-06-19

## Visão

Renomear a **unidade lógica** (um componente, não 5 arquivos soltos) com um único
comando, atualizando arquivos, pasta, classe, selector e imports — de forma
**atômica, reversível e previsível**. Angular como cidadão de primeira classe;
demais frameworks como best-effort via tsserver.

**Princípio norteador:** não competir com o language service (onde regex sempre
perde), e sim **orquestrá-lo** — deixar o tsserver/Angular fazer o trabalho pesado
e cobrir só as lacunas (selector, CSS, strings de rota, snapshots).

---

## Arquitetura-alvo (camadas)

| Camada | Responsabilidade | Tecnologia | Confiabilidade |
|---|---|---|---|
| A | Renomear arquivos + pasta | `WorkspaceEdit.renameFile` (1 edit atômico) | Alta |
| B | Atualizar imports TS/JS | tsserver "update imports on move" (automático) | Alta |
| C | Renomear símbolos (classe, selector) | `executeDocumentRenameProvider` (LSP) | Alta |
| D | Lacunas (CSS, `templateUrl`, rotas, snapshots) | `ts-morph` + fallback textual | Média (com preview) |

**Regra de ouro:** tudo num único `WorkspaceEdit` → um Ctrl+Z desfaz tudo.

---

## Fase 0 — Correção de bugs (destrava o estado atual) ✅

- [x] **Bug 1:** comando "Rename Folder & Files" não renomeia a pasta.
      Causa: `performSmartRename(uri, oldName, newName)` em `extension.ts:56` não
      passava `renameFolder`. Fix: passa `true`.
- [x] **Bug 2 (ordem):** renomear a pasta num `applyEdit` separado deixava os
      `oldUri` dos arquivos obsoletos. Fix: **tudo num único `WorkspaceEdit`**,
      arquivos primeiro (dentro da pasta antiga) e **pasta por último**.
- [x] Atomicidade: 1 único `applyEdit` para renames + conteúdo + imports + pasta.
      Funções `apply*` viraram `add*` que populam um edit compartilhado.
- [x] Detecção de conflito: aborta com mensagem clara via `fs.stat` se o destino
      já existir.

**Critério de pronto:** renomear `header` → `loja` pelo menu da pasta renomeia a
pasta, os 4 arquivos e os imports, e desfaz com um único Ctrl+Z. ✅ (build limpo;
falta validação manual rodando a extensão — `F5` no Extension Host)

---

## Fase 1 — Motor confiável (boundary-aware + testado) ✅

Implementado um motor de substituição **boundary-aware** puro (`src/core.ts`, sem
dependência de `vscode`), coberto por **23 testes** (`src/core.test.ts`, rode com
`npm run test:unit`). Substitui o regex global ingênuo que casava substrings.

- [x] **`core.ts` puro + testes** cobrindo os falsos positivos (`subHeader`,
      `headers`, `headerColor`, `header-icon`, `header-utils`, prosa).
- [x] **Substituição por token com fronteiras** nas casings kebab/camel/Pascal —
      `HeaderComponent`, `app-header`, `./header`, `.header` viram o novo nome;
      `subheader`/`headers`/`header-icon` ficam intactos.
- [x] **Renomeação de arquivos boundary-aware** (`renameFileStem`): só renomeia o
      que é a unidade (`header.component.ts`), nunca `headerbar.component.ts`.
- [x] **Cross-file com gate** (`referencesModule`): só edita arquivos que de fato
      importam o módulo / usam o selector. Resolve `imports: [HeaderComponent]`,
      `loadComponent`, rotas. Arquivos que só contêm a palavra são ignorados.
- [x] `renamer.ts` reescrito sobre o `core`; `import-updater.ts` removido (lógica
      unificada em "internal" + "reference" changes).

**Decisão vs. plano original:** optei por **motor boundary-aware testável** em vez
de ts-morph/LSP. Motivo honesto: não dá para testar integração LSP de forma
headless neste ambiente, e shipar isso sem teste contraria o objetivo de
assertividade. O motor atual passa numa bateria de testes de falso-positivo e é
determinístico. ts-morph/LSP fica como evolução futura (ver "Pendências").

**Limitação conhecida (documentada e testada):** dentro de um arquivo que já
referencia o módulo, um token `header` solto também é renomeado — visível no
preview para o usuário desmarcar. E variantes BEM (`.header-title`) não são
renomeadas (trade-off seguro contra componentes irmãos como `app-header-icon`).

---

## Fase 2 — UX / preview (entregue via QuickPick multi-seleção) ✅

- [x] **Preview multi-seleção com checkbox por item** (`canPickMany`): lista única
      e escaneável de TODA mudança, agrupada por seção (arquivos / conteúdo /
      referências), tudo marcado por padrão. Desmarcar = pular aquele item.
- [x] **Controle granular real**: a seleção é honrada na aplicação — URIs internas
      são remapeadas para os caminhos já renomeados.
- [x] **Ruído reduzido**: resumo de 1 linha (`4 files renamed · 2 content · 3
      references`) + preview da 1ª linha alterada por arquivo (`+N more`).
- [x] **ThemeIcons** (`$(file)`, `$(symbol-property)`, `$(references)`) em vez de
      emoji — herdam cor/contraste do tema.
- [x] **Acessibilidade nativa**: QuickPick é 100% teclado + compatível com leitor
      de tela por padrão (sem webview custom).

**Decisão vs. plano original:** TreeView/webview foi trocado por **QuickPick
multi-seleção nativo**. Entrega os mesmos objetivos (checkbox granular, ruído
reduzido, a11y) com muito menos risco e sem UI não-testável. TreeView com diff
inline fica como evolução visual futura.

---

## Fase 3 — Features "power user"

- [x] **Renomear todas as representações do nome** (kebab/Pascal/camel/selector/CSS)
      — entregue pelo motor da Fase 1 (um token por casing, tudo de uma vez).
- [ ] **Bulk rename com padrão** (regex, prefixo/sufixo, case transform, numeração).
      _Adiado_ — feature grande e independente; não entra no núcleo "renomear unidade".
- [ ] **`git mv`** por baixo para preservar histórico. _Adiado._
- [x] **Detecção automática** (`onDidRenameFiles`) já integrada ao novo fluxo/preview.

### Pendências / evolução futura
- ts-morph ou LSP rename provider para renomear o **símbolo da classe** em usos
  fora de import (hoje coberto pelo heurístico cross-file gated, que resolve os
  casos Angular comuns mas não é garantia formal de escopo).
- Suporte a `tsconfig` paths/aliases (`@app/...`) e barrel files no gate.
- i18n PT/EN via `package.nls.json` (strings ainda em inglês).

---

## 🎨 UX / Usabilidade / Acessibilidade (prioridade alta)

> Diagnóstico atual: o preview (`preview.ts`) joga **todas** as mudanças como texto
> num QuickPick + Output Channel. Vira uma parede de texto — o dev não consegue
> escanear rápido nem confiar. O fluxo tem decisões demais ("Apply All / Show
> Details / Cancel" e depois de novo um modal). **Menos é mais.**

### Princípios

1. **Progressive disclosure:** mostrar primeiro o resumo de uma linha; detalhes só
   sob demanda.
2. **Uma decisão por vez:** evitar telas que perguntam a mesma coisa duas vezes.
3. **Ver antes de confiar:** diff real, agrupado por arquivo.
4. **Default seguro:** ação primária óbvia, destrutivo nunca é o default.

### Redesenho do preview (substitui o QuickPick atual)

```
Smart Rename: header → loja                          [Aplicar tudo] [Cancelar]
────────────────────────────────────────────────────────────────────────────
▾ 📁 Arquivos (4)
   ☑ header.ts        → loja.ts
   ☑ header.html      → loja.html
   ☑ header.scss      → loja.scss
   ☑ header.spec.ts   → loja.spec.ts
▾ 🏷️  Símbolos (2)
   ☑ HeaderComponent  → LojaComponent
   ☑ app-header       → app-loja
▾ 🔗 Imports (3)        — atualizados automaticamente pelo TypeScript
   ☑ app.module.ts:12
   ☑ home.component.ts:5
   ☑ routes.ts:8
```

- Implementar como **TreeView** (`vscode.window.createTreeView`) num view container
  próprio na Activity Bar, **ou** como webview leve. TreeView é mais barato, nativo,
  acessível e respeita o tema automaticamente — **recomendado para a v1**.
- Cada nó com **checkbox** (`TreeItemCheckboxState`) para aceitar/rejeitar granular.
- Clicar num nó abre o **diff nativo** (`vscode.diff`) daquela mudança.
- Grupos colapsáveis; começam expandidos só os de baixa contagem.

### Redução de ruído

- [ ] Resumo de 1 linha: `4 arquivos · 2 símbolos · 3 imports`.
- [ ] Imports de TS marcados como "automático" — não listar linha a linha, só contagem
      (o tsserver cuida; detalhe sob demanda).
- [ ] Remover o duplo-modal (`Show Details` → outro `Apply All?`). Uma confirmação só.
- [ ] Mensagens curtas e acionáveis (sem parágrafos no `showInformationMessage`).

### Aparência / consistência

- [ ] Usar **ThemeIcons** (`$(file)`, `$(symbol-class)`, `$(references)`) em vez de
      emojis para herdar cor do tema e contraste.
- [ ] Respeitar tema claro/escuro/alto-contraste automaticamente (TreeView já faz).
- [ ] Estados vazios claros: "Nenhuma mudança encontrada" com motivo.

### Acessibilidade (a11y)

- [ ] **Navegação 100% por teclado**: abrir preview, marcar/desmarcar, aplicar,
      cancelar — tudo sem mouse. Definir keybindings (`when` clauses).
- [ ] **Leitor de tela**: `accessibilityInformation` (label + role) em cada TreeItem.
- [ ] **Contraste**: nada de cor como único indicador; usar ícone + texto.
- [ ] **Foco previsível**: ao aplicar, foco volta para o editor; ao cancelar, para a
      origem.
- [ ] **i18n**: extrair strings para `package.nls.json` (PT-BR e EN). Hoje tudo é
      hardcoded em inglês.

### Fluxo de entrada (input)

- [ ] Validação inline já existe (`validateInput`) — manter, mas dar feedback do que
      será afetado em tempo real (ex.: "vai renomear 4 arquivos").
- [ ] Lembrar última escolha de "aplicar sem preview" por workspace, se o usuário
      pedir.

---

## Decisões de arquitetura (histórico)

| Data | Decisão | Motivo |
|---|---|---|
| 2026-06-19 | Orquestrar LSP/tsserver em vez de regex próprio | Regex gera falsos positivos e não cobre alias/barrel; tsserver já resolve imports de TS/JS de qualquer framework |
| 2026-06-19 | Angular first, genérico best-effort | Convenção de nomes previsível só existe no Angular; valor "smart" vem daí |
| 2026-06-19 | TreeView nativo para preview (não webview) na v1 | Mais barato, acessível, herda tema; webview fica para v2 se precisar de mais riqueza |
| 2026-06-19 | `ts-morph` como motor do fallback | Melhor lib de AST do ecossistema TS para grafo de referências |
| 2026-06-19 | IA fora do caminho crítico | Refactor exige determinismo e reversibilidade; IA só para desambiguação opcional |

---

## Métrica de sucesso

- Renomear um componente Angular completo em **1 ação**, **0 ajustes manuais**.
- **0 falsos positivos** em projeto real de médio porte.
- Preview compreensível em **< 5 segundos** de leitura.
- Tudo reversível com **1 Ctrl+Z**.
</content>
</invoke>
