================================================================================
PROJETO SHOCK IMPORTS — DOCUMENTAÇÃO COMPLETA
Catálogo Online + Bot de Atendimento WhatsApp
Última atualização: 22/09/2026
================================================================================


================================================================================
1. VISÃO GERAL
================================================================================

O projeto Shock Imports é um ecossistema completo para automatizar o catálogo
de produtos e o atendimento ao cliente via WhatsApp. Ele é dividido em três
partes principais que trabalham juntas:

1.1. PIPELINE DE CATÁLOGO (roda no servidor BitServer)
     - Processa os dados brutos (planilha XLSX e imagens)
     - Gera o site estático (Astro) e o arquivo JSON de produtos
     - Fluxo: XLSX + Imagens -> Scripts Node.js -> Site + produtos.json

1.2. SITE DO CATÁLOGO (hospedado no GitHub Pages)
     - Serve o catálogo público para clientes
     - Tem busca, filtros por categoria, cards com preço e quantidade por caixa
     - Botões para baixar PDFs (completo e por categoria)
     - Lightbox: clicar na imagem do produto abre em tela cheia
     - Botão de copiar código: copia o código do produto com um toque
     - Publicado automaticamente pelo GitHub Actions a cada push

1.3. BOT DE ATENDIMENTO (roda no servidor BitServer)
     - Atende clientes no WhatsApp em nome da "equipe Shock Imports"
     - Usa IA (DeepSeek) para responder perguntas de forma natural
     - Consulta o catálogo, calcula pedidos, envia fotos
     - Transfere para vendedoras humanas quando necessário
     - Notifica vendedoras via WhatsApp automaticamente


================================================================================
2. INFRAESTRUTURA E ACESSOS
================================================================================

2.1. SERVIDOR PRINCIPAL (BitServer)
     - Hardware: Intel i5-3470 @ 3.20GHz, 7.7 GB RAM, 456 GB Disco
     - Sistema: Debian GNU/Linux 12 (bookworm)
     - Kernel: 6.1.0-53-amd64
     - IP Local: 192.168.18.51
     - IP Tailscale: 100.127.174.28
     - Usuário: monster
     - Home: /home/monster
     - Acesso: ssh monster@100.127.174.28

2.2. RASPBERRY PI (aurora2d) — legado, ainda usado para bot do pai
     - Modelo: Raspberry Pi 3 Model B
     - Sistema: Debian GNU/Linux 13 (trixie), 64-bit
     - IP Tailscale: 100.109.227.113
     - Usuário: bit
     - Home: /home/bit
     - Contém: bot-whatsapp (bot antigo do pai), shock-catalogo.velho

2.3. PC DA EMPRESA (Windows)
     - IP Tailscale: 100.65.12.54
     - Hostname: shockimports
     - Usuário: Paula
     - Pasta de fotos: X:\Marketing\Shock Imports\Fotos Fundo Branco (com Medidas)
     - rclone instalado em: C:\rclone\rclone.exe

2.4. REPOSITÓRIO GITHUB
     - URL: https://github.com/BitMonster04/Shockimports
     - Site público: https://bitmonster04.github.io/Shockimports/
     - Branch principal: main

2.5. APIS E SERVIÇOS
     - IA do Bot: DeepSeek API (deepseek-chat)
       - Custo: ~R$ 0,01 por sessão de teste
       - Crédito atual: ~$1,99 USD (cobre meses de uso)
     - WhatsApp: Biblioteca Baileys (não-oficial)
       - Risco de banimento mitigado pelo baileys-antiban
     - Anthropic API: NÃO USAR MAIS (saldo $4,88 parado, auto-reload OFF)
     - Ollama: REMOVIDO do servidor


================================================================================
3. ESTRUTURA DE PASTAS
================================================================================

3.1. PIPELINE DO CATÁLOGO
     Caminho: /home/monster/shock-catalogo/

     shock-catalogo/
     ├── package.json
     ├── config.js
     ├── astro.config.mjs
     ├── .gitignore
     ├── DOCUMENTACAO.md                (este arquivo)
     ├── .github/
     │   └── workflows/
     │       └── deploy.yml              (workflow do GitHub Actions)
     ├── dados/
     │   ├── Catalogo - Shock Imports Comercial Ltda.xlsx
     │   └── imagens_originais/          (fotos .jpg / .png originais do marketing)
     ├── scripts/
     │   ├── 00-verificar-ambiente.js
     │   ├── 01-importar-xlsx.js
     │   ├── 02-casar-imagens.js
     │   ├── 03-otimizar-imagens.js
     │   ├── 04-gerar-json.js
     │   ├── 05-gerar-pdfs.js
     │   └── atualizar-tudo.js           (esqueleto, nao implementado)
     ├── banco/
     │   └── catalogo.db                 (SQLite)
     ├── public/
     │   ├── Logo Shock Imports.png
     │   ├── dados/
     │   │   └── produtos.json           (JSON consumido pelo site e bot)
     │   ├── img/produtos/               (imagens WebP otimizadas 800px)
     │   └── pdf/                        (PDFs gerados - gitignore)
     ├── src/
     │   ├── layouts/Base.astro
     │   ├── pages/index.astro
     │   └── styles/global.css
     ├── relatorios/
     └── logs/

3.2. BOT DE ATENDIMENTO
     Caminho: /home/monster/bot-ia/

     bot-ia/
     ├── .env                    (CHAVES E CONFIG — NUNCA COMMITAR)
     ├── .env.example            (modelo das variáveis)
     ├── .gitignore              (protege auth/, memoria.db, .env)
     ├── package.json
     ├── package-lock.json
     ├── regras.md               (CORAÇÃO DO BOT — editável sem mexer em código)
     ├── catalogo.mjs            (lê produtos.json, busca, calcula)
     ├── cerebro.mjs             (orquestra IA + ferramentas + memória)
     ├── notificar.mjs           (notifica vendedoras via WhatsApp)
     ├── whatsapp.mjs            (conexão Baileys + baileys-antiban)
     ├── chat.mjs                (modo terminal para testes)
     ├── memoria.db              (histórico de conversas por cliente)
     └── node_modules/


================================================================================
4. DEPENDÊNCIAS (package.json do bot-ia)
================================================================================

{
  "name": "bot-ia",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "chat": "node --env-file=.env chat.mjs",
    "start": "node --env-file=.env whatsapp.mjs"
  },
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.0",   (conexão WhatsApp)
    "baileys-antiban": "^1.0.0",           (rate limit, warmup, delay)
    "better-sqlite3": "^13.0.3",           (memória)
    "openai": "^4.0.0",                    (SDK para DeepSeek)
    "pino": "^9.0.0",                      (logger)
    "qrcode-terminal": "^0.12.0"           (QR code no terminal)
  }
}


================================================================================
5. PIPELINE DO CATÁLOGO — SCRIPTS
================================================================================

5.1. 00-verificar-ambiente.js
     - Confere Node, RAM, disco, XLSX, fotos e pastas
     - Rápido (segundos)

5.2. 01-importar-xlsx.js
     - Localiza o XLSX em dados/
     - Detecta automaticamente a linha do cabeçalho
     - Mapeia colunas POR NOME (aceita ordem diferente)
     - Colunas usadas: id, nome, codigo, ativo, preco, categoria,
                       frase_adicional (qtde_caixa), descricao, ean
     - Extrai qtde_caixa de "Qtde: 48 /CX" via regex
     - Normaliza códigos (maiúsculo, trim)
     - Faz upsert no SQLite

5.3. 02-casar-imagens.js
     - Lê produtos do banco
     - Escaneia dados/imagens_originais/
     - Casa por código normalizado
     - Gera relatórios (sem-foto, orfas)

5.4. 03-otimizar-imagens.js
     - Converte para WebP 800px, qualidade 82
     - Cache por hash: pula o que não mudou
     - Substitui as WebP antigas (600px/80) geradas no Raspberry Pi

5.5. 04-gerar-json.js
     - Lê produtos ativos COM foto
     - Inclui: id, codigo, nome, categoria, preco, qtdeCaixa, ean, imagem
     - Gera public/dados/produtos.json

5.6. 05-gerar-pdfs.js
     - Gera 1 PDF completo + 1 PDF por categoria
     - Capa com logo, grade de 6 produtos por página
     - Cada produto: foto, código, nome, preço, qtde/cx, EAN
     - Converte WebP -> JPEG em memória (PDFKit não lê WebP)

5.7. atualizar-tudo.js (esqueleto — não implementado)
     - Detecta mudanças e roda o pipeline inteiro


================================================================================
6. SITE DO CATÁLOGO
================================================================================

6.1. FUNCIONALIDADES
     - Header com logo, busca em tempo real
     - Chips de categorias roláveis
     - Grid responsivo de cards (2 colunas no celular)
     - Cada card: foto, código, nome, preço, qtde/cx
     - Lightbox: clicar na imagem abre em tela cheia
       (fecha com X, clique fora, ou tecla Esc)
     - Botão de copiar código: um toque copia o código do produto
       (feedback visual "Copiado!" por 1,5s)
     - Botão "Baixar PDF" (baixa da categoria atual ou completo)
     - Botão "Compartilhar" (usa navigator.share do celular)

6.2. CORES DA MARCA
     - Laranja principal:  #F2720C
     - Laranja escuro:     #C85300
     - Cinza escuro:       #232323
     - Cinza médio:        #8C8D91
     - Branco:             #FFFFFF

6.3. URL PÚBLICA
     https://bitmonster04.github.io/Shockimports/

6.4. PARÂMETROS DE IMAGEM
     - Largura máxima: 800px
     - Qualidade WebP: 82
     - Formato: WebP
     - Origem: dados/imagens_originais/ (alta resolução)
     - Destino: public/img/produtos/


================================================================================
7. BOT DE ATENDIMENTO — ARQUITETURA
================================================================================

7.1. FLUXO DE UMA MENSAGEM

     Cliente manda mensagem no WhatsApp
              ↓
     whatsapp.mjs recebe (Baileys + antiban)
              ↓
     cerebro.mjs processa:
       - Grava turno no SQLite
       - Monta prompt (regras.md + histórico)
       - Envia para DeepSeek com 4 ferramentas
              ↓
     DeepSeek decide:
       - Responder direto
       - OU chamar ferramenta (buscar_produtos, calcular_pedido,
         enviar_foto, chamar_atendente)
              ↓
     cerebro.mjs executa a ferramenta e devolve resultado
              ↓
     DeepSeek escreve a resposta final
              ↓
     whatsapp.mjs envia resposta (e foto, se houver)
              ↓
     Se chamou atendente: notificar.mjs avisa as vendedoras


7.2. FERRAMENTAS DA IA
     - buscar_produtos(consulta, categoria?, limite?)
       Busca no catálogo por nome, código ou categoria.

     - calcular_pedido(itens: [{codigo, caixas}])
       Calcula valorPorCaixa (preco * unidadesPorCaixa) e total.
       Verifica se atinge o pedido mínimo de R$ 3.000.

     - enviar_foto(codigo)
       Marca a foto para envio. O whatsapp.mjs lê a WebP e envia.

     - chamar_atendente(motivo)
       Notifica as vendedoras via WhatsApp e marca alerta.


7.3. MEMÓRIA (SQLite)
     Arquivo: memoria.db
     Tabela: turnos
       id | cliente_id | papel | conteudo | criado_em
     Histórico lido: últimas 10 mensagens por cliente.


7.4. NOTIFICAÇÃO DE VENDEDORAS
     - notificar.mjs lê a lista de VENDEDORAS_NUMEROS do .env
     - Envia uma mensagem formatada para cada vendedora:

       🚨 NOVO ATENDIMENTO PRIORITÁRIO

       Motivo: <motivo>
       Cliente: <jid do cliente>
       Registrado em: <data/hora>

       Responda diretamente pelo WhatsApp do cliente.


7.5. ANTIBAN (baileys-antiban)
     - Delay humanizado com jitter
     - Rate limiting (máx 8 msg/min, 200/hr)
     - Warm-up de 7 dias para número novo
     - Circadian rhythm (mais lento de madrugada)
     - Proxy rotation (opcional)

     Uso: wrapSocket(sock) envolve o socket do Baileys e todas as
     chamadas sendMessage passam pelo antiban automaticamente.


================================================================================
8. REGRAS DE NEGÓCIO (regras.md)
================================================================================

O arquivo regras.md é lido pela IA antes de CADA resposta. Editar nele muda
o comportamento do bot IMEDIATAMENTE, sem reiniciar nada.

8.1. SOBRE A EMPRESA
     - Importadora, venda direta para revendedores (atacado).
     - Só vendemos caixa fechada. Pedido mínimo: R$ 3.000.
     - Pagamento somente à vista, com nota A ou B.
     - Entrega em 2 a 5 dias úteis, dependendo da região.
     - Catálogo: https://bitmonster04.github.io/Shockimports/

8.2. O QUE O BOT SABE
     - Link do catálogo
     - Regras de caixa fechada e pedido mínimo
     - Prazo de entrega (2 a 5 dias úteis)
     - Pagamento à vista, nota A ou B
     - Preço por unidade; valor da caixa = preço * unidades por caixa

8.3. O QUE O BOT NÃO SABE (NUNCA INVENTAR)
     - Estoque e disponibilidade de produtos
     - Prazo exato para uma cidade específica
     - Valor de frete
     - Descontos e condições especiais
     - Endereço físico da loja
     - PROMOÇÕES (a regra atual diz para informar que não tem
       essa informação e oferecer chamar uma vendedora)
     - Qualquer produto fora do catálogo

8.4. QUANDO CHAMAR VENDEDORA HUMANA
     - Cliente pediu pra falar com humano
     - Cliente demonstrou intenção de compra ("quero", "vou levar",
       "fechar pedido")
     - Cliente perguntou sobre promoção, desconto, oferta especial
     - Cliente perguntou sobre estoque, frete, prazo específico
     - Bot não tem certeza da resposta
     - Qualquer coisa fora das regras

8.5. ESTILO DE ESCRITA
     - Português informal, acolhedor, sem pressa
     - Frases curtas, uma ideia por linha
     - Sem markdown (sem *, #, listas com traço)
     - Máximo 1 emoji por mensagem
     - Uma pergunta por mensagem
     - Nunca usar "senhor/senhora" — usar "você"
     - NUNCA se identificar como IA, bot, robô, assistente ou chatbot
     - Falar em nome da "equipe Shock Imports"

8.6. EXEMPLOS DE CONVERSA (few-shot)
     O regras.md contém 15 exemplos de conversa que a IA imita:
     saudação, catálogo, preço, pagamento, prazo, atacado, fechar pedido,
     foto, pergunta fora das regras, reclamação, "é bot?", despedida,
     pedido mínimo, localização, produto inexistente.


================================================================================
9. CONFIGURAÇÃO (.env do bot-ia)
================================================================================

# DeepSeek (IA)
DEEPSEEK_API_KEY=sk-...              (CHAVE — nunca compartilhar)
DEEPSEEK_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# Catálogo
CATALOGO_JSON=/home/monster/shock-catalogo/public/dados/produtos.json
CATALOGO_IMG_DIR=/home/monster/shock-catalogo/public/img/produtos
CATALOGO_URL=https://bitmonster04.github.io/Shockimports/
PEDIDO_MINIMO=3000

# Delay (não está sendo usado atualmente)
DELAY_MIN_SIMPLES=20
DELAY_MAX_SIMPLES=50

# Notificação de vendedoras (lista separada por vírgula)
VENDEDORAS_NUMEROS=55119951581206,55119914959342,55119973748276
NOTIFICAR_ATIVO=true

# Memória
MEMORIA_DB=./memoria.db


================================================================================
10. SINCRONIA DE IMAGENS (rclone)
================================================================================

10.1. VISÃO GERAL
      As fotos originais ficam no PC da empresa (pasta de rede X:).
      O rclone copia automaticamente pro BitServer.

10.2. CONFIGURAÇÃO
      - rclone: C:\rclone\rclone.exe
      - Remote: [bitserver] -> SSH para monster@100.127.174.28
      - Chave SSH: C:\Users\Paula\.ssh\rclone_shock
      - Script: C:\rclone\sincronizar-imagens.bat
      - Log: C:\rclone\sincronia.log

10.3. FILTROS
      - Só imagens: *.png, *.jpg, *.jpeg, *.jfif
      - Ignora arquivos com sufixo tipo "(1)", "(2)": --exclude "*(*)*"
      - Modo copy (nunca apaga do destino)
      - 4 transfers paralelos, 8 checkers

10.4. HISTÓRICO
      - Primeira cópia completa: 1339 arquivos, 2,4 GB, 12min18s
      - As imagens originais SUBSTITUÍRAM as versões de baixa
        resolução geradas no Raspberry Pi (que eram 600px/JPG)


================================================================================
11. ESTADO ATUAL (22/09/2026)
================================================================================

11.1. O QUE ESTÁ FUNCIONANDO

      ✅ Pipeline de catálogo completo no BitServer
      ✅ Site do catálogo no ar em bitmonster04.github.io/Shockimports/
      ✅ Bot de atendimento RODANDO em produção no WhatsApp da loja
      ✅ IA DeepSeek respondendo de forma natural
      ✅ 4 ferramentas funcionando (buscar, calcular, enviar foto, chamar)
      ✅ Notificação para MÚLTIPLAS vendedoras via WhatsApp
      ✅ baileys-antiban instalado e ativo (rate limit, delay, warmup)
      ✅ Imagens em alta resolução (originais) no servidor
      ✅ Pipeline gerando WebP 800px qualidade 82
      ✅ Lightbox de imagem no site (clique abre tela cheia)
      ✅ Botão de copiar código do produto no site
      ✅ Sincronia manual de imagens via rclone funcionando

11.2. O QUE ESTÁ EM ANDAMENTO

      🚧 Automação da sincronia de imagens via Agendador do Windows:
         - Script .bat já criado e testado
         - Falta criar a tarefa agendada (a cada 5 min, seg-sex, 8h-19h)

11.3. PENDÊNCIAS CONHECIDAS

      - PDFs estão pesados (catálogo completo ~25 MB)
        * Futuro: reduzir qualidade das imagens nos PDFs
      - 53 produtos ativos sem foto (apareceriam no catálogo)
      - 35 fotos órfãs (sem produto correspondente no banco)


================================================================================
12. PRÓXIMOS PASSOS
================================================================================

12.1. CONCLUIR A AUTOMAÇÃO COM RCLONE (curto prazo)

      Criar tarefa no Agendador de Tarefas do Windows:
        - Nome: "Sincronia de Imagens Shock Imports"
        - Disparo: a cada 5 minutos, seg-sex, das 8h às 19h
        - Ação: executar C:\rclone\sincronizar-imagens.bat

12.2. MELHORIAS NO PIPELINE DE CATÁLOGO

     - Aproveitar colunas novas da planilha:
       * novidade (0/1) — marcar produtos como novidade
       * destaque (0/1) — destacar produtos na vitrine
       * preco_promocional — preço real de promoção por produto
     - Atualizar Script 01, 04 e index.astro pra incluir esses campos
     - NÃO usar o campo "estoque" (inconsistente na planilha)

12.3. MELHORIAS NO BOT DE ATENDIMENTO

     - Monitoramento: logs persistentes de erros e consumo
     - Serviço systemd: rodar o bot em background, reiniciar se cair
     - Feedback loop: revisar conversas ruins, adicionar exemplos no
       regras.md para "treinar" a IA
     - Suporte a áudio/imagem recebidos (hoje só texto)

12.4. SEGURANÇA E INFRAESTRUTURA

     - API Oficial do WhatsApp (Cloud API) para eliminar risco de ban
     - Migração para servidor da empresa (quando a chefia aprovar)
     - Ativar alerta de saldo no DeepSeek (em $0,50)
     - Considerar proxy residencial para o bot (se o risco aumentar)


================================================================================
13. COMANDOS ÚTEIS
================================================================================

13.1. CONECTAR NO SERVIDOR
      ssh monster@100.127.174.28

13.2. IMPORTANTE: PATH DO NPM VIA SSH NÃO-INTERATIVO
      Quando você roda um comando via SSH sem abrir sessão interativa,
      o bash não carrega o nvm. Use SEMPRE este prefixo:

      export PATH=/home/monster/.nvm/versions/node/v22.23.2/bin:/bin:/usr/bin:/usr/local/bin:$PATH

      Exemplo:
      ssh monster@100.127.174.28 "export PATH=/home/monster/.nvm/versions/node/v22.23.2/bin:/bin:/usr/bin:/usr/local/bin:\$PATH && cd /home/monster/shock-catalogo && npm run importar"

13.3. RODAR O PIPELINE DE CATÁLOGO (dentro do servidor)
      cd ~/shock-catalogo
      npm run verificar
      npm run importar
      npm run casar
      npm run otimizar
      npm run json
      npm run pdf
      npx astro build
      git add public/img/produtos/ public/dados/produtos.json
      git commit -m "Atualiza catalogo"
      git push origin main

13.4. RODAR O BOT
      cd ~/bot-ia
      npm start            (modo produção — WhatsApp)
      npm run chat         (modo terminal — testes)

13.5. ENVIAR IMAGEM ÚNICA PRO SERVIDOR (rclone no PC da empresa)
      C:\rclone\rclone.exe copy "X:\...\foto.png" ^
        bitserver:/home/monster/shock-catalogo/dados/imagens_originais/ -v

13.6. VER O CONSUMO DO DEEPSEEK
      https://platform.deepseek.com/usage


================================================================================
14. HISTÓRICO DE DECISÕES IMPORTANTES
================================================================================

- Site estático (Astro) no GitHub Pages, sem backend
- XLSX do Catálogo é a fonte da verdade
- ativo = FALSO -> oculto no site
- Produto sem foto -> oculto no site
- Preço: só campo "preco" (por unidade)
- Valor da caixa = preco * unidadesPorCaixa
- Imagens WebP 800px, qualidade 82 (antes era 600px/80 no Raspberry Pi)
- PDFKit pra gerar PDFs
- IA do bot: DeepSeek (deepseek-chat) por ser baratíssimo
- Ollama foi testado mas removido (modelo 3B alucinava, 8B era lento)
- Anthropic API abandonada (custo alto, migrado pro DeepSeek)
- Bot NUNCA se identifica como IA
- Bot NUNCA inicia conversa (só responde)
- rclone no PC da empresa para sincronizar imagens
- Modo "copy" (nunca apaga do destino) por segurança
- Imagens originais substituíram as versões de baixa resolução do Pi
- Lightbox adicionado no site (cliente vê produto em tela cheia)
- Botão de copiar código adicionado (facilita pedido do revendedor)


================================================================================
15. ARQUIVOS A NÃO ESQUECER
================================================================================

SERVIDOR (BitServer)
  - /home/monster/bot-ia/.env          (CHAVE DeepSeek aqui)
  - /home/monster/bot-ia/regras.md     (editável para ajustar comportamento)
  - /home/monster/bot-ia/memoria.db    (histórico de conversas)
  - /home/monster/bot-ia/auth/         (credenciais do WhatsApp)
  - /home/monster/shock-catalogo/dados/Catalogo - Shock Imports.xlsx
  - /home/monster/shock-catalogo/dados/imagens_originais/ (originais)

PC DA EMPRESA
  - C:\rclone\rclone.exe
  - C:\rclone\sincronizar-imagens.bat
  - C:\rclone\sincronia.log            (log da sincronia)
  - C:\Users\Paula\.ssh\rclone_shock   (chave privada SSH)
  - C:\Users\Paula\.config\rclone\rclone.conf

GITHUB
  - https://github.com/BitMonster04/Shockimports
  - https://bitmonster04.github.io/Shockimports/

APIS
  - https://platform.deepseek.com/api_keys   (gerenciar chaves)
  - https://platform.deepseek.com/usage      (ver consumo)


================================================================================
FIM DO DOCUMENTO
================================================================================
