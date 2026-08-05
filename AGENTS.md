# AGENTS.md — vivo-gestao-linhas

## Ambiente

- Repo: https://github.com/carloedvandro/vivo-gestao-linhas (branch `main`)
- Stack: TanStack Start + React + Tailwind + Supabase self-hosted
- Package manager: `npm` (existe `bun.lock`, mas o Dockerfile usa `npm install`)

## Servidor de produção

- Host: `root@167.86.84.197` (SSH por chave, já configurado)
- Diretório da app: `/home/user/vivo-gestao`
- URL pública: https://consumo-ytech.yrwentechnology.com.br
- App roda em `127.0.0.1:3008` atrás de nginx

### IMPORTANTE: o servidor roda outras aplicações

Nunca use `docker compose down`, `docker system prune`, nem reinicie serviços que não sejam
o `vivo-web`. Outros containers no mesmo host:

- `appdogas-docker-*` (frontend, api, smartgas-site) — outra aplicação
- `supabase-*` (sem prefixo `vivo-`) — Supabase de OUTRO projeto
- `vivo-supabase-*` — Supabase deste projeto (em `/home/user/vivo-supabase/`)
- `vivo-scraper` — scraper do portal Vivo deste projeto

Só rebuilde/reinicie o serviço `web` explicitamente.

## Deploy

**Sempre use o script** `/home/user/vivo-gestao/deploy.sh` (versionado no repo):

```bash
# do seu terminal:
ssh root@167.86.84.197 "/home/user/vivo-gestao/deploy.sh --bg"
# acompanhe:
ssh root@167.86.84.197 "tail -20 /tmp/vivo-deploy.log"
```

O script faz `git pull` + rebuild do serviço `web` + healthcheck. Ele usa `flock` para
impedir dois builds simultâneos (isso já causou builds corrompidos no passado).

### Por que não rodar o compose direto

O build leva ~3-5 minutos. Se você rodar `docker compose ... up -d --build` de forma
síncrona pelo SSH e o comando for interrompido, o build fica órfão no servidor. Pior:
disparar um segundo build em paralelo corrompe o cache e o container não atualiza.
O `deploy.sh --bg` resolve os dois problemas (desanexa + lock).

### O `--env-file .env.prod` é obrigatório

O `docker-compose.prod.yml` referencia `${ANON_KEY}`, `${SERVICE_ROLE_KEY}` e
`${VAPID_*}`, que existem **apenas** em `/home/user/vivo-gestao/.env.prod`.
O `.env` (default do compose) tem nomes diferentes (`SUPABASE_PUBLISHABLE_KEY`, etc.)
e o build sai com as chaves vazias → o app quebra com:

```
[Supabase] Missing Supabase environment variable(s): SUPABASE_PUBLISHABLE_KEY.
```

O `deploy.sh` já passa o `--env-file .env.prod`.

## Banco de dados

Postgres do Supabase deste projeto, no container `vivo-supabase-db`:

```bash
ssh root@167.86.84.197 "docker exec vivo-supabase-db psql -U supabase_admin -d postgres -c \"SELECT ...\""
```

Studio disponível via container `vivo-supabase-studio`.

## Armadilhas conhecidas no código

### TDZ em `src/routes/admin.tsx`

O componente tem muitos `const` derivados no corpo da função. `allLines` é declarado
depois dos helpers de estilo; qualquer `const` novo que dependa de `allLines` deve vir
**depois** da linha `const allLines = lines ?? [];`. Colocar antes gera, só no bundle
minificado de produção, um erro que não aparece em dev:

```
ReferenceError: Cannot access 'Se' before initialization
```

### Rotas geradas

`src/routeTree.gen.ts` é gerado pelo `@tanstack/router-plugin` no build. Já houve um caso
em que uma rota nova (`admin.financeiro.tsx`) não era incluída na geração e a página ficava
em branco em produção. A solução adotada foi remover a rota separada e transformar o
financeiro numa view condicional dentro de `admin.tsx`. Evite criar rotas aninhadas novas
sem verificar o `routeTree.gen.ts` gerado no build de produção.

### Telefone / login

`phoneToEmail` em `src/routes/login.tsx` usa `normalizeLineNumber` (que **remove** o
prefixo "55"). Não troque por `normalizePhone`, que **adiciona** o "55" — os usuários
foram criados sem o prefixo e o login quebra.

## Verificação

Não há suíte de testes. Antes de fazer deploy:

```bash
npx tsc --noEmit    # checagem de tipos
npm run build       # confirma que o bundle de produção compila
```

Depois do deploy, confirme:

```bash
ssh root@167.86.84.197 "docker logs vivo-web --tail 5; curl -sI http://127.0.0.1:3008 | head -1"
```

Deve retornar `HTTP/1.1 200` e **nenhuma** mensagem de missing env var.
