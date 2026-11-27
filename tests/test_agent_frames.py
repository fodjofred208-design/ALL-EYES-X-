"""Frame counters only count server-acknowledged captures."""
import unittest
from unittest.mock import patch

from client import client


class AgentFrameTests(unittest.TestCase):
    def setUp(self):
        self.agent = client.ALLEYESXClient.__new__(client.ALLEYESXClient)
        self.agent.device_id = 'test'
        self.agent.last_screenshot_time = 0
        self.agent.last_webcam_time = 0
        self.agent.webcam_enabled = True
        self.agent.webcam_camera = 'front'

    def test_screenshot_requires_a_frame_and_acknowledgement(self):
        with patch.object(client.time, 'time', return_value=100), \
             patch.object(client, 'capture_screenshot', return_value={'image': 'test'}), \
             patch.object(client, 'api_request_raw', return_value={'status': 'ok'}):
            self.assertTrue(self.agent.send_screenshot())
        self.agent.last_screenshot_time = 0
        with patch.object(client.time, 'time', return_value=100), \
             patch.object(client, 'capture_screenshot', return_value={'image': 'test'}), \
             patch.object(client, 'api_request_raw', return_value={'error': 'send_failed'}):
            self.assertFalse(self.agent.send_screenshot())
        self.agent.last_screenshot_time = 0
        with patch.object(client.time, 'time', return_value=100), \
             patch.object(client, 'capture_screenshot', return_value=None):
            self.assertFalse(self.agent.send_screenshot())

    def test_webcam_requires_enable_frame_and_acknowledgement(self):
        self.agent.webcam_enabled = False
        self.assertFalse(self.agent.send_webcam())
        self.agent.webcam_enabled = True
        with patch.object(client.time, 'time', return_value=100), \
             patch.object(client, 'capture_webcam', return_value='test'), \
             patch.object(client, 'api_request_raw', return_value={'status': 'ok'}):
            self.assertTrue(self.agent.send_webcam())
        self.agent.last_webcam_time = 0
        with patch.object(client.time, 'time', return_value=100), \
             patch.object(client, 'capture_webcam', return_value='test'), \
             patch.object(client, 'api_request_raw', return_value={'error': 'send_failed'}):
            self.assertFalse(self.agent.send_webcam())


if __name__ == '__main__':
    unittest.main()
