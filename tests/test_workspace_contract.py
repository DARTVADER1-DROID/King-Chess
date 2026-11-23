"""Fast, deterministic contract tests for the King Chess workspace shell.

These tests deliberately inspect the current React implementation's public
workspace contract. Browser behaviour is covered separately in test_ui_functional.py.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "apps/web/src/App.tsx").read_text(encoding="utf-8")
CSS = (ROOT / "apps/web/src/style.css").read_text(encoding="utf-8")


class WorkspaceContractTests(unittest.TestCase):
    def test_all_supported_workspaces_are_explicitly_whitelisted(self):
        match = re.search(r'\[("ai"\s*,\s*"local"\s*,\s*"online"\s*,\s*"analysis"\s*,\s*"history")\s*\]', APP)
        self.assertIsNotNone(match, "Route whitelist must contain exactly the six supported pages.")

    def test_unknown_hash_falls_back_to_ai(self):
        self.assertRegex(APP, r'PAGE_FROM_HASH\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\?\s*value as AppPage\s*:\s*"ai"')

    def test_hash_navigation_listener_is_removed_on_unmount(self):
        self.assertIn('window.addEventListener("hashchange", sync)', APP)
        self.assertIn('window.removeEventListener("hashchange", sync)', APP)

    def test_ai_controls_are_scoped_to_ai_workspace(self):
        self.assertIn('{page === "ai" && <section className="mode-options">', APP)
        self.assertIn('if (page !== "ai" || mode !== "ai"', APP)

    def test_online_lobby_is_scoped_to_online_workspace(self):
        self.assertIn('{page === "online" && <section className="multiplayer-panel">', APP)

    def test_history_hides_board_and_current_game_card(self):
        self.assertIn('{page !== "history" && <div className="board-column">', APP)
        self.assertIn('{page !== "history" && <section className="side-card game-card">', APP)
        self.assertIn('{page === "history" && <section className="side-card moves-card history-card">', APP)

    def test_analysis_panel_is_scoped_to_analysis_workspace(self):
        self.assertIn('{page === "analysis" && <section className="side-card analysis-card">', APP)

    def test_navigation_has_accessible_landmark_and_board_has_accessible_squares(self):
        self.assertIn('<nav className="app-nav" aria-label="Main navigation">', APP)
        self.assertIn('aria-label={`${square}', APP)
        self.assertIn('role="group" aria-label="Chess board"', APP)


    def test_settings_workspace_is_registered_and_uses_modular_component(self):
        self.assertIn('"settings"', APP)
        self.assertIn('PlayerSettings', APP)
        self.assertIn('{page === "settings" && <PlayerSettings', APP)

    def test_bot_rating_is_sent_as_elo_and_uses_centralized_presets(self):
        self.assertIn('body: JSON.stringify({ fen, depth: 22, ...(aiRating === null ? {} : { elo: aiRating }) })', APP)
        self.assertIn('AI_RATING_OPTIONS', APP)

    def test_evaluation_bar_is_separate_and_visibility_is_independent(self):
        self.assertIn('import EvaluationBar from "./components/EvaluationBar.js"', APP)
        self.assertIn('{evaluationBarEnabled && (', APP)
        self.assertIn('onEvaluationBarEnabledChange={setEvaluationBarEnabled}', APP)

    def test_player_settings_and_rating_presets_are_separate_modules(self):
        self.assertTrue((ROOT / "apps/web/src/components/PlayerSettings.tsx").is_file())
        self.assertTrue((ROOT / "apps/web/src/lib/aiRatings.ts").is_file())

    def test_navigation_can_scroll_on_narrow_screens_without_forcing_layout_width(self):
        self.assertRegex(CSS, r'\.app-nav\s*\{[^}]*overflow-x:\s*auto')
        self.assertRegex(CSS, r'@media\s*\(max-width:\s*700px\)')

    def test_history_layout_uses_single_column(self):
        self.assertRegex(CSS, r'\.history-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)')


if __name__ == "__main__":
    unittest.main(verbosity=2)
