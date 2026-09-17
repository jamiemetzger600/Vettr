"""
Vettr scraper sidecar — thin FastAPI wrapper around Scrapling.

The Node worker owns orchestration, recipes, logging, upsert, health and alerts.
This service only knows how to: fetch a page (http / browser / stealth), discover
listing URLs, extract recipe fields (with adaptive relocation), render a sanitized
snapshot for the trainer, and generate robust selectors for a clicked element.

Run:  uvicorn app:app --host 127.0.0.1 --port 3002
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

import lxml.html
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from scrapling import __version__ as SCRAPLING_VERSION
from scrapling.fetchers import DynamicFetcher, Fetcher, StealthyFetcher
from scrapling.parser import Selector

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [sidecar] %(message)s")
log = logging.getLogger("sidecar")

APP_VERSION = "0.1.2"
ADAPTIVE_DB = os.environ.get(
    "SCRAPLING_ADAPTIVE_DB",
    os.path.expanduser("~/Library/Application Support/vettr/scrapling.db"),
)
os.makedirs(os.path.dirname(ADAPTIVE_DB), exist_ok=True)

DEFAULT_TIMEOUT_MS = int(os.environ.get("SIDECAR_TIMEOUT_MS", "45000"))
BROWSER_LOCK = threading.Lock()  # one headless browser at a time (memory)

BLOCK_MARKERS = re.compile(
    r"(cf-chl|challenge-platform|Just a moment|Attention Required|Access Denied|"
    r"captcha|hcaptcha|recaptcha|PerimeterX|_Incapsula_|distil_r|Request unsuccessful|"
    r"Pardon Our Interruption|are you a human|bot detection)",
    re.I,
)

# SPA brokers (e.g. KCapex) load listing bodies from Tupelo CRM, not the page HTML.
LISTING_ID_RE = re.compile(r"[?&]listingId=([a-z0-9]+)", re.I)
TUPELO_LISTING_RE = re.compile(r"crm\.tupelosmb\.com/api/public/listings/([a-z0-9]+)", re.I)
TUPELO_API = "https://crm.tupelosmb.com/api/public/listings"
TUPELO_ORG_ATTR_RE = re.compile(
    r"<(?:tupelo-marketplace)[^>]*organization-id=[\"']([a-z0-9]+)[\"']",
    re.I,
)

app = FastAPI(title="Vettr Scraper Sidecar", version=APP_VERSION)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class FetchReq(BaseModel):
    url: str
    mode: str = "http"  # http | browser | stealth
    timeout_ms: Optional[int] = None
    proxy: Optional[str] = None
    wait_selector: Optional[str] = None
    network_idle: bool = False
    solve_cloudflare: bool = False


class ExtractReq(BaseModel):
    url: str
    html: Optional[str] = None
    mode: str = "http"
    fields: dict[str, list[dict[str, Any]]]
    adaptive: bool = False
    adaptive_domain: Optional[str] = None
    source_key: Optional[str] = None
    include_html: bool = False
    include_text: bool = False
    timeout_ms: Optional[int] = None
    proxy: Optional[str] = None
    wait_selector: Optional[str] = None
    network_idle: bool = False
    solve_cloudflare: bool = False


class DiscoverReq(BaseModel):
    discover: dict[str, Any]
    mode: str = "http"
    max_urls: int = 500
    rate_limit_ms: int = 2000
    timeout_ms: Optional[int] = None
    proxy: Optional[str] = None
    solve_cloudflare: bool = False


class SnapshotReq(BaseModel):
    url: str
    mode: str = "browser"
    timeout_ms: Optional[int] = None
    proxy: Optional[str] = None
    solve_cloudflare: bool = False


class SelectorReq(BaseModel):
    url: str
    html: str
    path: str = Field(..., description="CSS path of the clicked element from the trainer picker")


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------
def _domain(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def detect_block(status: int, html: str) -> Optional[str]:
    if status in (401, 403, 429, 503):
        return f"http_{status}"
    if status >= 400:
        return None
    if len(html) < 20000:
        m = BLOCK_MARKERS.search(html)
        if m:
            return f"marker:{m.group(1)[:40]}"
    return None


def do_fetch(
    url: str,
    mode: str = "http",
    timeout_ms: Optional[int] = None,
    proxy: Optional[str] = None,
    wait_selector: Optional[str] = None,
    network_idle: bool = False,
    solve_cloudflare: bool = False,
) -> dict[str, Any]:
    timeout_ms = timeout_ms or DEFAULT_TIMEOUT_MS
    started = time.time()
    mode = (mode or "http").lower()
    try:
        if mode == "http":
            kwargs: dict[str, Any] = {
                "impersonate": "chrome",
                "timeout": max(5, timeout_ms / 1000),
                "follow_redirects": True,
                "stealthy_headers": True,
            }
            if proxy:
                kwargs["proxy"] = proxy
            resp = Fetcher.get(url, **kwargs)
        else:
            kwargs = {
                "headless": True,
                "timeout": timeout_ms,
                "network_idle": network_idle,
                "disable_resources": True,
            }
            if proxy:
                kwargs["proxy"] = proxy
            if wait_selector:
                kwargs["wait_selector"] = wait_selector
            with BROWSER_LOCK:
                if mode == "stealth":
                    kwargs["solve_cloudflare"] = solve_cloudflare
                    kwargs["block_webrtc"] = True
                    resp = StealthyFetcher.fetch(url, **kwargs)
                else:
                    resp = DynamicFetcher.fetch(url, **kwargs)
    except Exception as exc:  # noqa: BLE001
        log.warning("fetch failed url=%s mode=%s err=%s", url, mode, exc)
        return {
            "url": url,
            "final_url": url,
            "status": 0,
            "html": "",
            "blocked": False,
            "block_reason": None,
            "error": str(exc)[:500],
            "elapsed_ms": int((time.time() - started) * 1000),
            "mode": mode,
        }

    html = resp.body.decode(resp.encoding or "utf-8", errors="replace") if isinstance(resp.body, bytes) else str(resp.body)
    status = int(resp.status or 0)
    reason = detect_block(status, html)
    out = {
        "url": url,
        "final_url": str(resp.url or url),
        "status": status,
        "html": html,
        "blocked": reason is not None,
        "block_reason": reason,
        "error": None,
        "elapsed_ms": int((time.time() - started) * 1000),
        "mode": mode,
    }
    log.info("fetched %s status=%s mode=%s bytes=%s blocked=%s %sms", url, status, mode, len(html), reason, out["elapsed_ms"])
    return out


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------
_WS = re.compile(r"\s+")


def clean(s: Any) -> str:
    if s is None:
        return ""
    return _WS.sub(" ", str(s)).strip()


def elem_text(el) -> str:
    try:
        return clean(el.get_all_text(separator=" ", strip=True))
    except Exception:  # noqa: BLE001
        return clean(getattr(el, "text", ""))


def make_page(html: str, url: str, adaptive: bool, adaptive_domain: Optional[str]) -> Selector:
    if adaptive:
        return Selector(
            html,
            url=url,
            adaptive=True,
            storage_args={"storage_file": ADAPTIVE_DB, "url": adaptive_domain or _domain(url)},
        )
    return Selector(html, url=url)


def label_span(text: str, label: str) -> Optional[tuple[int, int]]:
    """Whole-token span of `label` in `text`. Rejects mid-word hits like Multi-Location."""
    if not text or not label:
        return None
    # Hyphen counts as part of a word so "Multi-Location" does not match "Location"
    pat = re.compile(rf"(?<![A-Za-z0-9-]){re.escape(label)}(?![A-Za-z0-9-])", re.I)
    m = pat.search(text)
    return (m.start(), m.end()) if m else None


def is_label_element(own: str, full: str, label: str) -> bool:
    """True if this node is a real field label, not a random substring hit."""
    own_bare = re.sub(r"^[\s:–—|-]+|[\s:–—|-]+$", "", own or "").strip()
    if own_bare.lower() == label.lower():
        return True
    # Inline "Label: value" must start with the label token
    if full and re.match(rf"^{re.escape(label)}(?![A-Za-z0-9-])", full, re.I):
        return True
    return False


def strip_label(text: str, label: str) -> str:
    """'Asking Price: $500,000' -> '$500,000'. Exact label-only text -> '' so next-cell can win."""
    if not text:
        return ""
    span = label_span(text, label)
    if not span:
        return text
    rest = text[span[1] :].lstrip(" \t:-–—|")
    return rest.strip()


def _money(n: Any) -> str:
    if n is None or n == "":
        return ""
    try:
        return f"${int(round(float(n))):,}"
    except (TypeError, ValueError):
        return str(n)


def extract_listing_id(url: str) -> Optional[str]:
    if not url:
        return None
    m = LISTING_ID_RE.search(url) or TUPELO_LISTING_RE.search(url)
    return m.group(1) if m else None


def fetch_tupelo_listing(listing_id: str) -> Optional[dict[str, Any]]:
    url = f"{TUPELO_API}/{listing_id}"
    try:
        # http mode is enough — public JSON API
        resp = Fetcher.get(url, impersonate="chrome", timeout=30, follow_redirects=True, stealthy_headers=True)
        body = resp.body.decode(resp.encoding or "utf-8", errors="replace") if isinstance(resp.body, bytes) else str(resp.body)
        if int(resp.status or 0) >= 400:
            log.warning("tupelo listing %s -> %s", listing_id, resp.status)
            return None
        data = json.loads(body)
        return data if isinstance(data, dict) and data.get("id") else None
    except Exception as exc:  # noqa: BLE001
        log.warning("tupelo listing fetch failed %s: %s", listing_id, exc)
        return None


def fetch_tupelo_listing_index(organization_id: str, take: int = 100, skip: int = 0) -> list[dict[str, Any]]:
    url = f"{TUPELO_API}?organizationId={organization_id}&take={int(take)}&skip={int(skip)}"
    try:
        resp = Fetcher.get(url, impersonate="chrome", timeout=30, follow_redirects=True, stealthy_headers=True)
        body = resp.body.decode(resp.encoding or "utf-8", errors="replace") if isinstance(resp.body, bytes) else str(resp.body)
        data = json.loads(body)
        return list(data.get("listings") or []) if isinstance(data, dict) else []
    except Exception as exc:  # noqa: BLE001
        log.warning("tupelo index fetch failed org=%s: %s", organization_id, exc)
        return []


def tupelo_to_html(data: dict[str, Any], page_url: str) -> str:
    """Build a labeled HTML doc so label/css strategies (and the trainer picker) work."""
    industries = ", ".join(
        f"{i.get('sectorTitle') or ''} / {i.get('subSectorTitle') or ''}".strip(" /")
        for i in (data.get("industries") or [])
        if isinstance(i, dict)
    )
    rows = [
        ("Name", data.get("headline") or ""),
        ("Asking Price", _money(data.get("askingPrice"))),
        ("Cash Flow", _money(data.get("cashFlow"))),
        ("SDE", _money(data.get("cashFlow"))),
        ("EBITDA", _money(data.get("ebitda"))),
        ("Gross Revenue", _money(data.get("revenue"))),
        ("Revenue", _money(data.get("revenue"))),
        ("Location", data.get("locationString") or data.get("locationName") or ""),
        ("Industry", industries),
        ("Year Established", data.get("yearEstablished") or ""),
        ("Franchise", "Yes" if data.get("isEstablishedFranchise") else ""),
        ("Source ID", data.get("id") or ""),
    ]
    trs = "".join(
        f"<tr><th>{label}</th><td>{html_escape(str(val))}</td></tr>"
        for label, val in rows
        if val not in (None, "")
    )
    headline = html_escape(str(data.get("headline") or "Listing"))
    desc = html_escape(str(data.get("description") or "")).replace("\n", "<br/>")
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/><base href="{html_escape(page_url)}"/><title>{headline}</title>
<style>body{{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111}}
h1{{font-size:22px}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #ddd;padding:8px 10px;text-align:left}}
th{{width:40%;background:#f6f6f6;font-weight:600}}.desc{{margin-top:18px;line-height:1.45}}</style></head>
<body>
<p data-vettr-source="tupelo">Hydrated from Tupelo CRM (page shell had no listing body).</p>
<h1>{headline}</h1>
<table>{trs}</table>
<div class="desc"><h2>Description</h2><p>{desc}</p></div>
</body></html>"""


def html_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def parse_tupelo_org_id(html: str, discover: dict[str, Any]) -> Optional[str]:
    explicit = (discover.get("tupelo") or {}).get("organizationId")
    if explicit:
        return str(explicit)
    if not html:
        return None
    m = TUPELO_ORG_ATTR_RE.search(html)
    return m.group(1) if m else None


def tupelo_listing_page_url(start_url: str, listing_id: str, template: Optional[str] = None) -> str:
    if template:
        return template.replace("{id}", listing_id)
    p = urlparse(start_url)
    path = p.path or "/business-listings/"
    return f"{p.scheme}://{p.netloc}{path}?listingId={listing_id}"


def discover_tupelo_listing_urls(org_id: str, start_url: str, max_urls: int, template: Optional[str]) -> list[str]:
    urls: list[str] = []
    skip = 0
    take = min(100, max(1, max_urls))
    while len(urls) < max_urls:
        batch = fetch_tupelo_listing_index(org_id, take=take, skip=skip)
        if not batch:
            break
        for row in batch:
            lid = row.get("id") if isinstance(row, dict) else None
            if not lid:
                continue
            urls.append(tupelo_listing_page_url(start_url, str(lid), template))
            if len(urls) >= max_urls:
                break
        if len(batch) < take:
            break
        skip += take
    return urls


def maybe_hydrate_spa_listing(url: str, html: str) -> tuple[str, Optional[str]]:
    """If this is a Tupelo-backed SPA listing URL, replace HTML with a labeled snapshot."""
    lid = extract_listing_id(url)
    if not lid:
        return html, None
    # Skip if the page already has financial labels (rare for these SPAs)
    if re.search(r"Asking\s*Price|Cash\s*Flow|Gross\s*Revenue", html or "", re.I):
        return html, None
    data = fetch_tupelo_listing(lid)
    if not data:
        return html, None
    log.info("hydrated tupelo listing %s (%s)", lid, data.get("headline"))
    return tupelo_to_html(data, url), "tupelo"


LABEL_NOISE = re.compile(r"^(n/?a|not disclosed|undisclosed|—|-|contact( broker)?|call)$", re.I)
MONEY_RE = re.compile(r"(\$\s?\d|\d{1,3}(,\d{3})+|\b\d+(\.\d+)?\s?(k|m|mm|million|thousand)\b|\bnot disclosed\b|\bn/?a\b|\bundisclosed\b|\bconfidential\b)", re.I)
NUMBER_RE = re.compile(r"\d")
MONEY_FIELDS = {"asking_price", "annual_profit", "annual_revenue", "ebitda", "sde", "cash_flow", "revenue", "price"}


def value_matches(expect: Optional[str], value: str) -> bool:
    if not expect or not value:
        return True
    if expect == "money":
        return bool(MONEY_RE.search(value))
    if expect == "number":
        return bool(NUMBER_RE.search(value))
    return True


def label_strategy(page: Selector, labels: list[str], value_mode: str = "auto", expect: Optional[str] = None) -> tuple[str, str]:
    """Find a key/value pair by its label. Returns (value, how). `expect` filters candidates (money|number)."""
    def ok(v: str) -> bool:
        return bool(v) and value_matches(expect, v)

    value_max = 200 if expect in ("money", "number") else 8000

    for label in labels:
        try:
            matches = page.find_by_text(label, first_match=False, partial=True)
        except Exception:  # noqa: BLE001
            continue
        for el in matches or []:
            own = clean(getattr(el, "text", ""))
            full = elem_text(el)
            # Skip huge blocks (paragraphs / whole containers) — labels are short.
            if len(own) > len(label) + 60 and len(full) > 300:
                continue
            # Reject mid-word hits (e.g. "Location" inside "Multi-Location")
            if not is_label_element(own, full, label):
                continue
            # 1) inline "Label: value" in the same element (label must lead the text, not sit mid-paragraph)
            inline = strip_label(full, label)
            span = label_span(full, label)
            label_pos = span[0] if span else -1
            if inline and 0 <= label_pos <= 3 and not LABEL_NOISE.match(inline) and len(inline) < 200 and value_mode in ("auto", "inline") and ok(inline):
                return inline, f"label:inline:{label}"
            # 2) next sibling element (dt/dd, th/td, label/span)
            if value_mode in ("auto", "nextCell", "next"):
                try:
                    nxt = el.next
                except Exception:  # noqa: BLE001
                    nxt = None
                if nxt is not None:
                    t = elem_text(nxt)
                    if t and t.lower() != label.lower() and len(t) < value_max and ok(t):
                        return t, f"label:next:{label}"
            # 3) parent text minus label, then parent's next sibling
            if value_mode in ("auto", "parent"):
                try:
                    par = el.parent
                except Exception:  # noqa: BLE001
                    par = None
                if par is not None:
                    pt = strip_label(elem_text(par), label)
                    if pt and len(pt) < value_max and ok(pt):
                        return pt, f"label:parent:{label}"
                    try:
                        pn = par.next
                    except Exception:  # noqa: BLE001
                        pn = None
                    if pn is not None:
                        t = elem_text(pn)
                        if t and len(t) < value_max and ok(t):
                            return t, f"label:parentnext:{label}"
    return "", ""


def jsonld_blocks(page: Selector) -> list[Any]:
    out: list[Any] = []
    try:
        scripts = page.css('script[type="application/ld+json"]')
    except Exception:  # noqa: BLE001
        return out
    for s in scripts:
        raw = getattr(s, "text", "") or ""
        try:
            data = json.loads(raw)
        except Exception:  # noqa: BLE001
            continue
        stack = [data]
        while stack:
            item = stack.pop()
            if isinstance(item, list):
                stack.extend(item)
            elif isinstance(item, dict):
                out.append(item)
                if "@graph" in item and isinstance(item["@graph"], list):
                    stack.extend(item["@graph"])
    return out


def jsonld_path(obj: Any, path: str) -> Any:
    cur = obj
    for part in path.split("."):
        if isinstance(cur, list):
            cur = cur[0] if cur else None
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
        if cur is None:
            return None
    if isinstance(cur, list):
        cur = cur[0] if cur else None
    return cur


def run_strategy(page: Selector, url: str, field: str, idx: int, strat: dict[str, Any], adaptive: bool, source_key: str) -> dict[str, Any]:
    stype = (strat.get("type") or "css").lower()
    result = {"value": "", "how": "", "relocated": False, "selector": None}
    identifier = f"{source_key}:{field}:{idx}"

    if stype in ("css", "xpath"):
        sel = strat.get("sel") or strat.get("selector") or ""
        if not sel:
            return result
        attr = strat.get("attr")
        method = page.css if stype == "css" else page.xpath
        els = None
        try:
            els = method(sel, identifier=identifier, auto_save=adaptive) if adaptive else method(sel)
        except Exception as exc:  # noqa: BLE001
            result["how"] = f"error:{str(exc)[:80]}"
            return result
        if not els and adaptive:
            try:
                els = method(sel, identifier=identifier, adaptive=True, auto_save=True)
                if els:
                    result["relocated"] = True
                    try:
                        result["selector"] = els[0].generate_css_selector
                    except Exception:  # noqa: BLE001
                        pass
            except Exception:  # noqa: BLE001
                els = None
        if not els:
            return result
        el = els[0]
        if attr:
            val = clean((el.attrib or {}).get(attr, ""))
        else:
            val = elem_text(el)
        if strat.get("all"):
            vals = [elem_text(e) for e in els]
            val = " | ".join(v for v in vals if v)
        result["value"] = val
        result["how"] = f"{stype}:{sel}"
        return result

    if stype == "label":
        labels = strat.get("labels") or ([strat["label"]] if strat.get("label") else [])
        expect = strat.get("expect") or ("money" if field in MONEY_FIELDS else None)
        val, how = label_strategy(page, labels, strat.get("value", "auto"), expect)
        result["value"], result["how"] = val, how
        return result

    if stype == "jsonld":
        path = strat.get("path") or ""
        for block in jsonld_blocks(page):
            if strat.get("atType") and block.get("@type") != strat["atType"]:
                continue
            v = jsonld_path(block, path)
            if v not in (None, "", [], {}):
                result["value"] = clean(v) if not isinstance(v, (dict, list)) else json.dumps(v)
                result["how"] = f"jsonld:{path}"
                return result
        return result

    if stype == "regex":
        pattern = strat.get("pattern") or strat.get("regex") or ""
        if not pattern:
            return result
        hay = page.get_all_text(separator=" ", strip=True) if strat.get("on", "text") == "text" else page.html_content
        m = re.search(pattern, str(hay), re.I | re.S)
        if m:
            result["value"] = clean(m.group(1) if m.groups() else m.group(0))
            result["how"] = f"regex:{pattern[:40]}"
        return result

    if stype == "url":
        pattern = strat.get("pattern") or strat.get("regex") or ""
        m = re.search(pattern, url, re.I) if pattern else None
        if m:
            result["value"] = m.group(1) if m.groups() else m.group(0)
            result["how"] = f"url:{pattern[:40]}"
        return result

    if stype == "meta":
        name = strat.get("name") or ""
        try:
            els = page.css(f'meta[name="{name}"], meta[property="{name}"]')
        except Exception:  # noqa: BLE001
            els = None
        if els:
            result["value"] = clean((els[0].attrib or {}).get("content", ""))
            result["how"] = f"meta:{name}"
        return result

    if stype == "const":
        result["value"] = str(strat.get("value", ""))
        result["how"] = "const"
        return result

    result["how"] = f"unknown:{stype}"
    return result


def extract_fields(html: str, url: str, fields: dict[str, list[dict[str, Any]]], adaptive: bool, adaptive_domain: Optional[str], source_key: Optional[str]) -> dict[str, Any]:
    page = make_page(html, url, adaptive, adaptive_domain)
    src = source_key or _domain(url)
    out: dict[str, Any] = {}
    for field, strategies in (fields or {}).items():
        picked: dict[str, Any] = {"value": "", "how": "", "strategy_index": None, "relocated": False, "selector": None}
        for i, strat in enumerate(strategies or []):
            r = run_strategy(page, url, field, i, strat, adaptive, src)
            if r["value"]:
                picked = {**r, "strategy_index": i}
                break
        out[field] = picked
    return out


# ---------------------------------------------------------------------------
# Snapshot sanitizing (for the trainer iframe)
# ---------------------------------------------------------------------------
STRIP_TAGS = ("script", "iframe", "noscript", "object", "embed", "applet", "link")


def sanitize_html(html: str, base_url: str) -> str:
    try:
        doc = lxml.html.fromstring(html)
    except Exception:  # noqa: BLE001
        return html
    try:
        doc.make_links_absolute(base_url, resolve_base_href=True)
    except Exception:  # noqa: BLE001
        pass
    for tag in STRIP_TAGS:
        for el in list(doc.iter(tag)):
            # keep stylesheets so the page looks right; drop everything else
            if tag == "link" and (el.get("rel") or "").lower().strip() in ("stylesheet", "preload"):
                continue
            parent = el.getparent()
            if parent is not None:
                parent.remove(el)
    for el in doc.iter():
        if not isinstance(el.tag, str):
            continue
        for attr in list(el.attrib):
            if attr.lower().startswith("on") or (attr.lower() == "href" and (el.get(attr) or "").strip().lower().startswith("javascript:")):
                del el.attrib[attr]
        if el.tag == "meta" and (el.get("http-equiv") or "").lower() == "refresh":
            el.getparent().remove(el)
        if el.tag == "a":
            el.set("target", "_blank")
    head = doc.find("head")
    if head is None:
        head = lxml.html.Element("head")
        doc.insert(0, head)
    base = lxml.html.Element("base", href=base_url)
    head.insert(0, base)
    return lxml.html.tostring(doc, encoding="unicode", method="html")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"ok": True, "version": APP_VERSION, "scrapling": SCRAPLING_VERSION, "adaptive_db": ADAPTIVE_DB}


@app.post("/fetch")
def fetch(req: FetchReq):
    return do_fetch(req.url, req.mode, req.timeout_ms, req.proxy, req.wait_selector, req.network_idle, req.solve_cloudflare)


@app.post("/extract")
def extract(req: ExtractReq):
    fetched = None
    html = req.html
    hydrate_src = None
    if html is None:
        fetched = do_fetch(req.url, req.mode, req.timeout_ms, req.proxy, req.wait_selector, req.network_idle, req.solve_cloudflare)
        html = fetched["html"]
        if fetched["blocked"] or fetched["status"] == 0 or fetched["status"] >= 400:
            return {
                "url": req.url,
                "final_url": fetched["final_url"],
                "status": fetched["status"],
                "blocked": fetched["blocked"],
                "block_reason": fetched["block_reason"],
                "error": fetched["error"],
                "fields": {},
                "elapsed_ms": fetched["elapsed_ms"],
            }
    html, hydrate_src = maybe_hydrate_spa_listing(req.url, html or "")
    started = time.time()
    fields = extract_fields(html, req.url, req.fields, req.adaptive, req.adaptive_domain, req.source_key)
    out: dict[str, Any] = {
        "url": req.url,
        "final_url": fetched["final_url"] if fetched else req.url,
        "status": fetched["status"] if fetched else 200,
        "blocked": False,
        "block_reason": None,
        "error": None,
        "fields": fields,
        "elapsed_ms": (fetched["elapsed_ms"] if fetched else 0) + int((time.time() - started) * 1000),
        "hydrated": hydrate_src,
    }
    if req.include_html:
        out["html"] = html
    if req.include_text:
        try:
            out["text"] = Selector(html, url=req.url).get_all_text(separator="\n", strip=True)[:20000]
        except Exception:  # noqa: BLE001
            out["text"] = ""
    return out


@app.post("/discover")
def discover(req: DiscoverReq):
    d = req.discover or {}
    start_urls: list[str] = d.get("startUrls") or ([d["startUrl"]] if d.get("startUrl") else [])
    if not start_urls:
        raise HTTPException(400, "discover.startUrls required")

    # Tupelo marketplace widgets (KCapex etc.) have no listing <a href>s — use the public API.
    first = start_urls[0]
    org_html = ""
    org_id = parse_tupelo_org_id("", d)
    if not org_id:
        f0 = do_fetch(first, "http", req.timeout_ms, req.proxy, None, False, False)
        org_html = f0.get("html") or ""
        org_id = parse_tupelo_org_id(org_html, d)
    if org_id:
        template = (d.get("tupelo") or {}).get("listingUrlTemplate")
        urls = discover_tupelo_listing_urls(org_id, first, req.max_urls, template)
        log.info("discover tupelo org=%s found=%s", org_id, len(urls))
        return {
            "urls": urls,
            "count": len(urls),
            "pages_fetched": 1 if org_html else 0,
            "blocked": False,
            "block_reason": None,
            "errors": [],
            "pages": [{"page": first, "added": len(urls), "status": 200, "organizationId": org_id}],
            "hydrated": "tupelo",
        }

    link_cfg = d.get("listingLink") or {}
    link_css = link_cfg.get("css")
    link_xpath = link_cfg.get("xpath")
    link_regex = re.compile(link_cfg["regex"], re.I) if link_cfg.get("regex") else None
    url_pattern = re.compile(d["urlPattern"], re.I) if d.get("urlPattern") else None
    pag = d.get("pagination") or {}
    max_pages = int(pag.get("maxPages") or 1)
    next_css = pag.get("css")
    url_template = pag.get("urlTemplate")  # e.g. ".../page/{page}"
    start_page = int(pag.get("startPage") or 1)

    found: list[str] = []
    seen: set[str] = set()
    pages_fetched = 0
    blocked = False
    block_reason = None
    errors: list[str] = []
    samples: list[dict[str, Any]] = []

    def collect(page: Selector, base: str) -> int:
        added = 0
        anchors = []
        try:
            if link_css:
                anchors = page.css(link_css)
            elif link_xpath:
                anchors = page.xpath(link_xpath)
            else:
                anchors = page.css("a[href]")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"listingLink selector error: {exc}")
            return 0
        for a in anchors:
            href = (a.attrib or {}).get("href")
            if not href and a.tag != "a":
                try:
                    inner = a.css("a[href]")
                    href = (inner[0].attrib or {}).get("href") if inner else None
                except Exception:  # noqa: BLE001
                    href = None
            if not href:
                continue
            absu = urljoin(base, href.strip()).split("#")[0]
            if link_regex and not link_regex.search(absu):
                continue
            if url_pattern and not url_pattern.search(absu):
                continue
            if absu in seen:
                continue
            seen.add(absu)
            found.append(absu)
            added += 1
            if len(found) >= req.max_urls:
                break
        return added

    for start in start_urls:
        if len(found) >= req.max_urls or blocked:
            break
        current = start
        for page_no in range(start_page, start_page + max_pages):
            if url_template and page_no > start_page:
                current = url_template.replace("{page}", str(page_no))
            if pages_fetched > 0 and req.rate_limit_ms:
                time.sleep(req.rate_limit_ms / 1000)
            f = do_fetch(current, req.mode, req.timeout_ms, req.proxy, None, req.mode != "http", req.solve_cloudflare)
            pages_fetched += 1
            if f["blocked"]:
                blocked, block_reason = True, f["block_reason"]
                break
            if f["status"] == 0 or f["status"] >= 400 or not f["html"]:
                errors.append(f"{current} -> status {f['status']} {f['error'] or ''}")
                break
            page = Selector(f["html"], url=f["final_url"])
            added = collect(page, f["final_url"])
            samples.append({"page": current, "added": added, "status": f["status"]})
            if len(found) >= req.max_urls:
                break
            if url_template:
                if added == 0:
                    break
                continue
            if next_css and page_no < start_page + max_pages - 1:
                try:
                    nxt = page.css(next_css)
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"pagination selector error: {exc}")
                    break
                href = (nxt[0].attrib or {}).get("href") if nxt else None
                if not href:
                    break
                current = urljoin(f["final_url"], href)
            else:
                break

    log.info("discover found=%s pages=%s blocked=%s", len(found), pages_fetched, block_reason)
    return {
        "urls": found,
        "count": len(found),
        "pages_fetched": pages_fetched,
        "blocked": blocked,
        "block_reason": block_reason,
        "errors": errors,
        "pages": samples,
    }


@app.post("/snapshot")
def snapshot(req: SnapshotReq):
    f = do_fetch(req.url, req.mode, req.timeout_ms, req.proxy, None, req.mode != "http", req.solve_cloudflare)
    if f["status"] == 0 and f["error"]:
        raise HTTPException(502, f"fetch failed: {f['error']}")
    html, hydrate_src = maybe_hydrate_spa_listing(req.url, f["html"] or "")
    title = ""
    text = ""
    try:
        page = Selector(html, url=f["final_url"])
        t = page.css("title")
        title = clean(t[0].text) if t else ""
        text = page.get_all_text(separator="\n", strip=True)[:30000]
    except Exception:  # noqa: BLE001
        pass
    return {
        "url": req.url,
        "final_url": f["final_url"],
        "status": f["status"],
        "blocked": f["blocked"],
        "block_reason": f["block_reason"],
        "title": title,
        "html": sanitize_html(html, f["final_url"]),
        "raw_html": html,
        "text": text,
        "elapsed_ms": f["elapsed_ms"],
        "hydrated": hydrate_src,
    }


def _label_candidates(el) -> list[str]:
    cands: list[str] = []

    def push(s: str):
        s = clean(s).rstrip(":").strip()
        if s and 1 < len(s) <= 60 and s not in cands:
            cands.append(s)

    try:
        prev = el.xpath("preceding-sibling::*[1]")
        if prev:
            push(elem_text(prev[0]))
    except Exception:  # noqa: BLE001
        pass
    try:
        par = el.parent
        if par is not None:
            own = clean(getattr(par, "text", ""))
            push(own)
            pprev = par.xpath("preceding-sibling::*[1]")
            if pprev:
                push(elem_text(pprev[0]))
            # dt/dd or th/td pairs
            if el.tag in ("dd", "td"):
                for p in el.xpath("preceding-sibling::*[self::dt or self::th or self::td][1]"):
                    push(elem_text(p))
    except Exception:  # noqa: BLE001
        pass
    # Inline "Label: value" inside the element itself
    try:
        t = elem_text(el)
        m = re.match(r"^([A-Za-z][A-Za-z /&'()-]{1,40}?)\s*[:\-–]\s*\S", t)
        if m:
            push(m.group(1))
    except Exception:  # noqa: BLE001
        pass
    return cands[:5]


@app.post("/selector")
def selector(req: SelectorReq):
    page = Selector(req.html, url=req.url)
    try:
        els = page.css(req.path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"invalid path selector: {exc}") from exc
    if not els:
        raise HTTPException(404, "element not found for path")
    el = els[0]
    out: dict[str, Any] = {"tag": el.tag, "text": elem_text(el)[:300], "candidates": []}
    for kind, getter in (
        ("css", lambda: el.generate_css_selector),
        ("css_full", lambda: el.generate_full_css_selector),
        ("xpath", lambda: el.generate_xpath_selector),
    ):
        try:
            sel = getter()
            if not sel:
                continue
            # verify uniqueness / match count on this page
            count = len(page.css(sel) if kind.startswith("css") else page.xpath(sel))
            out["candidates"].append({"type": "xpath" if kind == "xpath" else "css", "sel": sel, "matches": count})
        except Exception as exc:  # noqa: BLE001
            out["candidates"].append({"type": kind, "sel": None, "error": str(exc)[:120]})
    out["labels"] = _label_candidates(el)
    attrs = dict(el.attrib or {})
    out["attrs"] = {k: v[:200] for k, v in attrs.items() if k in ("id", "class", "itemprop", "data-field", "data-label", "name")}
    return out
