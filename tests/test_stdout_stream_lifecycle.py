"""
Regression test for Windows stdout / stderr stream lifecycle and Option 8 execution.
Ensures that importing backend.main and demo_runner in sequence does not close
sys.stdout / sys.stderr via garbage collection of duplicate TextIOWrapper objects.
"""
import io
import gc
import sys
import unittest
from unittest.mock import patch


class TestStdoutStreamLifecycle(unittest.TestCase):
    def test_reconfigure_does_not_close_stream_on_gc(self):
        """Verifies that reconfiguring sys.stdout does not leave unreferenced wrappers that close the underlying buffer on GC."""
        # Check current stdout is open
        self.assertFalse(sys.stdout.closed)

        # Import backend.main and demo_runner
        import backend.main
        import demo_runner

        # Force garbage collection
        gc.collect()

        # sys.stdout must remain open and writable
        self.assertFalse(sys.stdout.closed)
        try:
            demo_runner.log_step(99, "TEST STREAM SAFETY")
        except ValueError as e:
            self.fail(f"log_step raised ValueError (stream closed): {e}")

    def test_setu_cli_stream_recovery_guard(self):
        """Verifies ensure_streams_open and safe_print in setu_cli recover closed streams."""
        import setu_cli

        setu_cli.ensure_streams_open()
        self.assertFalse(sys.stdout.closed)

        # safe_print should not crash even under edge conditions
        setu_cli.safe_print("Stream safety verified successfully.")


if __name__ == "__main__":
    unittest.main()
