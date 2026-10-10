"""
cli.py — Legacy CLI Compatibility Wrapper
==========================================
Redirects to the canonical, hardened SETU Command Center (setu_cli.py).
Maintains backward compatibility for team members and demo scripts.
"""

import sys
import setu_cli

if __name__ == "__main__":
    print("ℹ️  [SETU CLI] Redirecting to unified Command Center (setu_cli.py)...\n")
    try:
        setu_cli.main()
    except KeyboardInterrupt:
        sys.exit(0)