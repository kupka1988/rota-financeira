# REGRAS DE NEGOCIO - Rota Financeira

## Regras gerais
- O sistema possui abas: Dashboard, Trilha, Dividas, Em espera, Fora do radar, Renegociacao, Pagamentos, Historico, Configuracoes.
- Nao criar botoes sem implementacao.
- Antes de excluir, remover corretamente dados vinculados.

## Dashboard
- Deve usar dados reais do Firebase.
- Mostra grafico donut de percentual da divida ativa por credor.
- Mostra `Pressao financeira estrutural`.
- `Pressao financeira estrutural` considera apenas dividas ativas.
- Classificacao por parcelas restantes:
  - curto prazo: menor que 6.
  - medio prazo: 6 a 11.
  - longo prazo: 12 ou mais.

## Trilha
- Deve mostrar apenas dividas ativas.
- Nao mostrar dividas em espera.
- Permite ordenar a rota de quitacao.

## Dividas
- Mostra progresso em quantidade de parcelas, ex.: `2/12`.
- Possui acao `Criar Rolagem`.
- `Criar Rolagem` abre nova divida pre-preenchida.
- A data da rolagem avanca 1 mes.
- Todos os campos da rolagem continuam editaveis antes de salvar.
- Registrar pagamento abre modal na propria aba.
- Registrar pagamento nao redireciona para a aba Pagamentos.
- Apos salvar pagamento, manter a mesma divida expandida.
- Parcelas pagas possuem botao `Excluir pagamento`.
- Excluir pagamento abre modal de confirmacao.
- Ao excluir pagamento:
  - remover pagamento da lista Pagamentos.
  - voltar parcela para `Pendente`.
  - manter usuario na aba Dividas com a mesma divida aberta.

## Em espera
- Mostra dividas fora da frente atual.
- Mostra progresso em quantidade de parcelas, ex.: `2/12`.
- Dividas em espera nao entram na Trilha.

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
