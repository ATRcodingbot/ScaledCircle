"""Independent, bounded simulator images. Never export command output or sessions."""
import json
import os
from pathlib import Path
import struct
import subprocess
from datetime import datetime, timezone


class DiagnosticCapture:
    def __init__(self, simulator, private, output, execute=subprocess.run):
        self.simulator, self.private, self.output = simulator, Path(private), Path(output)
        self.execute = execute
        self.attempted = set()

    def capture(self, name, events):
        if name not in ('startup', 'failure') or name in self.attempted:
            return
        self.attempted.add(name)
        self.private.mkdir(parents=True, exist_ok=True)
        self.output.mkdir(parents=True, exist_ok=True)
        last = next((e['stage'] for e in reversed(events)
                     if e.get('outcome') == 'success' and not e['stage'].startswith('diagnostic-')), None)
        active = next((e['stage'] for e in reversed(events)
                       if not e['stage'].startswith('diagnostic-')), None)
        record = {'name': name, 'status': 'failed', 'lastCompletedStep': last,
                  'lastObservedStep': active, 'exitCode': None,
                  'atUtc': datetime.now(timezone.utc).isoformat(),
                  'kind': 'diagnostic_only_not_store_listing'}
        # The pinned password field is permanently obscured. Before entering a
        # password we also require the runtime inspection to attest this property.
        entered = any(e['stage'] == 'password-input' for e in events)
        obscured = any(e['stage'] == 'password-obscured' and e.get('outcome') == 'success'
                       for e in events)
        pending = self.private / (name + '.pending.png')
        try:
            if not self.simulator:
                record['failure'] = 'simulator_identifier_unavailable'
                return
            if entered and not obscured:
                record['failure'] = 'safe_screen_not_established'
                return
            result = self.execute(['xcrun', 'simctl', 'io', self.simulator,
                                   'screenshot', str(pending)], timeout=10,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            record['exitCode'] = result.returncode
            if result.returncode:
                record['failure'] = 'simctl_nonzero_exit'
                return
            raw = pending.read_bytes()
            if (len(raw) < 45 or raw[:8] != b'\x89PNG\r\n\x1a\n'
                    or struct.unpack('>II', raw[16:24]) != (2064, 2752)
                    or not raw.endswith(b'\x00\x00\x00\x00IEND\xaeB`\x82')):
                record['failure'] = 'invalid_or_incomplete_png'
                return
            os.replace(pending, self.output / (name + '.png'))
            record['status'] = 'captured'
        except subprocess.TimeoutExpired:
            record['failure'] = 'simctl_timeout'
        except Exception:
            record['failure'] = 'simctl_or_file_failure'
        finally:
            if pending.exists():
                pending.unlink()
            # Acknowledge only after independent evidence/export or exact failure.
            for folder in (self.output, self.private):
                target = folder / (name + '.json')
                tmp = target.with_suffix('.pending')
                tmp.write_text(json.dumps(record))
                os.replace(tmp, target)
