"""Run from any directory with Playwright and Chromium installed."""
import json
import shutil
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "version.json").read_text())["version"]


def check_budget(page, base, name):
    # Expose selected calculations only in this isolated browser response.
    source = (ROOT / name).read_text()
    marker = "const APP_VERSION="
    assert source.count(marker) == 1
    source = source.replace(marker, """
    window.budgetTest = {data, nearestPayday, creditOutstanding,
                         mortgageDistributionBase, transferDelta};
    """ + marker)
    page.route(base + name, lambda route: route.fulfill(body=source, content_type="text/html"))
    page.goto(base + name)
    assert page.locator("#appVersion").text_content() == VERSION
    result = page.evaluate("""() => {
      const {data, nearestPayday, creditOutstanding, mortgageDistributionBase, transferDelta}=budgetTest;
      data.payDays={advance:16,salary:1};
      data.receipts=[];
      const now=new Date(2026,10,16);
      const before=nearestPayday(now);
      data.receipts.push({id:'2026-11-advance',amount:25000});
      const after=nearestPayday(now);
      data.receipts.pop();
      const undone=nearestPayday(now);
      data.debt=30000;
      data.regularPayments=[{target:'credit',amount:5000}];
      data.earlyRepayments=[{target:'credit',amount:3000}];
      data.transfers=[{from:'family',to:'savings',amount:1000,date:'2026-11-16'}];
      data.months['2026-11']={mortgage:55000};
      data.receipts=['advance','salary'].map((type,i)=>({id:'2026-11-'+type,amount:[50000,60000][i]}));
      const mortgage=mortgageDistributionBase('2026-11');
      return [before.type,after.type,after.date.getDate(),after.date.getMonth(),undone.type,
              creditOutstanding(),mortgage.advance,mortgage.salary,
              transferDelta('family','2026-11-01'),transferDelta('savings','2026-11-01')];
    }""")
    assert result == ["advance", "salary", 1, 11, "advance", 22000, 25000, 30000, -1000, 1000], result


def check_cache(browser, base):
    context = browser.new_context()
    page = context.new_page()
    page.goto(base + "index.html")
    page.wait_for_function("!!navigator.serviceWorker.controller")
    names = ["preview.html", "preview-real-1582.html", "preview-goal-1580.html"]
    for name in names:
        page.goto(base + name)
    context.set_offline(True)
    for name in ["index.html", *names, ""]:
        response = page.goto(base + name)
        assert response.from_service_worker
        assert response.body() == (ROOT / (name or "index.html")).read_bytes(), name
    context.close()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=ROOT))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=shutil.which("chromium"))
            for name in ["index.html", "preview.html"]:
                context = browser.new_context(service_workers="block")
                check_budget(context.new_page(), base, name)
                context.close()
            check_cache(browser, base)
            browser.close()
    finally:
        server.shutdown()
    print("Budget and offline checks passed")
