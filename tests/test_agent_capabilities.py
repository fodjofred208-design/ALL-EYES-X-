"""The capability banner must reflect executable availability, not OS alone."""
import unittest
from unittest.mock import patch

from client import client


class NmapCapabilityTests(unittest.TestCase):
    def test_supported_platform_without_nmap_reports_missing(self):
        with patch.object(client, 'platform_kind', return_value='windows'), \
             patch.object(client.shutil, 'which', return_value=None):
            caps = client.capability_profile()
        self.assertFalse(caps['nmap'])
        self.assertIn('nmap executable on PATH (network scans)', caps['missing'])

    def test_supported_platform_with_nmap_reports_available(self):
        with patch.object(client, 'platform_kind', return_value='linux'), \
             patch.object(client.shutil, 'which', return_value='/usr/bin/nmap'):
            caps = client.capability_profile()
        self.assertTrue(caps['nmap'])
        self.assertNotIn('nmap executable on PATH (network scans)', caps['missing'])

    def test_unsupported_platform_does_not_advertise_scanning(self):
        with patch.object(client, 'platform_kind', return_value='ios'), \
             patch.object(client.shutil, 'which', return_value='/usr/bin/nmap'):
            self.assertFalse(client.capability_profile()['nmap'])


if __name__ == '__main__':
    unittest.main()
