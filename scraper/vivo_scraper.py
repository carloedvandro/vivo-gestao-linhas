"""
Scraper Vivo Empresas — coleta consumo de linhas e grava no Supabase.

ARQUITETURA
-----------
- `vivo_scraper.py`: módulo que loga no portal Vivo Empresas e lê o consumo
  de todas as linhas de dados em uma única sessão.
- `main.py`: scheduler que roda a cada N minutos, chama o scraper, grava
  snapshots no Supabase, checa limiares e dispara alertas.
- `push.py`: envia push notifications via VAPID (web-push).

FLUXO DO SCRAPER
---------------
1. Login no portal com CPF/CNPJ + senha
2. Navega até Consumo → Consumo de Dados
3. Expande o grupo "Net" (botão +)
4. Clica em "Ver Linhas"
5. Clica em "Ver mais linhas" até carregar todas
6. Extrai número + consumo de cada linha
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright, BrowserContext, Page

log = logging.getLogger("vivo_scraper")

VIVO_PORTAL_URL = os.getenv("VIVO_PORTAL_URL", "https://vivogestao.vivoempresas.com.br/Portal/data/login?filter=false")
STORAGE_PATH = Path(os.getenv("SCRAPER_STORAGE_PATH", "/data/storage.json"))


@dataclass
class LineConsumption:
    """Resultado do scrape de uma linha."""
    number: str
    used_gb: float
    total_gb: float
    status: str  # ativa | reduzida | bloqueada_fatura | bloqueada_pagamento | aguardando
    vivo_line_id: Optional[str] = None


def normalize_number(raw: str) -> str:
    """Normaliza número: (11) 93429-2407 → 11934292407"""
    return re.sub(r"\D", "", raw)


class VivoPortalScraper:
    """
    Scraper do portal Vivo Empresas.
    Loga no portal, navega até Consumo de Dados, expande o grupo Net,
    lista todas as linhas e extrai o consumo de cada uma.
    """

    def __init__(self, username: str, password: str, headless: bool = True):
        self.username = username
        self.password = password
        self.headless = headless
        self._context: Optional[BrowserContext] = None

    async def __aenter__(self) -> "VivoPortalScraper":
        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(headless=self.headless)
        self._context = await self._browser.new_context(
            viewport={"width": 1366, "height": 900},
            locale="pt-BR",
        )
        await self._load_storage()
        return self

    async def __aexit__(self, *exc):
        await self._save_storage()
        if self._context:
            await self._context.close()
        await self._browser.close()
        await self._pw.stop()

    # ---- storage persistente (cookies/localStorage) ----
    async def _load_storage(self):
        if STORAGE_PATH.exists():
            try:
                await self._context.storage_state(path=str(STORAGE_PATH))
                log.info("Storage carregado de %s", STORAGE_PATH)
            except Exception as e:
                log.warning("Falha ao carregar storage: %s", e)

    async def _save_storage(self):
        if self._context:
            STORAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
            await self._context.storage_state(path=str(STORAGE_PATH))

    # ---- login ----
    async def _login(self, page: Page) -> None:
        """Faz login no portal Vivo Empresas."""
        log.info("Navegando para página de login: %s", VIVO_PORTAL_URL)
        await page.goto(VIVO_PORTAL_URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(5000)

        # Preenche credenciais
        log.info("Preenchendo credenciais (usuario=%s)", self.username)
        await page.fill('input[name="login"]', self.username)
        await page.fill('input[name="password"]', self.password)

        # Clica em Entrar
        log.info("Clicando botao Entrar")
        await page.click('button[type="submit"]')
        await page.wait_for_timeout(10000)

        # Verifica se logou (URL deve mudar para consumption)
        current_url = page.url
        log.info("URL apos login: %s", current_url)
        if "login" in current_url and "consumption" not in current_url:
            raise RuntimeError(f"Login falhou — ainda na pagina de login: {current_url}")

        log.info("Login realizado com sucesso")

    # ---- navegacao ate a lista de linhas ----
    async def _navigate_to_lines(self, page: Page) -> None:
        """
        Navega: Consumo → Consumo de Dados → expandir grupo Net → Ver Linhas.
        """
        # Fecha modal se existir
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(2000)

        # Clica na aba "Consumo de Dados"
        log.info("Clicando em Consumo de Dados")
        dados_tabs = await page.query_selector_all("text=Consumo de Dados")
        for tab in dados_tabs:
            if await tab.is_visible():
                await tab.click(force=True)
                await page.wait_for_timeout(5000)
                break
        else:
            log.warning("Aba Consumo de Dados nao encontrada")

        # Fecha modal novamente se apareceu
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(2000)

        # Clica no grupo "Net" (botão + para expandir)
        log.info("Expandindo grupo Net")
        net_el = await page.query_selector("text=Net")
        if net_el:
            await net_el.click(force=True)
            await page.wait_for_timeout(5000)
            log.info("Grupo Net expandido")
        else:
            log.warning("Grupo Net nao encontrado")
            return

        # Aguarda o botao "Ver Linhas" aparecer (pode demorar a renderizar)
        log.info("Aguardando botao Ver Linhas")
        try:
            ver_btn = await page.wait_for_selector("text=Ver Linhas", timeout=15000)
            if ver_btn:
                await ver_btn.click(force=True)
                await page.wait_for_timeout(5000)
                log.info("Lista de linhas aberta")
        except Exception as e:
            log.warning("Botao Ver Linhas nao encontrado: %s", e)

        # Clica em "Ver mais linhas" repetidamente até carregar todas
        for attempt in range(10):
            more_btn = await page.query_selector("text=Ver mais linhas")
            if not more_btn or not await more_btn.is_visible():
                log.info("Todas as linhas carregadas (tentativa %d)", attempt + 1)
                break
            log.info("Clicando Ver mais linhas (tentativa %d)", attempt + 1)
            await more_btn.click(force=True)
            await page.wait_for_timeout(3000)

    # ---- extracao de dados ----
    async def _extract_lines(self, page: Page) -> list[LineConsumption]:
        """Extrai número + consumo de cada linha visível na página."""
        lines = await page.evaluate("""() => {
            const results = [];
            const allP = document.querySelectorAll("p");
            for (const p of allP) {
                const text = p.textContent.trim();
                // Formato: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
                if (/^\\(\\d{2}\\)\\s*\\d{4,5}-?\\d{4}$/.test(text)) {
                    let node = p.parentElement;
                    let consumed = "0";
                    for (let i = 0; i < 8; i++) {
                        if (!node) break;
                        const nodeText = node.textContent;
                        const gbMatch = nodeText.match(/([\\d.]+)GB/);
                        if (gbMatch) {
                            consumed = gbMatch[1];
                            break;
                        }
                        node = node.parentElement;
                    }
                    results.push({number: text, consumed: consumed});
                }
            }
            return results;
        }""")

        result: list[LineConsumption] = []
        for l in lines:
            number = normalize_number(l["number"])
            used = float(l["consumed"]) if l["consumed"] else 0.0
            # total_gb: nao vem por linha individual — vem por grupo.
            # Usamos 0 como default; o sistema pode usar o total do grupo.
            total = 0.0
            status = "ativa"
            if used > 0 and total > 0 and used / total >= 0.98:
                status = "reduzida"
            result.append(LineConsumption(
                number=number,
                used_gb=used,
                total_gb=total,
                status=status,
            ))
        return result

    async def scrape_all(self, numbers: list[str]) -> list[LineConsumption]:
        """
        Scrape de várias linhas numa única sessão logada.
        Retorna apenas as linhas que estão na lista `numbers` (normalizada).
        """
        if not self.username or not self.password:
            log.warning("Credenciais nao configuradas — modo placeholder")
            return []

        page = await self._context.new_page()
        try:
            await self._login(page)
            await self._navigate_to_lines(page)
            all_lines = await self._extract_lines(page)

            log.info("Total de linhas extraidas do portal: %d", len(all_lines))

            # Filtra apenas as linhas que estao no banco
            wanted = {normalize_number(n) for n in numbers}
            results = [l for l in all_lines if l.number in wanted]

            for c in results:
                log.info("Linha %s: %.2f/%.2f GB (%s)", c.number, c.used_gb, c.total_gb, c.status)

            # Linhas que nao foram encontradas no portal
            found_numbers = {l.number for l in results}
            for n in wanted:
                if n not in found_numbers:
                    log.warning("Linha %s nao encontrada no portal", n)

            return results
        finally:
            await page.close()
