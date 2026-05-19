# CONTEXTO - Rota Financeira

Memoria compartilhada do projeto. Antes de iniciar qualquer trabalho, consultar os arquivos obrigatorios abaixo.

## Arquivos obrigatorios de consulta
- Sempre ler `CONTEXTO.md`.
- Sempre ler `REGRAS_NEGOCIO.md`.
- Ler `DESIGN_SYSTEM.md` quando mexer em visual, UX, layout, tema, cards, botoes ou mobile.
- Ler `ROADMAP.md` quando tratar de pendencias.
- Ler `CHANGELOG.md` apenas para historico.

## Projeto
- Nome: Rota Financeira.
- Objetivo: sistema web pessoal para gestao estrategica de dividas, pagamentos, prioridades e rota de quitacao.
- Publicacao: GitHub Pages.
- Repositorio GitHub: https://github.com/kupka1988/rota-financeira.git
- Branch principal: `main`.

## Stack atual
- HTML, CSS e JavaScript puro.
- Arquivos principais: `index.html`, `styles.css`, `app.js`.
- Firebase/Firestore ja conectado.
- Nao migrar para React, Angular ou Flutter por enquanto.

## Pastas locais
- Pasta principal OneDrive: `C:\Users\felipe.k\OneDrive\Documentos\14. Sistemas Kupka\Rota Financeira (Dívidas)`.
- Git local: a propria pasta OneDrive esta conectada ao remoto GitHub.
- Backups: `C:\Users\felipe.k\OneDrive\Documentos\14. Sistemas Kupka\Rota Financeira (Dívidas)\backups`.

## Premissas tecnicas
- Nunca limpar, sobrescrever ou recriar dados do Firebase.
- Toda alteracao deve ser incremental.
- Antes de mexer em exclusao, garantir remocao correta de dados vinculados.
- Nao misturar conceitos de outros projetos.
- Rota Financeira nao usa projecao, performance, metas de corrida/uber ou conceitos semelhantes.

## Comandos relevantes
- Validar sintaxe JS:
  `& 'C:\Program Files\nodejs\node.exe' -e "const fs=require('fs'); const s=fs.readFileSync('app.js','utf8').replace(/^\s*import\s+.*?;\s*$/gm,''); new Function(s); console.log('JS syntax ok');"`
- Ver status Git:
  `& 'C:\Program Files\Git\cmd\git.exe' status --short --branch`
- Ver ultimos commits:
  `& 'C:\Program Files\Git\cmd\git.exe' log --oneline -5`
- Push quando autorizado:
  `& 'C:\Program Files\Git\cmd\git.exe' push origin main`

## Fluxo de trabalho
1. Ler `CONTEXTO.md` e `REGRAS_NEGOCIO.md`.
2. Consultar os demais arquivos obrigatorios conforme a tarefa.
3. Fazer backup dos arquivos alterados na pasta `backups` quando a mudanca for relevante.
4. Trabalhar diretamente na pasta OneDrive.
5. Validar sintaxe quando mexer em JavaScript.
6. Revisar diff antes de commit.
7. Atualizar a documentacao adequada ao finalizar tarefas relevantes.
8. Commitar e dar push quando autorizado.
