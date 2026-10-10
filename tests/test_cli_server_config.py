import os
import unittest
from unittest.mock import MagicMock, patch
import requests

from setu_cli import (
    resolve_api_url,
    normalize_url,
    parse_error_response,
    safe_request,
    check_backend_status,
    DEFAULT_BASE_URL,
)


class TestCliServerConfig(unittest.TestCase):
    """Tests for CLI server detection, URL normalization, precedence, and error parsing."""

    def test_url_normalization_trailing_slashes(self):
        self.assertEqual(normalize_url("http://127.0.0.1:8000/"), "http://127.0.0.1:8000")
        self.assertEqual(normalize_url("http://127.0.0.1:8000///"), "http://127.0.0.1:8000")
        self.assertEqual(normalize_url("https://example.com/api/"), "https://example.com/api")

    def test_url_normalization_whitespace_and_scheme(self):
        self.assertEqual(normalize_url("  http://localhost:8000  "), "http://localhost:8000")
        self.assertEqual(normalize_url("127.0.0.1:8000"), "http://127.0.0.1:8000")
        self.assertEqual(normalize_url("api.setu.org/v1/"), "http://api.setu.org/v1")

    def test_env_var_precedence_setu_api_url_highest(self):
        env = {
            "SETU_API_URL": "http://cli-override:9000/",
            "SETU_API_BASE_URL": "https://api-base.com/",
            "SETU_BASE_URL": "http://base.com/",
        }
        with patch.dict(os.environ, env, clear=True):
            url, source = resolve_api_url()
            self.assertEqual(url, "http://cli-override:9000")
            self.assertEqual(source, "SETU_API_URL")

    def test_env_var_precedence_setu_api_base_url_second(self):
        env = {
            "SETU_API_BASE_URL": "https://api-base.com/",
            "SETU_BASE_URL": "http://base.com/",
        }
        with patch.dict(os.environ, env, clear=True):
            url, source = resolve_api_url()
            self.assertEqual(url, "https://api-base.com")
            self.assertEqual(source, "SETU_API_BASE_URL")

    def test_env_var_precedence_setu_base_url_third(self):
        env = {
            "SETU_BASE_URL": "http://base.com:8080/",
        }
        with patch.dict(os.environ, env, clear=True):
            url, source = resolve_api_url()
            self.assertEqual(url, "http://base.com:8080")
            self.assertEqual(source, "SETU_BASE_URL")

    def test_env_var_precedence_default_fallback(self):
        with patch.dict(os.environ, {}, clear=True):
            url, source = resolve_api_url()
            self.assertEqual(url, DEFAULT_BASE_URL)
            self.assertIn("default", source)

    def test_parse_html_error_response_no_raw_html(self):
        mock_res = MagicMock()
        mock_res.status_code = 503
        mock_res.reason = "Service Unavailable"
        mock_res.headers = {
            "content-type": "text/html; charset=UTF-8",
            "server": "Google Frontend"
        }
        mock_res.text = """<html><head>
<meta http-equiv="content-type" content="text/html;charset=utf-8">
<title>503 Server Error</title>
</head>
<body text=#000000 bgcolor=#ffffff>
<h1>Error: Server Error</h1>
<h2>The service you requested is not available yet.<p>Please try again in 30 seconds.</h2>
<h2></h2>
</body></html>"""
        mock_res.json.side_effect = ValueError("No JSON")

        clean_error = parse_error_response(mock_res)
        # Must not contain raw html tags
        self.assertNotIn("<html>", clean_error)
        self.assertNotIn("</head>", clean_error)
        self.assertNotIn("<body", clean_error)
        # Must contain informative status and message
        self.assertIn("503", clean_error)
        self.assertIn("The service you requested is not available yet", clean_error)
        self.assertIn("Google Frontend", clean_error)

    def test_parse_json_error_response(self):
        mock_res = MagicMock()
        mock_res.status_code = 400
        mock_res.headers = {"content-type": "application/json"}
        mock_res.json.return_value = {"detail": "Description too short"}
        mock_res.text = '{"detail": "Description too short"}'

        clean_error = parse_error_response(mock_res)
        self.assertEqual(clean_error, "Description too short")

    def test_no_silent_fallback_when_server_is_unreachable(self):
        """Verifies that an offline configured server does NOT silently switch to localhost."""
        test_url = "https://custom-server.unreachable.domain"
        with patch("setu_cli.BASE_URL", test_url):
            with patch("requests.get", side_effect=requests.exceptions.ConnectionError("Connection refused")):
                status = check_backend_status()
                self.assertFalse(status["online"])
                self.assertEqual(status["status"], "offline")
                # Ensure the request was actually made to the configured test_url
                self.assertIn("Cannot connect to SETU backend", status["error"])
                self.assertIn(test_url, status["error"])


if __name__ == "__main__":
    unittest.main()
