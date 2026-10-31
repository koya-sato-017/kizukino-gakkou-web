from datetime import date
import unittest

from src.check_token_expiry import check_expiry


class TokenExpiryTests(unittest.TestCase):
    def test_warns_at_30_days_and_after_expiration(self):
        for expiry in ("2026-11-24", "2026-10-25", "2026-10-24"):
            with self.subTest(expiry=expiry), self.assertRaises(ValueError):
                check_expiry(expiry, today=date(2026, 10, 25))

    def test_accepts_31_days_remaining(self):
        self.assertIn("残り31日", check_expiry("2026-11-25", today=date(2026, 10, 25)))

    def test_missing_or_invalid_record_is_not_treated_as_safe(self):
        for value in ("", None, "never", "2026-02-30", "20261025"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                check_expiry(value, today=date(2026, 10, 25))

    def test_github_scheduler_expiration_points_to_the_correct_provider(self):
        settings = {"variable": "SCHEDULER_TOKEN_EXPIRES_ON",
                    "provider": "GitHub", "purpose": "GitHub起動用"}
        with self.assertRaisesRegex(ValueError, "GitHubで更新"):
            check_expiry("2026-11-24", today=date(2026, 10, 25), **settings)
        self.assertIn("GitHub起動用トークン", check_expiry("2026-11-25", today=date(2026, 10, 25), **settings))

    def test_github_scheduler_missing_expiration_is_not_treated_as_safe(self):
        with self.assertRaisesRegex(ValueError, "SCHEDULER_TOKEN_EXPIRES_ON"):
            check_expiry("", today=date(2026, 10, 25),
                         variable="SCHEDULER_TOKEN_EXPIRES_ON", provider="GitHub", purpose="GitHub起動用")
