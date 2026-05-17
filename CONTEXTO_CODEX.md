# CONTEXTO_CODEX - Rota Financeira

Arquivo de memoria compartilhada do projeto. Antes de iniciar qualquer trabalho, ler este arquivo e usar como contexto principal. Ao finalizar tarefas, atualizar de forma breve.

## Projeto
- Nome: Rota Financeira.
- Objetivo: sistema web pessoal para gestao estrategica de dividas, pagamentos, prioridades e rota de quitacao.
- Foco de UX: experiencia premium no notebook, com versao mobile muito boa para iPhone.
- Visual: financeiro, executivo, sobrio; tema claro como padrao e tema escuro opcional em Configuracoes.

## Stack Atual
- HTML, CSS e JavaScript puro.
- Arquivos principais: `index.html`, `styles.css`, `app.js`.
- Firebase/Firestore ja conectado.
- Publicacao via GitHub Pages.
- Nao migrar para React, Angular ou Flutter por enquanto.

## Pastas Locais
- Pasta principal OneDrive: `C:\Users\felip\OneDrive\Documentos\14. Sistemas Kupka\Rota Financeira (Dívidas)`.
- Clone Git local: `C:\Users\felip\Documents\Codex\2026-05-17\rota-financeira-meu-novo-projeto\github-rota-financeira`.
- Backups ficam em: `C:\Users\felip\OneDrive\Documentos\14. Sistemas Kupka\Rota Financeira (Dívidas)\backups`.

## Regras Permanentes
- Nunca limpar, sobrescrever ou recriar dados do Firebase.
- Toda alteracao deve ser incremental.
- Antes de mexer em exclusao, garantir remocao correta de dados vinculados.
- Nao usar `alert()` nem `confirm()`; usar modal/toast proprio.
- Nao usar textos tecnicos para usuario como Firestore, mock, debug ou implementacao futura.
- Nao criar botoes sem implementacao.
- Dashboard deve usar dados reais do Firebase.
- Nao misturar conceitos de outros projetos. Rota Financeira nao usa projecao, performance, metas de corrida/uber ou conceitos semelhantes.
- Sempre atualizar este arquivo ao iniciar/finalizar tarefas relevantes.

## Estado Atual Importante
- Commit remoto mais recente conhecido: `22f9aed` (`Corrige rota financeira sem projecoes`).
- Antes dele houve rollback do commit ruim: `a54ae5e` (`Revert "Evolui branding dashboard e trilha financeira"`).
- O sistema possui abas: Dashboard, Trilha, Dividas, Em espera, Pagamentos, Historico, Configuracoes.
- Trilha deve mostrar apenas dividas ativas, sem dividas em espera.
- Dividas e Em espera mostram progresso tambem em quantidade de parcelas, ex.: `2/12`.
- Dashboard tem grafico donut de percentual da divida ativa por credor.
- Dividas possuem acao `Criar Rolagem`, que abre uma nova divida pre-preenchida, com data avancada em 1 mes e tudo editavel antes de salvar.
- Parcelas podem ser editadas individualmente por modal proprio.
- Configuracoes deve ser uma tela geral de parametros; credores sao apenas uma secao dentro dela.
- Tema Claro/Escuro fica em Configuracoes e deve afetar o sistema inteiro. Claro e o padrao quando nao houver preferencia salva no navegador.
- Logo e favicon estao em `assets`.

## Comandos Relevantes
- Validar sintaxe JS:
  `& 'C:\Users\felip\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' -e "const fs=require('fs'); const s=fs.readFileSync('app.js','utf8').replace(/^\s*import\s+.*?;\s*$/gm,''); new Function(s); console.log('JS syntax ok');"`
- Ver status Git:
  `git status --short`
- Ver ultimos commits:
  `git log --oneline -5`
- Push autorizado nesta sessao quando a tarefa pedir publicacao:
  `git push origin main`

## Fluxo De Trabalho
1. Ler `CONTEXTO_CODEX.md`.
2. Fazer backup dos arquivos alterados na pasta `backups` quando a mudanca for relevante.
3. Trabalhar primeiro na pasta OneDrive quando o usuario pedir que os arquivos fiquem la.
4. Sincronizar alteracoes para o clone Git.
5. Validar sintaxe e revisar diff.
6. Commitar e dar push quando autorizado.
7. Atualizar este arquivo com resumo, pendencias e proximos passos.

## Pendencias / Proximos Passos
- Melhorar continuamente mobile no iPhone, especialmente cadastro de dividas e visualizacao de parcelas.
- Revisar experiencia da tela Configuracoes como painel de parametros, mantendo credores organizado como secao.
- Futuramente avaliar separacao dos arquivos JS/CSS por modulo sem trocar a stack.
- Futuramente revisar regras de seguranca do Firebase e autenticacao.
- Futuramente transformar em PWA, sem quebrar sincronizacao atual.

## Historico Recente
- 2026-05-17: criado este arquivo de contexto como regra permanente do projeto.
- 2026-05-17: tema claro definido como padrao; filtros selecionados ajustados para contraste; cards de dividas ganharam cor de fundo por prioridade.
