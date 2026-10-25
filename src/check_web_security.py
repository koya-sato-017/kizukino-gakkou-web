"""公開HTMLにセキュリティヘッダーが適用されていることを確認する。"""

import argparse
import sys
import time

import requests

from src.export_web_data import ExportError, make_session


def check_headers(headers):
    headers = {key.lower(): value for key, value in headers.items()}
    policy = {}
    for directive in headers.get("content-security-policy", "").split(";"):
        parts = directive.split()
        if parts:
            if parts[0] in policy:
                raise ExportError("CSPに重複した指定があります")
            policy[parts[0]] = set(parts[1:])
    required = {
        "default-src": {"'none'"},
        "script-src": {"'self'"},
        "style-src": {"'self'"},
        "style-src-attr": {"'none'"},
        "object-src": {"'none'"},
        "base-uri": {"'none'"},
        "frame-ancestors": {"'none'"},
        "form-action": {"'none'"},
        "connect-src": {"'self'"},
        "media-src": {"https://cdncf.stand.fm"},
    }
    for name, sources in required.items():
        if policy.get(name) != sources:
            raise ExportError(f"公開HTMLのCSP ({name}) が未設定か、許可範囲が変わっています")
    for name, value in {"x-frame-options": "DENY", "x-content-type-options": "nosniff",
                        "referrer-policy": "no-referrer"}.items():
        if headers.get(name, "").lower() != value.lower():
            raise ExportError(f"公開HTMLの{name}が不正です")
    permissions = {item.strip() for item in headers.get("permissions-policy", "").split(",")}
    if not {"camera=()", "microphone=()", "geolocation=()"}.issubset(permissions):
        raise ExportError("カメラ・マイク・位置情報の利用制限がありません")
    return "正常: CSP・埋め込み禁止・ブラウザー権限制限を確認"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="https://kizukino-gakkou.pages.dev/")
    parser.add_argument("--attempts", type=int, default=1)
    parser.add_argument("--delay", type=float, default=15)
    args = parser.parse_args(argv)
    if not args.url.startswith(("https://", "http://")) or args.attempts < 1:
        parser.error("HTTP(S) URLと1以上の試行回数を指定してください")
    with make_session() as session:
        for attempt in range(args.attempts):
            try:
                response = session.get(args.url, params={"securitycheck": time.time_ns()}, timeout=(10, 30))
                response.raise_for_status()
                if "text/html" not in response.headers.get("Content-Type", ""):
                    raise ExportError("公開URLがHTMLを返していません")
                print(check_headers(response.headers))
                return 0
            except (requests.RequestException, ExportError) as error:
                print(f"保護設定の確認 {attempt + 1}/{args.attempts}: {error}", file=sys.stderr, flush=True)
                if attempt + 1 < args.attempts:
                    time.sleep(args.delay)
    return 1


if __name__ == "__main__":
    sys.exit(main())
