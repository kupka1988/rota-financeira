# REGRAS DE NEGOCIO - Rota Financeira

## Regras gerais
- O sistema possui abas: Dashboard, Rota, Dividas Ativas, Em espera, Fora do radar, Quitadas, Renegociacao, Pagamentos, Historico, Configuracoes.
- Nao criar botoes sem implementacao.
- Antes de excluir, remover corretamente dados vinculados.

## Dashboard
- Deve usar dados reais do Firebase.
- Deve funcionar como tela estrategica e operacional, focada no que exige atencao agora.
- Proxima acao recomendada considera apenas parcelas pendentes de dividas `Ativa`.
- Proximos vencimentos, pressao financeira e frente de pagamento ignoram `Em espera` e `Fora do radar`.
- Pressao financeira considera apenas dividas ativas com saldo em aberto.
- Classificacao da pressao por meses para quitar:
  - curto prazo: ate 6 meses.
  - medio prazo: de 6 a 12 meses.
  - longo prazo: acima de 12 meses.
- Frente de pagamento ordena dividas ativas por prioridade estrategica considerando vencimento proximo, impacto mensal, saldo em aberto, oportunidade de quitacao, atraso e criticidade manual.
- Insights devem ser uteis para decisao; evitar graficos grandes que nao apoiem acao.

## Rota
- Funciona como visao estrategica da ordem de quitacao das dividas.
- Considera apenas dividas que passaram pela aba Dividas Ativas.
- Mostra dividas ativas e dividas quitadas.
- Nao mostra dividas em espera.
- Nao mostra dividas fora do radar.
- Dividas quitadas permanecem na rota como concluidas, preservando historico da jornada.
- Dividas quitadas ficam sempre no final da rota.
- Dividas quitadas nao podem ser reordenadas por drag and drop nem pelos botoes subir/descer.
- Permite ordenar a rota de quitacao por prioridade manual.
- Preferencia de ordenacao: drag and drop.
- Fallback de ordenacao: botoes discretos de subir/descer.
- Ordem deve ser salva no Firebase em `payoffOrder`.
- Novas dividas ativas entram no final da rota.
- Dividas movidas de `Em espera` ou `Fora do radar` para `Ativa` entram no final das ativas, antes das quitadas.

## Dividas Ativas
- Mostra progresso em quantidade de parcelas, ex.: `2/12`.
- Registrar pagamento abre modal na propria aba.
- Registrar pagamento nao redireciona para a aba Pagamentos.
- Apos salvar pagamento, manter a mesma divida expandida.
- Parcelas pagas possuem botao `Excluir pagamento`.
- Excluir pagamento abre modal de confirmacao.
- Ao excluir pagamento:
  - remover pagamento da lista Pagamentos.
  - voltar parcela para `Pendente`.
  - manter usuario na aba Dividas Ativas com a mesma divida aberta.
- A expansao de divida deve valer do mesmo modo em Dividas Ativas, Em espera, Fora do radar e Quitadas.
- A expansao deve ter cabecalho compacto com criada em, tipo, parcelas pagas, proximo vencimento e um unico botao `Acoes` no topo direito.
- Nao repetir na expansao saldo, parcela, progresso e proxima parcela ja exibidos no card fechado, exceto em resumo lateral compacto quando necessario.
- Nao exibir botao `Acoes` no rodape da expansao.
- Nao exibir cards ou frases de dica, quitacao antecipada ou textos motivacionais dentro da expansao.
- Parcelas na expansao usam abas: `Pendentes` como padrao e `Pagas` como segunda aba.
- Aba `Pendentes` mostra as proximas 5 parcelas pendentes e botao `Ver todas as parcelas pendentes`.
- Aba `Pagas` mostra as ultimas 5 parcelas pagas e botao `Ver historico completo`.
- Menu `Acoes` deve mostrar apenas acoes validas para o status atual e nunca deve mostrar acao para mover para o proprio status.
- Para `Ativa`, acoes validas: mover para Em espera, mover para Fora do radar, quitar divida, editar divida e excluir divida.
- Para `Em espera`, acoes validas: mover para Dividas Ativas, mover para Fora do radar, quitar divida, editar divida e excluir divida.
- Para `Fora do radar`, acoes validas: mover para Dividas Ativas, mover para Em espera, quitar divida, editar divida e excluir divida.
- Para `Quitada`, acoes validas: restaurar para Dividas Ativas, restaurar para Em espera, restaurar para Fora do radar, editar divida e excluir divida.
- `Quitar divida` abre modal proprio com valor de quitacao, data do pagamento, forma de pagamento opcional, observacao opcional e resumo da quitacao.
- Calculo da quitacao: desconto = valor total previsto restante - valor pago na quitacao.
- Ao confirmar quitacao, registrar pagamento de quitacao, encerrar parcelas futuras, mover divida para Quitadas, manter divida na Rota como concluida e deixar progresso em 100%.

## Em espera
- Mostra dividas fora da frente atual.
- Mostra progresso em quantidade de parcelas, ex.: `2/12`.
- Dividas em espera nao entram na Rota.

## Quitadas
- Mostra dividas sem parcelas abertas.
- Nao entra no Dashboard, Renegociacao ou divida total reconhecida.
- Permanece na Rota como item concluido quando tiver passado pela frente de Dividas Ativas.

## Fora do radar
- Status para dividas reconhecidas que nao entram no Dashboard.
- Nao entram na divida total reconhecida.
- Aba propria possui totalizadores.

## Renegociacao
- Lista dividas ativas e em espera com checkbox.
- Ao salvar novo acordo:
  - cria uma nova divida ativa.
  - muda as antigas para status `Renegociada`.
  - preserva pagamentos.
  - move a leitura das antigas para Historico.

## Pagamentos
- Lista pagamentos registrados a partir das parcelas.
- Pagamento excluido deve sair desta lista.

## Historico
- Deve mostrar dividas renegociadas e fechamentos mensais.

## Configuracoes
- Deve ser tela geral de parametros.
- Credores sao apenas uma secao dentro de Configuracoes.
- Tema claro/escuro fica em Configuracoes.
- Tema claro e padrao quando nao houver preferencia salva no navegador.

## Parcelas
- Podem ser editadas individualmente por modal proprio.
- Status esperado: `Pendente`, `Paga`, `Renegociada`.
