"""Exercise Socket.IO input authorization against an isolated fresh database."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class SocketTouchAuthorizationTests(unittest.TestCase):
    def test_only_authenticated_session_can_enqueue_touch(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temp:
            server = Path(temp) / 'server'
            server.mkdir()
            for name in ('app.py', 'sigma_engine.py'):
                shutil.copy2(root / 'server' / name, server / name)
            script = r'''
import sys
sys.path.insert(0, 'server')
import app

payload = {'device_id': 'isolated-test', 'event': 'move', 'x': 1, 'y': 2}
unauthenticated = app.socketio.test_client(app.app)
assert unauthenticated.is_connected()
unauthenticated.emit('touch_event', dict(payload))
assert not app.touch_event_queues.get('isolated-test'), 'unauthenticated input was queued'
unauthenticated.disconnect()

browser = app.app.test_client()
with browser.session_transaction() as session:
    session['user'] = 'test-admin'
authenticated = app.socketio.test_client(app.app, flask_test_client=browser)
assert authenticated.is_connected()
authenticated.emit('touch_event', dict(payload))
queue = app.touch_event_queues['isolated-test']
assert len(queue) == 1 and queue[0]['event'] == 'move', 'authorized input was not queued'
authenticated.disconnect()
'''
            completed = subprocess.run(
                [sys.executable, '-c', script], cwd=temp,
                env={**os.environ, 'PYTHONPATH': ''}, text=True,
                capture_output=True, timeout=30,
            )
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)


if __name__ == '__main__':
    unittest.main()
