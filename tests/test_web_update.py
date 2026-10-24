"""通信障害や配信状態の変更で公開データを壊さないことを検証する。"""

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import requests

from src import export_web_data as exporter
from src.check_web_site import check_data


def node(number=1, **changes):
    value = {"episodeId": f"{number:024x}", "title": f"放送{number}", "totalDuration": 60000,
             "publishedAt": 1767223800000, "isSupporterOnly": False}
    value.update(changes)
    return value


def page(nodes, more=False, cursor=None):
    response = Mock()
    response.json.return_value = {"data": {"node": {"episodes": {
        "edges": [{"node": value} for value in nodes],
        "pageInfo": {"endCursor": cursor, "hasNextPage": more},
    }}}}
    return response


def episode(number=1):
    return {"id": f"{number:024x}", "title": f"放送{number}", "published": "2026-01-01",
            "published_at": "2026-01-01T09:00:00+09:00", "duration_ms": 60000,
            "is_supporter_only": False, "link": f"https://stand.fm/episodes/{number:024x}"}


class FetchTests(unittest.TestCase):
    def test_partial_pagination_failure_does_not_return_partial_list(self):
        client = Mock()
        client.post.side_effect = [page([node()], True, "next"), requests.Timeout("通信停止")]
        with self.assertRaises(requests.Timeout):
            exporter.fetch_all_episodes_graphql(exporter.DEFAULT_CHANNEL, session=client)

    def test_graphql_errors_even_with_http_200_abort(self):
        client = Mock()
        response = Mock()
        response.json.return_value = {"errors": [{"message": "一時障害"}]}
        client.post.return_value = response
        with self.assertRaises(exporter.ExportError):
            exporter.fetch_all_episodes_graphql(exporter.DEFAULT_CHANNEL, session=client)

    def test_repeated_cursor_aborts(self):
        client = Mock()
        client.post.side_effect = [page([node()], True, "same"), page([node(2)], True, "same")]
        with self.assertRaises(exporter.ExportError):
            exporter.fetch_all_episodes_graphql(exporter.DEFAULT_CHANNEL, session=client)

    def test_duplicate_id_aborts(self):
        client = Mock()
        client.post.return_value = page([node(), node()])
        with self.assertRaises(exporter.ExportError):
            exporter.fetch_all_episodes_graphql(exporter.DEFAULT_CHANNEL, session=client)

    def test_timezone_and_same_day_order_are_explicit(self):
        client = Mock()
        client.post.return_value = page([node(), node(2, publishedAt=1767227400000)])
        result = exporter.fetch_all_episodes_graphql(exporter.DEFAULT_CHANNEL, session=client)
        self.assertEqual(result[0]["id"], node(2)["episodeId"])
        self.assertEqual(result[0]["published"], "2026-01-01")
        self.assertTrue(result[0]["published_at"].endswith("+09:00"))

    def test_unknown_membership_state_aborts(self):
        client = Mock()
        client.post.return_value = page([node(isSupporterOnly=None)])
        with self.assertRaises(exporter.ExportError):
            exporter.fetch_all_episodes_graphql(exporter.DEFAULT_CHANNEL, session=client)


class SnapshotTests(unittest.TestCase):
    def test_empty_or_large_loss_is_not_published(self):
        previous = {"episodes": [episode(i) for i in range(100)]}
        for current in ([], [episode()]):
            with self.assertRaises(exporter.ExportError):
                exporter.validate_snapshot(current, previous)

    def test_small_confirmed_removal_is_allowed(self):
        exporter.validate_snapshot([episode(1)], {"episodes": [episode(1), episode(2)]})

    def test_older_latest_requires_explicit_override(self):
        previous = {"episodes": [{**episode(), "published": "2026-01-02"}]}
        with self.assertRaises(exporter.ExportError):
            exporter.validate_snapshot([episode()], previous)
        exporter.validate_snapshot([episode()], previous, allow_large_removal=True)

    def test_failed_write_keeps_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "episodes.json"
            path.write_text('{"original": true}')
            with patch.object(exporter.os, "replace", side_effect=OSError("書込失敗")):
                with self.assertRaises(OSError):
                    exporter.atomic_write(path, {"new": True})
            self.assertEqual(json.loads(path.read_text()), {"original": True})
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_failed_fetch_leaves_output_untouched_and_exits_nonzero(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "episodes.json"
            old = {"channel_id": exporter.DEFAULT_CHANNEL, "episodes": [episode()]}
            path.write_text(json.dumps(old))
            with patch.object(exporter, "fetch_all_episodes_graphql", side_effect=requests.Timeout()):
                result = exporter.main(["--channel", exporter.DEFAULT_CHANNEL, "--output", str(path)])
            self.assertEqual(result, 1)
            self.assertEqual(json.loads(path.read_text()), old)

    def test_preview_cannot_overwrite_production(self):
        with self.assertRaises(SystemExit) as result:
            exporter.main(["--limit", "1"])
        self.assertEqual(result.exception.code, 2)


class DetailTests(unittest.TestCase):
    def test_membership_conversion_clears_cached_content(self):
        old = {"episodes": [{**episode(), "audio_url": "https://example.com/audio.m4a", "description": "旧概要"}]}
        current = [{**episode(), "is_supporter_only": True}]
        result, _ = exporter.refresh_details(current, old)
        self.assertIsNone(result[0]["audio_url"])
        self.assertEqual(result[0]["description"], "")

    def test_all_detail_requests_failing_abort(self):
        with patch.object(exporter, "fetch_episode_details", side_effect=lambda ep: {**ep, "details_status": "retry"}):
            with self.assertRaises(exporter.ExportError):
                exporter.refresh_details([episode()], None)

    def test_attribute_order_and_single_quotes(self):
        parser = exporter.EpisodeHTML()
        parser.feed("<meta content='概要 &amp; 続き' property='og:description'><audio src='https://example.com/a.m4a'>")
        self.assertEqual(parser.description, "概要 & 続き")
        self.assertEqual(parser.audio_url, "https://example.com/a.m4a")

    def test_detail_failure_retains_previous_audio_and_description(self):
        cached = {**episode(), "audio_url": "https://example.com/a.m4a", "description": "正常な概要"}
        client = Mock()
        client.__enter__ = Mock(return_value=client)
        client.__exit__ = Mock(return_value=False)
        client.get.side_effect = requests.Timeout()
        with patch.object(exporter, "make_session", return_value=client):
            result = exporter.fetch_episode_details(cached)
        self.assertEqual(result["audio_url"], cached["audio_url"])
        self.assertEqual(result["description"], cached["description"])
        self.assertEqual(result["details_status"], "retry")


class HealthTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 24, 0, tzinfo=timezone.utc)
        self.data = {"channel_id": exporter.DEFAULT_CHANNEL, "updated_at": self.now.isoformat(),
                     "episodes": [{**episode(), "published_at": self.now.isoformat()}]}

    def test_fresh_snapshot_passes(self):
        self.assertIn("正常", check_data(self.data, now=self.now))

    def test_stopped_updater_is_detected(self):
        with self.assertRaises(exporter.ExportError):
            check_data(self.data, now=self.now + timedelta(hours=4))

    def test_no_new_public_episode_is_detected_despite_fresh_fetch(self):
        self.data["episodes"][0]["published_at"] = (self.now - timedelta(days=4)).isoformat()
        with self.assertRaises(exporter.ExportError):
            check_data(self.data, now=self.now)

    def test_stale_cdn_snapshot_is_detected(self):
        expected = {**self.data, "updated_at": (self.now + timedelta(minutes=1)).isoformat()}
        with self.assertRaises(exporter.ExportError):
            check_data(self.data, expected=expected, now=self.now)

    def test_partial_detail_failures_are_detected(self):
        with self.assertRaises(exporter.ExportError):
            check_data({**self.data, "detail_failures": 2}, now=self.now)


if __name__ == "__main__":
    unittest.main()
