from pathlib import Path
import unittest

from src.check_web_security import check_headers
from src.export_web_data import ExportError


class SecurityHeaderTests(unittest.TestCase):
    def setUp(self):
        # Cloudflareへ配布する設定を、実際のHTTPレスポンスと同じ形で検査する。
        self.headers = {}
        lines = (Path(__file__).parents[1] / "web/public/_headers").read_text().splitlines()
        for line in lines[1:]:
            if not line.startswith(" "):
                break
            name, value = line.strip().split(":", 1)
            self.headers[name] = value.strip()

    def test_deployed_policy_accepts_only_expected_capabilities(self):
        self.assertIn("正常", check_headers(self.headers))

    def test_missing_enforced_policy_does_not_pass_report_only(self):
        self.headers["Content-Security-Policy-Report-Only"] = self.headers.pop("Content-Security-Policy")
        with self.assertRaises(ExportError):
            check_headers(self.headers)

    def test_inline_script_external_script_and_any_media_are_detected(self):
        for old, new in (("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
                         ("script-src 'self'", "script-src 'self' https:"),
                         ("media-src https://cdncf.stand.fm", "media-src https:"),
                         ("frame-ancestors 'none'", "frame-ancestors 'self'")):
            with self.subTest(new=new):
                headers = dict(self.headers)
                headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace(old, new)
                with self.assertRaises(ExportError):
                    check_headers(headers)

    def test_missing_permissions_or_embedding_protection_is_detected(self):
        for name in ("Permissions-Policy", "X-Frame-Options"):
            with self.subTest(name=name):
                headers = dict(self.headers)
                del headers[name]
                with self.assertRaises(ExportError):
                    check_headers(headers)
