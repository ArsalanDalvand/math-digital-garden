"""Real agent-browser journey; synthetic users/data only on isolated 4322/8002.
Run: .venv/bin/python tests/browser/account-settings.py [evidence-directory]
No cookies, database credentials or production data are read or saved.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

from PIL import Image

BASE = "http://127.0.0.1:4322"
SESSION = "account-acceptance-" + uuid4().hex[:10]
EVIDENCE = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/account-settings-evidence")
EVIDENCE.mkdir(parents=True, exist_ok=True)
EMAIL = "account-browser-" + uuid4().hex[:12] + "@example.org"
PASSWORD = "synthetic-browser-password-2026"
NEW_PASSWORD = "synthetic-replacement-password-2026"
ENV = {key: value for key, value in os.environ.items() if key != "LD_PRELOAD"}


def browser(*args):
    result = subprocess.run(
        ["agent-browser", "--session", SESSION, *args],
        env=ENV,
        capture_output=True,
        text=True,
        timeout=40,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout


def evaluate(script):
    response = json.loads(browser("eval", "--json", script))
    assert response["success"], response.get("error")
    return response["data"]["result"]


def wait(script):
    browser("wait", "--fn", script)


def open_page(path, settings=False):
    browser("open", BASE + path)
    if settings:
        wait('!document.querySelector("[data-settings-content]").hidden')
    (EVIDENCE / "last-snapshot.txt").write_text(browser("snapshot", "-i"))


def save_form(kind):
    browser("click", f"[data-settings-form={kind}] button[type=submit]")
    wait(
        f'document.querySelector("[data-settings-form={kind}] [data-form-status]")'
        '.textContent.includes("ذخیره شد")'
    )


try:
    print("Checking synthetic signup and profile", flush=True)
    open_page("/account")
    browser("check", "#auth-register")
    browser("fill", "#auth-email", EMAIL)
    browser("fill", "#auth-password", PASSWORD)
    browser("fill", "#auth-name", "آزمون حساب مرورگر")
    browser("click", "[data-auth-form] button[type=submit]")
    wait('document.querySelector("[data-auth-form]").hidden')
    open_page("/settings/account/profile", True)
    browser("fill", "#profile-name", "نام ماندگار مرورگر")
    save_form("profile")
    with tempfile.TemporaryDirectory() as temporary:
        image = Path(temporary) / "synthetic.png"
        Image.new("RGB", (64, 64), (47, 90, 74)).save(image)
        browser("upload", "#avatar-file", str(image))
        wait('document.querySelector("[data-avatar-status]").textContent.includes("ذخیره شد")')
    browser("reload")
    wait('document.querySelector("[data-avatar-preview]").naturalWidth===64')
    assert evaluate('document.querySelector("#profile-name").value') == "نام ماندگار مرورگر"
    wait("!!document.querySelector('[aria-label] img.account-avatar')")
    assert evaluate(
        "Array.from(document.querySelectorAll('a[href=\"/review\"]')).every(a=>!a.getBoundingClientRect().height)"
    )
    browser("set", "viewport", "390", "844")
    browser("screenshot", str(EVIDENCE / "profile-mobile.png"))
    audit = json.loads(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json"))
    assert audit["data"]["counts"]["violations"] == 0
    (EVIDENCE / "profile-a11y.json").write_text(json.dumps(audit, ensure_ascii=False))
    print("Checking persisted preferences and mobile accessibility", flush=True)
    open_page("/settings/account/preferences", True)
    browser("select", "#preference-theme", "dark")
    browser("select", "#preference-width", "960")
    browser("select", "#preference-mode", "edit")
    browser("uncheck", "[name=fixed_toolbar]")
    save_form("preferences")
    browser("reload")
    wait('!document.querySelector("[data-settings-content]").hidden')
    assert evaluate(
        '({theme:document.documentElement.dataset.theme,width:document.querySelector("[name=width]").value,mode:document.querySelector("[name=default_mode]").value,toolbar:document.querySelector("[name=fixed_toolbar]").checked})'
    ) == {"theme": "dark", "width": "960", "mode": "edit", "toolbar": False}
    assert evaluate("document.documentElement.scrollWidth<=innerWidth")
    browser("screenshot", str(EVIDENCE / "preferences-mobile.png"))
    audit = json.loads(browser("a11y", "--tags", "wcag2a,wcag2aa", "--json"))
    assert audit["data"]["counts"]["violations"] == 0
    (EVIDENCE / "preferences-a11y.json").write_text(json.dumps(audit, ensure_ascii=False))
    # Authorized synthetic fixture creation; all profile/preferences changes use actual UI forms.
    item = evaluate("""
        fetch('/api/library/items', {
          method:'POST',
          headers:{'Content-Type':'application/json','X-Requested-With':'MathGarden'},
          body:JSON.stringify({kind:'note',title:'Preference browser',content:'# Test\\n\\n$x$'})
        }).then(async response=>{
          if(!response.ok)throw new Error('Fixture creation failed');
          return response.json();
        }).then(value=>({id:value.id}))
    """)
    print("Checking default edit mode, toolbar and reading sync", flush=True)
    note_path = "/library/" + item["id"]
    open_page(note_path)
    wait('!!document.querySelector(".cm-editor")')
    assert evaluate(
        'document.querySelector("[data-edit]").getAttribute("aria-pressed")==="true"&&document.querySelector("[data-editor-toolbar]").hidden'
    )
    open_page("/settings/account/preferences", True)
    browser("check", "[name=fixed_toolbar]")
    save_form("preferences")
    open_page(note_path)
    wait(
        '!!document.querySelector(".cm-editor")&&!document.querySelector("[data-editor-toolbar]").hidden'
    )
    assert evaluate("document.documentElement.scrollWidth<=innerWidth")
    browser("screenshot", str(EVIDENCE / "toolbar-mobile.png"))
    # Verify reading controls round-trip through persisted account preferences.
    browser("click", ".reading-settings summary")
    browser("select", '[data-reading-setting="width"]', "620")
    wait(
        'document.querySelector("[data-reading-save-status]")'
        '.textContent.includes("در حساب ذخیره شد")'
    )
    browser("reload")
    wait('document.querySelector("[data-reading-setting=width]").value==="620"')
    open_page("/settings/account/profile", True)
    print("Checking email/password changes and login", flush=True)
    changed_email = "changed-" + EMAIL
    browser("fill", "#profile-email", changed_email)
    browser("fill", "#email-password", PASSWORD)
    save_form("email")
    browser("fill", "#current-password", PASSWORD)
    browser("fill", "#new-password", NEW_PASSWORD)
    browser("fill", "#confirm-password", "different-synthetic-password")
    browser("click", "[data-settings-form=password] button[type=submit]")
    assert evaluate('!document.querySelector("#confirm-password").validity.valid')
    browser("fill", "#confirm-password", NEW_PASSWORD)
    save_form("password")
    open_page("/account")
    wait('!document.querySelector("[data-logout]").hidden')
    browser("click", "[data-logout]")
    wait('!document.querySelector("[data-auth-form]").hidden')
    browser("fill", "#auth-email", changed_email)
    browser("fill", "#auth-password", NEW_PASSWORD)
    browser("click", "[data-auth-form] button[type=submit]")
    wait('document.querySelector("[data-auth-form]").hidden')
    print("Checking cross-tab logout and identity revalidation", flush=True)
    browser("tab", "new", BASE + "/settings/account/profile")
    wait('!document.querySelector("[data-settings-content]").hidden')
    browser("tab", "t1")
    browser("click", "[data-logout]")
    wait('!document.querySelector("[data-auth-form]").hidden')
    browser("tab", "t2")
    wait('document.querySelector("[data-settings-content]").hidden')
    assert evaluate(
        'document.querySelector("[data-settings-loading]").textContent.includes("حساب تغییر")'
    )
    browser("screenshot", str(EVIDENCE / "cross-tab-logout.png"))
    (EVIDENCE / "result.json").write_text(
        json.dumps(
            {
                "passed": True,
                "origin": BASE,
                "synthetic": True,
                "checks": [
                    "profile persistence",
                    "avatar persistence",
                    "student role visibility",
                    "mobile layout",
                    "WCAG audit",
                    "preferences persistence",
                    "default edit",
                    "toolbar preference",
                    "reading preference sync",
                    "email change",
                    "password confirmation",
                    "password change and login",
                    "cross-tab logout identity revalidation",
                ],
            },
            indent=2,
        )
    )
    print("Account browser journey passed; evidence:", EVIDENCE)
except Exception:
    browser("screenshot", str(EVIDENCE / "failure.png"))
    (EVIDENCE / "failure-console.txt").write_text(browser("console"))
    (EVIDENCE / "failure-overlay.txt").write_text(
        browser(
            "eval",
            'document.querySelector("vite-error-overlay")?.shadowRoot?.textContent'
            '.slice(-5000)||"no overlay"',
        )
    )
    raise
finally:
    browser("close")
