# REGRAS DE NEGOCIO - Rota Financeira

## Regras gerais
- O sistema possui abas principais: Dashboard, Rota Financeira, Em espera, Fora do radar, Quitadas, Renegociacao e Preferencias.
- Pagamentos e historico mensal nao sao abas principais. Pagamentos permanecem como dados internos para saldo, parcelas, quitacao, exclusao de pagamento e exportacao.
- Nao criar botoes sem implementacao.
- Antes de excluir, remover corretamente dados vinculados.
- O produto deve priorizar decisao e proxima acao, nao relatorio ou memoria emocional.

## Dashboard
- Deve usar dados reais do Firebase.
- Deve funcionar como tela estrategica e operacional, focada no que exige atencao agora.
- Proxima acao recomendada considera apenas parcelas pendentes de dividas `Ativa`.
- Proximos vencimentos, pressao financeira e frente de pagamento ignoram `Em espera`, `Fora do radar`, `Quitada` e `Renegociada`.
- Pressao financeira considera apenas dividas ativas com saldo em aberto.
- Classificacao da pressao por meses para quitar:
  - curto prazo: ate 6 meses.
  - medio prazo: de 6 a 12 meses.
  - longo prazo: acima de 12 meses.
- Frente de pagamento ordena dividas ativas por prioridade estrategica considerando vencimento proximo, impacto mensal, saldo em aberto, oportunidade de quitacao, atraso e criticidade manual.
- Insights devem ser uteis para decisao; evitar graficos grandes que nao apoiem acao.
- Dashboard nao deve listar ou celebrar dividas quitadas. O alivio vem delas sairem da frente visual.
- Cards superiores devem manter alturas uniformes.
- Pressao financeira deve ser compacta e ocupar apenas o espaco necessario para decisao.

## Rota Financeira
- Funciona como tela principal das dividas ativas e priorizadas.
- Nao usar `Dividas` ou `Dividas Ativas` como nome de aba principal.
- Usar `Rota Financeira` como referencia para dividas ativas e priorizadas.
- Mostra apenas dividas `Ativa`.
- Nao mostra dividas em espera, fora do radar, quitadas ou renegociadas.
- Dividas quitadas saem da Rota Financeira e aparecem apenas em Quitadas.
- Permite ordenar a rota de quitacao por prioridade manual.
- Preferencia de ordenacao: drag and drop.
- Fallback de ordenacao: botoes discretos de subir/descer.
- Ordem deve ser salva no Firebase em `payoffOrder`.
- Novas dividas ativas entram no final da Rota Financeira.
- Dividas movidas de `Em espera`, `Fora do radar` ou `Quitada` para `Ativa` entram no final da frente ativa.

## Lista e expansao de dividas
- A expansao de divida deve funcionar na Rota Financeira, Em espera, Fora do radar e Quitadas.
- Mostra progresso em quantidade de parcelas, ex.: `2/12`.
- Registrar pagamento abre modal na propria aba.
- Registrar pagamento nao redireciona o usuario para outra aba.
- Apos salvar pagamento, manter a mesma divida expandida quando ela ainda estiver na tela atual.
- Cadastro e edicao de divida devem abrir em modal, sem formulario inline acima das listas.
- No cadastro de divida, credores devem aparecer em ordem alfabetica.
- Parcelas pagas possuem botao `Excluir pagamento`.
- Excluir pagamento abre modal de confirmacao.
- Ao excluir pagamento:
  - remover o registro da colecao de pagamentos.
  - voltar parcela para `Pendente`.
  - manter usuario na tela atual com a mesma divida aberta quando aplicavel.
- A expansao deve ter cabecalho compacto com criada em, tipo, parcelas pagas, proximo vencimento e um unico botao `Acoes` no topo direito.
- Nao repetir na expansao saldo, parcela, progresso e proxima parcela ja exibidos no card fechado, exceto em resumo lateral compacto quando necessario.
- Nao exibir botao `Acoes` no rodape da expansao.
- Nao exibir cards ou frases de dica, quitacao antecipada ou textos motivacionais dentro da expansao.
- Parcelas na expansao usam abas: `Pendentes` como padrao e `Pagas` como segunda aba.
- Aba `Pendentes` mostra as proximas 5 parcelas pendentes e botao `Ver todas as parcelas pendentes`.
- Aba `Pagas` mostra as ultimas 5 parcelas pagas e botao `Ver parcelas pagas`.
- Menu `Acoes` deve mostrar apenas acoes validas para o status atual e nunca deve mostrar acao para mover para o proprio status.
- Para `Ativa`, acoes validas: mover para Em espera, mover para Fora do radar, quitar divida, editar divida e excluir divida.
- Para `Em espera`, acoes validas: mover para Rota Financeira, mover para Fora do radar, quitar divida, editar divida e excluir divida.
- Para `Fora do radar`, acoes validas: mover para Rota Financeira, mover para Em espera, quitar divida, editar divida e excluir divida.
- Para `Quitada`, acoes validas: restaurar para Rota Financeira, restaurar para Em espera, restaurar para Fora do radar, editar divida e excluir divida.
- `Quitar divida` abre modal proprio com valor de quitacao, data do pagamento, forma de pagamento opcional, observacao opcional e resumo da quitacao.
- Calculo da quitacao: desconto = valor total previsto restante - valor pago na quitacao.
- Ao confirmar quitacao, registrar pagamento de quitacao, encerrar parcelas futuras, mover divida para Quitadas e remover da Rota Financeira.

## Em espera
- Mostra dividas reconhecidas que estao fora da frente atual.
- Mostra progresso em quantidade de parcelas, ex.: `2/12`.
- Dividas em espera nao entram na Rota Financeira nem no Dashboard.

## Fora do radar
- Status para dividas reconhecidas que o usuario decidiu nao acompanhar na frente atual.
- Nao entram no Dashboard.
- Nao entram na divida em aberto reconhecida do Dashboard.
- Aba propria possui totalizadores.
- Usa o mesmo grid operacional, com painel, filtro por credor, ordenacao e reordenacao manual.

## Quitadas
- Funciona como arquivo discreto de dividas encerradas.
- Mostra dividas sem parcelas abertas.
- Nao entra no Dashboard, Renegociacao ou Rota Financeira.
- Usa o mesmo grid operacional, com painel, filtro por credor e ordenacao.
- Deve ter linguagem de arquivo, nao de celebracao constante.

## Renegociacao
- Lista dividas ativas e em espera com checkbox.
- Ao salvar novo acordo:
  - cria uma nova divida ativa.
  - muda as antigas para status `Renegociada`.
  - preserva pagamentos.
  - arquiva a leitura das antigas dentro da tela Renegociacao.

## Preferencias
- Deve ser tela geral de parametros.
- Credores sao apenas uma secao dentro de Preferencias.
- Tema claro/escuro fica em Preferencias.
- Tema claro e padrao quando nao houver preferencia salva no navegador.
- Exportar CSV pagamentos permanece em Preferencias > Dados, mesmo sem aba Pagamentos.

## Parcelas
- Podem ser editadas individualmente por modal proprio.
- Status esperado: `Pendente`, `Paga`, `Renegociada`, `Quitada`.
