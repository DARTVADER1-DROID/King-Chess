"""Browser-level worst-case tests for the King Chess feature workspaces.

Run from the repository root after installing requirements-test.txt and Chromium:
    python -m unittest discover -s tests -p 'test_*.py' -v
"""
from pathlib import Path
import os
import subprocess
import time
import unittest

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = os.environ.get("KING_CHESS_TEST_URL", "http://127.0.0.1:4173")


class WorkspaceFunctionalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = subprocess.Popen(
            ["pnpm", "--filter", "@king-chess/web", "exec", "vite", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
        )
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)
        # Wait for Vite to become reachable; fail loudly rather than silently skipping.
        deadline = time.time() + 45
        last_error = None
        while time.time() < deadline:
            try:
                page = cls.browser.new_page()
                page.goto(BASE_URL, wait_until="domcontentloaded", timeout=3000)
                page.close()
                break
            except Exception as exc:
                last_error = exc
                if cls.server.poll() is not None:
                    last_error = f"Vite process exited with code {cls.server.returncode}; last browser error: {exc}"
                    break
                time.sleep(0.5)
        else:
            cls.browser.close()
            cls.playwright.stop()
            cls.server.terminate()
            raise RuntimeError(f"Vite did not start at {BASE_URL}: {last_error}")

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.terminate()
        try:
            cls.server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            cls.server.kill()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1365, "height": 900})
        self.page = self.context.new_page()
        self.page.route("**/api/health", lambda route: route.fulfill(status=200, content_type="application/json", body='{"status":"ok"}'))
        self.page.route("**/api/analysis", lambda route: route.fulfill(status=503, content_type="application/json", body='{"error":"Engine unavailable in UI isolation test"}'))
        self.page.goto(BASE_URL, wait_until="networkidle")
        self.page.get_by_role("navigation", name="Main navigation").wait_for()

    def tearDown(self):
        self.context.close()

    def heading(self):
        return self.page.locator(".page-heading h1").inner_text()

    def test_all_six_pages_render_directly_from_deep_link(self):
        expected = {
            "ai": "Play vs Stockfish.",
            "local": "Local match.",
            "online": "Play online.",
            "analysis": "Position analysis.",
            "history": "Move history.",
            "settings": "Player settings.",
        }
        for route, heading in expected.items():
            with self.subTest(route=route):
                self.page.goto(f"{BASE_URL}/#{route}", wait_until="networkidle")
                self.assertEqual(self.heading(), heading)

    def test_unknown_and_empty_hash_fall_back_to_ai_workspace(self):
        for fragment in ("#garbage", "#/not-a-route", "#", ""):
            self.page.goto(f"{BASE_URL}/{fragment}", wait_until="networkidle")
            self.assertEqual(self.heading(), "Play vs Stockfish.")
            self.assertTrue(self.page.locator(".mode-options").is_visible())

    def test_ai_controls_never_leak_into_other_workspaces(self):
        for route in ("local", "online", "analysis", "history", "settings"):
            self.page.goto(f"{BASE_URL}/#{route}", wait_until="networkidle")
            self.assertEqual(self.page.locator(".mode-options").count(), 0, route)
            self.assertEqual(self.page.get_by_text("AI STRENGTH").count(), 0, route)

    def test_online_lobby_is_exclusive_to_online_workspace(self):
        for route in ("ai", "local", "analysis", "history", "settings"):
            self.page.goto(f"{BASE_URL}/#{route}", wait_until="networkidle")
            self.assertEqual(self.page.locator(".multiplayer-panel").count(), 0, route)
        self.page.goto(f"{BASE_URL}/#online", wait_until="networkidle")
        self.assertEqual(self.page.locator(".multiplayer-panel").count(), 1)
        self.assertTrue(self.page.get_by_role("heading", name="Multiplayer").is_visible())

    def test_analysis_panel_is_exclusive_and_has_all_depth_edges(self):
        for route in ("ai", "local", "online", "history", "settings"):
            self.page.goto(f"{BASE_URL}/#{route}", wait_until="networkidle")
            self.assertEqual(self.page.locator(".analysis-card").count(), 0, route)
        self.page.goto(f"{BASE_URL}/#analysis", wait_until="networkidle")
        self.assertEqual(self.page.locator(".analysis-card").count(), 1)
        for depth in ("Quick", "Standard", "Deep", "Very deep", "Maximum"):
            self.assertEqual(self.page.get_by_role("button", name=depth).count(), 1)

    def test_history_hides_board_but_retains_move_list_workspace(self):
        self.page.goto(f"{BASE_URL}/#history", wait_until="networkidle")
        self.assertEqual(self.page.locator('[aria-label="Chess board"]').count(), 0)
        self.assertEqual(self.page.locator(".game-card").count(), 0)
        self.assertEqual(self.page.locator(".history-card").count(), 1)
        self.assertTrue(self.page.get_by_text("Your moves will appear here.").is_visible())


    def test_settings_save_player_name_and_bot_rating_across_reload(self):
        self.page.goto(f"{BASE_URL}/#settings", wait_until="networkidle")
        self.page.locator(".player-settings input").fill("Test Player")
        rating = self.page.locator(".player-settings select").nth(1)
        rating.select_option("1900")
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.page.locator(".player-settings input").input_value(), "Test Player")
        self.assertEqual(self.page.locator(".player-settings select").nth(1).input_value(), "1900")
        self.assertEqual(self.page.evaluate("localStorage.getItem('king-chess.ai-rating')"), "1900")
        self.assertEqual(self.page.evaluate("localStorage.getItem('king-chess.player-name')"), "Test Player")

    def test_evaluation_bar_preference_is_independent_and_persistent(self):
        self.page.goto(f"{BASE_URL}/#settings", wait_until="networkidle")
        switches = self.page.get_by_role("switch")
        self.assertEqual(switches.count(), 2)
        evaluation_switch = switches.nth(1)
        evaluation_switch.click()
        self.assertEqual(evaluation_switch.get_attribute("aria-checked"), "false")
        self.page.reload(wait_until="networkidle")
        self.assertEqual(self.page.get_by_role("switch").nth(1).get_attribute("aria-checked"), "false")
        self.page.goto(f"{BASE_URL}/#local", wait_until="networkidle")
        self.assertEqual(self.page.locator(".evaluation-bar-column").count(), 0)

    def test_bot_rating_buttons_offer_presets_and_maximum(self):
        self.page.goto(f"{BASE_URL}/#ai", wait_until="networkidle")
        for rating in ("1320", "1500", "1700", "1900", "2100", "2300", "2500", "2800", "3100", "Maximum"):
            self.assertEqual(self.page.get_by_role("button", name=rating, exact=True).count(), 1)
        self.page.get_by_role("button", name="1900", exact=True).click()
        self.assertEqual(self.page.evaluate("localStorage.getItem('king-chess.ai-rating')"), "1900")


    def test_selected_bot_rating_is_sent_to_analysis_endpoint(self):
        payloads = []
        def capture_analysis(route):
            payloads.append(route.request.post_data_json)
            route.fulfill(status=503, content_type="application/json", body='{"error":"Expected test engine failure"}')
        self.page.route("**/api/analysis", capture_analysis)
        self.page.goto(f"{BASE_URL}/#ai", wait_until="networkidle")
        self.page.get_by_role("button", name="1900", exact=True).click()
        self.page.get_by_role("button", name="e2 white pawn").click()
        with self.page.expect_request("**/api/analysis", timeout=5000) as request_info:
            self.page.get_by_role("button", name="e4").click()
        self.assertTrue(payloads, "AI request should be sent after the human move.")
        self.assertEqual(request_info.value.post_data_json["elo"], 1900)
        self.assertEqual(request_info.value.post_data_json["depth"], 22)

    def test_local_move_survives_navigation_to_history_and_back(self):
        self.page.goto(f"{BASE_URL}/#local", wait_until="networkidle")
        self.page.get_by_role("button", name="e2 white pawn").click()
        self.page.get_by_role("button", name="e4").click()
        self.page.get_by_role("button", name="History").click()
        self.assertTrue(self.page.locator(".history-card").get_by_text("e4").is_visible())
        self.page.get_by_role("button", name="Local").click()
        self.assertEqual(self.page.locator(".square").count(), 64)
        self.page.get_by_role("button", name="History").click()
        self.assertTrue(self.page.locator(".history-card").get_by_text("e4").is_visible())

    def test_browser_back_and_forward_keep_route_and_active_heading_in_sync(self):
        self.page.goto(f"{BASE_URL}/#local", wait_until="networkidle")
        self.page.get_by_role("button", name="Analysis").click()
        self.assertEqual(self.heading(), "Position analysis.")
        self.page.go_back()
        self.page.wait_for_function("location.hash === '#local'")
        self.assertEqual(self.heading(), "Local match.")
        self.page.go_forward()
        self.page.wait_for_function("location.hash === '#analysis'")
        self.assertEqual(self.heading(), "Position analysis.")

    def test_every_board_square_is_accessible_and_board_has_exactly_64_squares(self):
        self.page.goto(f"{BASE_URL}/#local", wait_until="networkidle")
        squares = self.page.locator('[aria-label^="a"], [aria-label^="b"], [aria-label^="c"], [aria-label^="d"], [aria-label^="e"], [aria-label^="f"], [aria-label^="g"], [aria-label^="h"]')
        self.assertEqual(squares.count(), 64)
        self.assertEqual(self.page.locator('[aria-label="Chess board"] button').count(), 64)

    def test_mobile_navigation_and_board_remain_inside_viewport(self):
        self.page.set_viewport_size({"width": 320, "height": 740})
        self.page.goto(f"{BASE_URL}/#local", wait_until="networkidle")
        self.assertTrue(self.page.locator(".app-nav").is_visible())
        board = self.page.locator(".board-frame").bounding_box()
        self.assertIsNotNone(board)
        self.assertGreater(board["width"], 200)
        self.assertLessEqual(board["x"] + board["width"], 320.5)
        # Horizontal scrolling is allowed inside the nav, but not on the document.
        self.assertLessEqual(
            self.page.evaluate("document.documentElement.scrollWidth"),
            self.page.evaluate("document.documentElement.clientWidth") + 1,
        )

    def test_repeated_route_switching_does_not_duplicate_navigation_or_board(self):
        for _ in range(5):
            for route in ("ai", "local", "online", "analysis", "history", "settings"):
                self.page.goto(f"{BASE_URL}/#{route}", wait_until="domcontentloaded")
                self.assertEqual(self.page.locator(".app-nav").count(), 1)
                self.assertEqual(self.page.locator(".page-heading").count(), 1)
                if route in ("history", "settings"):
                    self.assertEqual(self.page.locator('[aria-label="Chess board"]').count(), 0)
                else:
                    self.assertEqual(self.page.locator('[aria-label="Chess board"]').count(), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
