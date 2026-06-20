# Changelog

Todas as mudanças relevantes do **Angular Rename Files** estão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.0.4] — 2026-06-20

### Mudança de marca
- A extensão passou a ser **Angular Rename Files**, focada na renomeação de componentes Angular (pasta, arquivos, classe, selector e imports). Novo ícone e textos em português do Brasil.

### Motor confiável (boundary-aware)
- Substituição por token **consciente de fronteiras**: renomeia `HeaderComponent`, `app-header`, `./header`, `.header`, mas **não** toca em `subHeader`, `headers`, `header-icon`, `header-utils` nem na palavra em prosa.
- Renomeação de arquivos só quando o arquivo é a unidade (`header.component.ts`), nunca `headerbar.component.ts`.
- Edição cross-file com *gate*: só altera arquivos que de fato importam o módulo ou usam o selector (resolve `imports: [HeaderComponent]`, `loadComponent`, rotas).
- Coberto por uma bateria de testes automatizados (`npm run test:unit`).

### UX
- Fluxo leve com **progressive disclosure**: ação principal em 1 clique + resumo de uma linha; detalhes item a item sob demanda.
- Prévia com **seleção por item** (desmarcar para pular).
- Progresso e confirmação de sucesso na **barra de status** (sem poluir a tela com popups).
- Tudo em **português do Brasil**.

### Correções
- Renomeação da pasta + arquivos + imports agora é aplicada de forma consistente e atômica (um Ctrl+Z desfaz tudo).

---

## [0.0.1] — 2026-04-02

### Adicionado
- Primeira versão: renomear pasta e arquivos correspondentes, atualizar imports e referências, com prévia.
