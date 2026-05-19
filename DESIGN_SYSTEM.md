# DESIGN SYSTEM - Rota Financeira

## Direcao visual
- Financeiro, executivo e sobrio.
- Experiencia premium no notebook.
- Versao mobile muito boa para iPhone.
- Tema claro como padrao.
- Tema escuro opcional em Configuracoes.

## UX
- Nao usar `alert()` nem `confirm()`.
- Usar modal e toast proprios.
- Nao redirecionar o usuario sem necessidade.
- Preservar contexto do usuario em fluxos de pagamento e exclusao.
- Evitar textos tecnicos para usuario final.

## Layout
- Manter uso de espaco denso, organizado e escaneavel.
- Priorizar leitura clara de valores, status, progresso e proximas acoes.
- Evitar mudancas de identidade visual sem pedido explicito.

## Cards
- Cards de dividas podem usar cor de fundo por prioridade.
- Filtros selecionados precisam ter contraste no tema claro.
- Evitar excesso de negrito no layout.
- Cards devem manter progresso de parcelas visivel quando aplicavel.

## Modais
- Usar modal proprio para confirmacoes e edicoes.
- Edicao individual de parcelas ocorre em modal.
- Registro de pagamento ocorre em modal na aba Dividas.
- Exclusao de pagamento ocorre com modal de confirmacao.

## Botoes
- Acoes destrutivas devem usar tratamento visual de perigo.
- Botoes devem preservar fluxo e contexto quando possivel.

## Mobile
- Melhorar continuamente experiencia no iPhone.
- Prioridades atuais: cadastro de dividas e visualizacao de parcelas.
- Evitar sobreposicao de texto e controles.

## Assets
- Logo e favicon ficam em `assets`.
