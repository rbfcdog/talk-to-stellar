from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("sdd.py")
SPEC = importlib.util.spec_from_file_location("sdd", MODULE_PATH)
assert SPEC and SPEC.loader
sdd = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sdd)


class SddWorkflowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        (self.root / "AGENTS.md").write_text("# Test repository\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def approve(self, spec_path: Path) -> None:
        content = spec_path.read_text(encoding="utf-8")
        spec_path.write_text(content.replace("status: draft", "status: approved", 1), encoding="utf-8")

    def test_create_approved_spec_and_issue(self) -> None:
        spec_path = sdd.create_spec(self.root, "checkout-security", "Checkout Security")
        self.approve(spec_path)
        issue_path = sdd.create_issue(self.root, str(spec_path), "persist-payment", "Persist Payment")

        self.assertEqual(issue_path.name, "001-persist-payment.md")
        self.assertEqual(sdd.validate_repository(self.root), [])
        self.assertIn("ISS-001", sdd.status_markdown(self.root))

    def test_draft_spec_cannot_create_issue(self) -> None:
        spec_path = sdd.create_spec(self.root, "draft")

        with self.assertRaisesRegex(sdd.SddError, "status: approved"):
            sdd.create_issue(self.root, str(spec_path), "not-allowed")

    def test_planned_issue_requires_plan_section(self) -> None:
        spec_path = sdd.create_spec(self.root, "workflow")
        self.approve(spec_path)
        issue_path = sdd.create_issue(self.root, str(spec_path), "missing-plan")
        content = issue_path.read_text(encoding="utf-8")
        issue_path.write_text(content.replace("status: pending", "status: planned", 1), encoding="utf-8")

        errors = sdd.validate_repository(self.root)
        self.assertTrue(any("requires a '## Plan' section" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
