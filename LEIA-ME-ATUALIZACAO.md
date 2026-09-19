# Catálogo Shock Imports — atualização automática

## Aplicar (uma vez, no Pi)

```bash
cd /home/bit/shock-catalogo
unzip -o ~/atualizacao-catalogo.zip     # sobrescreve só os arquivos listados abaixo
git rm -r --cached -q public/pdf        # PDFs deixam de ir pro git (o GitHub gera)
git add .gitignore .github config.js package.json scripts src LEIA-ME-ATUALIZACAO.md
git commit -qm "Atualizacao automatica do catalogo; PDFs gerados no GitHub"
npm run atualizar                       # processa tudo, commita public/ e envia os 2 commits
```

Depois: GitHub → **Settings → Pages → Source: GitHub Actions** e acompanhe a aba **Actions**.

Arquivos do zip: `.gitignore`, `.github/workflows/deploy.yml`, `config.js`, `package.json`,
`scripts/01..05`, `scripts/atualizar-tudo.js`, `scripts/sem-foto.js`, `src/pages/index.astro`,
`src/styles/global.css`.

## Uso no dia a dia

| Comando | O que faz |
|---|---|
| `npm run atualizar` | Só processa se o XLSX ou as fotos mudaram; senão sai em segundos |
| `npm run atualizar -- --verificar` | Só diz se há mudanças (não altera nada) |
| `npm run atualizar -- --forcar` | Processa mesmo sem mudanças |
| `npm run atualizar -- --sem-git` | Processa sem publicar no GitHub (teste) |
| `npm run atualizar -- --aceitar-queda` | Libera a trava de "sumiram muitas fotos/produtos" |
| `npm run sem-foto -- on` / `off` / `status` | Mostra ("Foto em breve") ou esconde os produtos sem foto; já atualiza |

Produto novo entra quando: está **ativo** no XLSX **e** existe foto com o código dele em
`dados/imagens_originais/`. Produto sem entrada no XLSX continua exigindo XLSX novo.

## Automático (cron)

Descubra o caminho do node: `which node`. Depois `crontab -e` e adicione (ajuste o caminho):

```cron
*/30 8-19 * * 1-6 cd /home/bit/shock-catalogo && /usr/bin/node scripts/atualizar-tudo.js >/dev/null 2>>logs/cron-erros.log
```

A cada 30 min, de seg. a sáb., das 8h às 19h30. Sem mudança, cada rodada leva segundos.
O log de cada dia fica em `logs/atualizar-AAAA-MM-DD.log` (7 dias). A última linha "RESUMO" mostra
produtos no ar, entradas/saídas, ativos sem foto, fotos órfãs, tempo e **pico de RAM**.

## Travas de segurança

- Uma execução por vez (trava em `banco/.atualizar.lock`).
- Adia se a RAM livre estiver abaixo de 120 MB (protege o bot) ou se algum arquivo foi mexido há menos de 60 s.
- **Não publica** se a pasta de fotos esvaziar/cair mais de 30% ou se o catálogo for encolher mais de 30%.
- Foto corrompida ou truncada não derruba nada: o produto só fica sem foto até a próxima rodada.
- Só a pasta `public/` vai pro git (nunca `dados/`, `banco/`, `logs/`).

## Aviso quando falhar (opcional, grátis)

Crie um check em healthchecks.io e coloque no arquivo `.env` do projeto:

```
HEALTHCHECK_URL=https://hc-ping.com/SEU-CODIGO
```

Cada rodada bem-sucedida dá um ping; falha ou trava enviam `/fail`. Se o cron parar de rodar,
o próprio Healthchecks avisa (configure o mesmo horário do cron e 1 h de tolerância).

## Ajustes locais (não vão pro git)

`config.local.json` sobrepõe o `config.js`. Exemplo:

```json
{ "seguranca": { "maxQuedaPct": 40 }, "catalogo": { "incluirSemFoto": false } }
```

Para forçar reprocessar todas as fotos (ex.: mudou qualidade/largura): `rm public/img/produtos/*.hash`
e rode `npm run atualizar -- --forcar`.
