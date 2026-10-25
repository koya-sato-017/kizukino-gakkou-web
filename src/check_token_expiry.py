"""Cloudflare公開トークンの更新期限を、秘密値を使わずに確認する。"""

import argparse
from datetime import date, datetime, timezone
import os
import sys


def check_expiry(value, today=None, warning_days=30):
    today = today or datetime.now(timezone.utc).date()
    try:
        expires = date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValueError("CLOUDFLARE_TOKEN_EXPIRES_ONにYYYY-MM-DD形式の実際の失効日を設定してください") from None
    if expires.isoformat() != value:
        raise ValueError("失効日はYYYY-MM-DD形式で設定してください")
    remaining = (expires - today).days
    if remaining <= warning_days:
        raise ValueError(f"公開トークンの失効日: {expires} (残り{remaining}日)。Cloudflareで更新し、Secretと期限変数を更新してください")
    return f"公開トークンの失効日: {expires} (残り{remaining}日)"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    try:
        print(check_expiry(os.environ.get("CLOUDFLARE_TOKEN_EXPIRES_ON", "")))
        return 0
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
