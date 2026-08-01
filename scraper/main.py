"""
Scheduler principal do scraper.

Roda a cada N minutos (default 5), raspa o consumo de todas as linhas
cadastradas, grava snapshots, checa limiares e dispara alertas (push + banco).

Uso:
    python -m scraper.main            # loop infinito
    python -m scraper.main --once     # roda uma vez e sai
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time
from datetime import datetime, timezone

from .supabase_client import SupabaseClient
from .vivo_scraper import VivoPortalScraper, LineConsumption
from .push import PushSubscription, send_push

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("scheduler")

INTERVAL_SEC = int(os.getenv("SCRAPER_INTERVAL_SEC", "300"))  # 5 min
VIVO_USER = os.getenv("VIVO_PORTAL_USER", "")
VIVO_PASS = os.getenv("VIVO_PORTAL_PASS", "")


async def run_once() -> None:
    db = SupabaseClient()
    started = datetime.now(timezone.utc).isoformat()

    # cria registro de run
    run_rows = db.insert("scraping_runs", [{"started_at": started, "status": "running"}])
    run_id = run_rows[0]["id"] if run_rows else None

    # carrega linhas ativas
    lines = db.select("lines", columns="id,number,user_id,total_gb,used_gb,status", query="order=number.asc")
    if not lines:
        log.info("Nenhuma linha cadastrada. Pulando.")
        _finish_run(db, run_id, 0, 0, None)
        return

    numbers = [l["number"] for l in lines]
    log.info("Raspando %d linhas…", len(numbers))

    ok = err = 0
    async with VivoPortalScraper(VIVO_USER, VIVO_PASS, headless=True) as scraper:
        results: list[LineConsumption] = await scraper.scrape_all(numbers)

    # indexa resultados por número
    by_number = {r.number: r for r in results}

    for l in lines:
        c = by_number.get(l["number"])
        if not c:
            err += 1
            log.warning("Sem resultado para %s", l["number"])
            continue
        try:
            # grava snapshot
            db.insert(
                "consumption_snapshots",
                [{
                    "line_id": l["id"],
                    "used_gb": c.used_gb,
                    "total_gb": c.total_gb,
                    "status": c.status,
                }],
            )
            # atualiza a linha — NAO sobrescreve total_gb (definido pelo admin)
            db.update(
                "lines",
                {
                    "used_gb": c.used_gb,
                    "last_scraped_at": datetime.now(timezone.utc).isoformat(),
                    "vivo_line_id": c.vivo_line_id or None,
                },
                query=f"id=eq.{l['id']}",
            )
            ok += 1
            # checa limiar
            check_threshold(db, l, c)
        except Exception as e:
            err += 1
            log.error("Erro ao gravar linha %s: %s", l["number"], e)

    _finish_run(db, run_id, ok, err, None)
    log.info("Run finalizado: ok=%d err=%d", ok, err)


def check_threshold(db: SupabaseClient, line: dict, consumption: LineConsumption) -> None:
    """Checa se o consumo passou do limiar e dispara alerta (se ainda não disparou no ciclo)."""
    th_rows = db.select("thresholds", columns="*", query=f"line_id=eq.{line['id']}&enabled=eq.true")
    if not th_rows:
        return
    th = th_rows[0]
    limit = th["warn_gb"] if th["warn_gb"] is not None else (float(th["warn_pct"]) / 100) * consumption.total_gb

    if consumption.used_gb < limit:
        return

    pct = round((consumption.used_gb / consumption.total_gb) * 100, 2) if consumption.total_gb else 100

    # evita re-disparar: busca alerta threshold nas últimas 24h pra essa linha
    recent = db.select(
        "alerts",
        columns="id",
        query=(
            f"line_id=eq.{line['id']}&kind=eq.threshold"
            f"&created_at=gte.{datetime.now(timezone.utc).isoformat()}"
        ),
    )
    if recent:
        log.info("Alerta já disparado nas últimas 24h pra %s — pulando", line["number"])
        return

    msg = (
        f"Linha {line['number']}: {consumption.used_gb:.1f} GB de {consumption.total_gb:.0f} GB "
        f"({pct:.1f}%) — atingiu o limiar de {limit:.1f} GB."
    )
    alert_rows = db.insert("alerts", [{
        "line_id": line["id"],
        "user_id": line.get("user_id"),
        "kind": "threshold",
        "message": msg,
        "used_gb": consumption.used_gb,
        "total_gb": consumption.total_gb,
        "pct": pct,
        "notified": False,
        "read": False,
    }])
    log.warning("ALERTA: %s", msg)

    # envia push
    if line.get("user_id"):
        subs = db.select("push_subscriptions", columns="*", query=f"user_id=eq.{line['user_id']}")
        for s in subs:
            ok = send_push(
                PushSubscription(endpoint=s["endpoint"], p256dh=s["p256dh"], auth=s["auth"]),
                {"title": "Alerta de consumo", "body": msg, "icon": "/icon-192.png", "url": "/"},
            )
            if ok:
                db.update("alerts", {"notified": True}, query=f"id=eq.{alert_rows[0]['id']}")


def _finish_run(db: SupabaseClient, run_id, ok: int, err: int, error):
    if not run_id:
        return
    db.update(
        "scraping_runs",
        {
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "status": "error" if err and not ok else "success",
            "lines_ok": ok,
            "lines_err": err,
            "error": error,
        },
        query=f"id=eq.{run_id}",
    )


async def loop():
    log.info("Scheduler iniciado — intervalo %ds", INTERVAL_SEC)
    while True:
        try:
            await run_once()
        except Exception as e:
            log.exception("Run falhou: %s", e)
        await asyncio.sleep(INTERVAL_SEC)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Roda uma vez e sai")
    args = parser.parse_args()
    if args.once:
        asyncio.run(run_once())
    else:
        asyncio.run(loop())


if __name__ == "__main__":
    main()
