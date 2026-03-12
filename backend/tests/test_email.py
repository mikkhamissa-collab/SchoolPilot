"""Tests for the email service — verify HTML escaping and error handling."""

from unittest.mock import patch, MagicMock


class TestSendReminderEmail:
    def test_html_escaping(self):
        """Title with HTML should be escaped in the email body."""
        from app.services.email import send_reminder_email

        with patch("app.services.email.get_settings") as mock_settings, \
             patch("app.services.email.resend") as mock_resend:
            mock_settings.return_value.resend_api_key = "test-key"
            mock_resend.Emails.send.return_value = MagicMock()

            send_reminder_email("test@example.com", '<script>alert("xss")</script>')

            call_args = mock_resend.Emails.send.call_args[0][0]
            assert "<script>" not in call_args["html"]
            assert "&lt;script&gt;" in call_args["html"]

    def test_no_api_key(self):
        from app.services.email import send_reminder_email

        with patch("app.services.email.get_settings") as mock_settings:
            mock_settings.return_value.resend_api_key = ""
            result = send_reminder_email("test@example.com", "Test")
            assert result is False


class TestSendBuddyNudgeEmail:
    def test_html_escaping_in_name(self):
        """Buddy name should be HTML-escaped."""
        from app.services.email import send_buddy_nudge_email

        with patch("app.services.email.get_settings") as mock_settings, \
             patch("app.services.email.resend") as mock_resend:
            mock_settings.return_value.resend_api_key = "test-key"
            mock_resend.Emails.send.return_value = MagicMock()

            send_buddy_nudge_email("test@example.com", '<img src=x onerror=alert(1)>')

            call_args = mock_resend.Emails.send.call_args[0][0]
            assert "onerror" not in call_args["html"]
