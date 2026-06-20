<div align="center">
  <img src="icon.png" width="120" alt="Angular Rename Files" />
  <h1>Angular Rename Files</h1>
  <p><strong>Renomeie um componente Angular de uma vez só</strong> — pasta, arquivos, classe, selector e imports, com um único comando.</p>

  [![Version](https://img.shields.io/visual-studio-marketplace/v/danilodevsilva.power-rename?label=version&color=C3002F)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.power-rename)
  [![Installs](https://img.shields.io/visual-studio-marketplace/i/danilodevsilva.power-rename?color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.power-rename)
  [![Rating](https://img.shields.io/visual-studio-marketplace/r/danilodevsilva.power-rename?color=orange)](https://marketplace.visualstudio.com/items?itemName=danilodevsilva.power-rename)
</div>

---

No Angular, renomear um componente é chato: você tem `header.component.ts`, `header.component.html`, `header.component.scss`, `header.component.spec.ts`, a classe `HeaderComponent`, o selector `app-header` e ainda os imports espalhados pelo projeto. Renomear tudo isso na mão é trabalhoso e fácil de esquecer um pedaço.

Esta extensão faz **tudo de uma vez**, com prévia e um único *Ctrl+Z* pra desfazer.

## ✨ O que ela faz

Ao renomear `header` → `loja`, ela cuida de:

- 📁 **A pasta** — `header/` → `loja/`
- 📄 **Os arquivos** — `header.component.ts` → `loja.component.ts` (e `.html`, `.scss`, `.spec.ts`…)
- 🏷️ **A classe** — `HeaderComponent` → `LojaComponent`
- 🔖 **O selector** — `app-header` → `app-loja` (na definição e em todos os templates que usam)
- 🔗 **Os imports e referências** — em todo o projeto (módulos, `imports: []` de standalone, rotas com `loadComponent`, etc.)

Tudo passa por uma **prévia** antes de aplicar, e você pode desmarcar item a item.

## 🚀 Como usar

1. **Clique com o botão direito na pasta** do componente no Explorer → **"Angular Rename: Renomear pasta e arquivos"**.
2. Digite o novo nome.
3. Confirme em **Renomear** (ou **Ver detalhes** pra escolher item a item).

Também funciona clicando com o botão direito em **qualquer arquivo do componente** → **"Angular Rename: Renomear este componente"**.

E se você **renomear a pasta manualmente** pelo Explorer, a extensão detecta e oferece atualizar o resto.

## 🎯 Por que é confiável

O motor é **boundary-aware** (consciente de fronteiras de identificador) e coberto por uma bateria de testes automatizados. Isso significa que ele:

- ✅ Renomeia `HeaderComponent`, `app-header`, `./header`, `.header`
- 🚫 **Não** toca em `subHeader`, `headers`, `header-icon`, `header-utils` ou na palavra "header" em prosa
- 🎯 Só edita arquivos que **de fato referenciam** o componente (importam o módulo ou usam o selector) — arquivos que só contêm a palavra são ignorados

Tudo é aplicado como uma operação atômica: **um Ctrl+Z desfaz tudo**.

## ⚙️ Configurações

| Configuração | Padrão | Descrição |
|---|---|---|
| `smartRename.showPreview` | `true` | Mostrar a prévia antes de aplicar |
| `smartRename.updateImports` | `true` | Atualizar imports e referências no projeto |
| `smartRename.updateFileContents` | `true` | Atualizar classe, selector e referências internas |
| `smartRename.autoRenameOnFolderChange` | `true` | Detectar renomeação manual de pasta e oferecer atualizar o resto |
| `smartRename.excludeFolders` | `node_modules`, `dist`, … | Pastas ignoradas na busca de referências |

## 📐 Convenção esperada (Angular)

Funciona melhor com a estrutura padrão de componente Angular, onde os arquivos compartilham o nome da pasta:

```
header/
├─ header.component.ts      → loja.component.ts
├─ header.component.html    → loja.component.html
├─ header.component.scss    → loja.component.scss
└─ header.component.spec.ts → loja.component.spec.ts
```

> Também funciona com a convenção mais nova do Angular (sem o sufixo `.component`): `header.ts`, `header.html`, `header.scss`, `header.spec.ts`.

## ⚠️ Limitações conhecidas

- Dentro de um arquivo que **já referencia** o componente, um token `header` solto também é renomeado — fica visível na prévia para você desmarcar.
- Variantes BEM de CSS como `.header-title` não são renomeadas (decisão de segurança para não confundir com componentes irmãos como `app-header-icon`). A classe exata `.header` é renomeada normalmente.

## 📝 Licença

MIT © Danilo Agostinho

---

<sub>Ícone original inspirado no estilo visual do Angular. Não afiliado ao Google nem ao time do Angular. "Angular" é marca de seus respectivos donos.</sub>
