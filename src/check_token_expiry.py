"""公開・定期起動トークンの更新期限を、秘密値を使わずに確認する。"""

import argparse
from datetime import date, datetime, timezone
import os
import sys


def check_expiry(value, today=None, warning_days=30, *,
                 variable="CLOUDFLARE_TOKEN_EXPIRES_ON", provider="Cloudflare", purpose="公開"):
    today = today or datetime.now(timezone.utc).date()
    try:
        expires = date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValueError(f"{variable}にYYYY-MM-DD形式の実際の失効日を設定してください") from None
    if expires.isoformat() != value:
        raise ValueError("失効日はYYYY-MM-DD形式で設定してください")
    remaining = (expires - today).days
    if remaining <= warning_days:
        raise ValueError(f"{purpose}トークンの失効日: {expires} (残り{remaining}日)。{provider}で更新し、Secretと期限変数を更新してください")
    return f"{purpose}トークンの失効日: {expires} (残り{remaining}日)"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--github-scheduler", action="store_true",
                        help="CloudflareからGitHubを起動するトークンの期限を確認")
    args = parser.parse_args()
    settings = ({"variable": "SCHEDULER_TOKEN_EXPIRES_ON", "provider": "GitHub", "purpose": "GitHub起動用"}
                if args.github_scheduler else {})
    variable = settings.get("variable", "CLOUDFLARE_TOKEN_EXPIRES_ON")
    try:
        print(check_expiry(os.environ.get(variable, ""), **settings))
        return 0
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
