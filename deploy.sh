#!/bin/bash
# Deploy do vivo-web (NAO afeta as outras apps do servidor: appdogas, supabase, scraper).
# Uso: ./deploy.sh --bg    -> roda desanexado, log em /tmp/vivo-deploy.log
#      ./deploy.sh         -> roda em foreground
cd /home/user/vivo-gestao || exit 1
LOG=/tmp/vivo-deploy.log
LOCK=/tmp/vivo-deploy.lock

if [ "$1" = "--bg" ]; then
  nohup "$0" _run > "$LOG" 2>&1 &
  echo "deploy iniciado em background (PID $!). Acompanhe: tail -f $LOG"
  exit 0
fi

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "ERRO: outro deploy ja esta rodando. Veja: tail -f $LOG" >&2
  exit 1
fi

echo "=== deploy iniciado $(date) ==="
git pull origin main || exit 1
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build web || exit 1
sleep 4
docker logs vivo-web --tail 5 2>&1
curl -sI http://127.0.0.1:3008 | head -1
echo "=== deploy OK $(date) ==="
