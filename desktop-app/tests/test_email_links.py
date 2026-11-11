from types import SimpleNamespace
import unittest
from unittest.mock import patch

from desktop_runtime import send_desktop_reset_email


class DesktopMailTests(unittest.TestCase):
    def test_reset_link_returns_to_the_installed_app_without_a_localhost_port(self):
        settings = SimpleNamespace(smtp_from_email='pharmacy@example.com', smtp_host='smtp.example.com',
                                   smtp_port=587, smtp_starttls=True, smtp_username='owner', smtp_password='secret')
        token = 'a' * 43
        with patch('app.config.get_settings', return_value=settings), patch('desktop_runtime.smtplib.SMTP') as smtp:
            send_desktop_reset_email('owner@example.com', token)
        message = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
        body = message.get_content()
        self.assertIn('pharma-erp://reset-password?token=' + token, body)
        self.assertNotIn('127.0.0.1', body)
        self.assertNotIn('secret', body)
