"""Credential-free, bounded simulator inventory/boot diagnostic. No app actions."""
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time

OUTPUT = Path('/tmp/sc-simulator-preflight')
BUDGET_SECONDS = 200
CLEANUP_SECONDS = 20
MODEL = 'iPad Pro 13-inch (M4)'
ENV_KEYS = ('PATH', 'HOME', 'TMPDIR', 'USER', 'LOGNAME', 'LANG', 'DEVELOPER_DIR')
MAX_BYTES = 512 * 1024


def utc():
    return datetime.now(timezone.utc).isoformat()


def developer_dir(value):
    if value is None:
        return {'state': 'absent'}
    if value == '/Library/Developer/CommandLineTools' or re.fullmatch(
            r'/Applications/Xcode(?:[-_ ][A-Za-z0-9.\-]+)?\.app/Contents/Developer', value):
        return {'state': 'present', 'value': value}
    return {'state': 'invalid_redacted'}


def child_environment(environment):
    selected = {key: environment[key] for key in ENV_KEYS if key in environment}
    if developer_dir(selected.get('DEVELOPER_DIR'))['state'] == 'invalid_redacted':
        raise ValueError('Invalid developer directory')
    return selected


def sanitize(text, environment):
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
    text = ''.join(char for char in text if char in '\n\r\t' or ord(char) >= 32)
    for key in ('HOME', 'TMPDIR'):
        value = environment.get(key)
        if value and len(value) > 1:
            text = text.replace(value, '<' + key + '>')
    text = re.sub(r'(?i)(bearer\s+)[^\s]+', r'\1[redacted]', text)
    text = re.sub(r'(?i)((?:password|authorization|access[_-]?token|refresh[_-]?token|api[_-]?key)\s*[:=]\s*)[^\s,;]+', r'\1[redacted]', text)
    return text[:MAX_BYTES]


def version(value):
    if type(value) is int and 0 <= value <= 0xffffffff:
        return (value >> 16, (value >> 8) & 255, value & 255)
    if isinstance(value, str) and re.fullmatch(r'\d+(?:\.\d+){0,2}', value):
        parts = [int(part) for part in value.split('.')]
        return tuple((parts + [0, 0])[:3])
    return None


def choose_runtime(runtimes, device_types):
    exact = [item for item in device_types.get('devicetypes', []) if item.get('name') == MODEL]
    candidates = []
    for device in exact:
        low = version(device.get('minRuntimeVersionString')) or version(device.get('minRuntimeVersion'))
        high = version(device.get('maxRuntimeVersionString')) or version(device.get('maxRuntimeVersion'))
        identifier = device.get('identifier')
        if not isinstance(identifier, str) or not identifier.startswith('com.apple.CoreSimulator.SimDeviceType.'):
            continue
        for runtime in runtimes.get('runtimes', []):
            runtime_id = runtime.get('identifier')
            current = version(runtime.get('version'))
            supported = runtime.get('supportedDeviceTypes')
            if (runtime.get('isAvailable') is not True or not isinstance(runtime_id, str)
                    or not runtime_id.startswith('com.apple.CoreSimulator.SimRuntime.iOS-') or current is None):
                continue
            if low is not None and current < low or high is not None and current > high:
                continue
            if supported is not None:
                if not isinstance(supported, list) or not any(
                        entry == identifier or isinstance(entry, dict) and entry.get('identifier') == identifier
                        for entry in supported):
                    continue
            elif low is None or high is None:
                continue  # Compatibility must be established by metadata, never guessed.
            candidates.append((current, identifier, runtime_id, low, high, supported is not None))
    if not candidates:
        return None
    selected = sorted(candidates, reverse=True, key=lambda row: (row[0], row[1]))[0]
    return {'model': MODEL, 'deviceType': selected[1], 'runtime': selected[2],
            'version': '.'.join(map(str, selected[0])), 'minRuntime': selected[3],
            'maxRuntime': selected[4], 'supportedDeviceTypesChecked': selected[5]}


class Runner:
    def __init__(self, output, environment, budget=BUDGET_SECONDS):
        self.output = Path(output)
        self.output.mkdir(parents=True, exist_ok=True)
        self.environment = environment
        self.started = time.monotonic()
        self.end = self.started + budget
        self.work_end = self.end - CLEANUP_SECONDS
        self.data = {'startedAtUtc': utc(), 'budgetSeconds': budget,
                     'cleanupReserveSeconds': CLEANUP_SECONDS, 'status': 'running',
                     'developerDirectory': developer_dir(environment.get('DEVELOPER_DIR')),
                     'stages': [], 'applicationActions': False, 'credentialsRequested': False}
        self.save()

    def save(self):
        pending = self.output / 'result.pending'
        pending.write_text(json.dumps(self.data, indent=2), encoding='utf-8')
        os.replace(pending, self.output / 'result.json')

    def remaining(self):
        return max(0, self.work_end - time.monotonic())

    def run(self, name, args, seconds, cleanup=False):
        started = time.monotonic()
        deadline = min(self.end if cleanup else self.work_end, time.monotonic() + seconds)
        # Reserve bounded terminate/kill time inside this stage's limit.
        process_deadline = deadline - 3
        event = {'stage': name, 'startedAtUtc': utc(), 'endedAtUtc': None,
                 'deadlineAtUtc': (datetime.now(timezone.utc) + timedelta(seconds=max(0, deadline-time.monotonic()))).isoformat(),
                 'status': 'running', 'exitCode': None, 'stdout': name+'.stdout.txt',
                 'stderr': name+'.stderr.txt',
                 'command': [sanitize(arg, self.environment) for arg in args],
                 'elapsedSeconds': 0}
        self.data['stages'].append(event)
        self.save()
        print(json.dumps(event), flush=True)
        stdout = self.output / event['stdout']
        stderr = self.output / event['stderr']
        stdout.write_text('', encoding='utf-8')
        stderr.write_text('', encoding='utf-8')
        raw_paths = []
        proc = None
        result = None
        displayed = {stdout: 0, stderr: 0}
        def snapshot():
            nonlocal result
            for raw, target in zip(raw_paths, (stdout, stderr)):
                with raw.open('rb') as stream:
                    value = stream.read(MAX_BYTES).decode('utf-8', errors='replace')
                safe = sanitize(value, self.environment)
                target.write_text(safe, encoding='utf-8')
                # CI gets bounded live evidence; complete bounded output remains an artifact.
                excerpt = safe[displayed[target]:4096]
                if excerpt:
                    print(json.dumps({'stage': name, 'stream': target.suffixes[-2],
                                      'output': excerpt}), flush=True)
                    displayed[target] = min(len(safe), 4096)
                if target == stdout:
                    result = value
        try:
            if time.monotonic() >= process_deadline:
                event['status'] = 'skipped_budget'
                return None
            for _ in range(2):
                descriptor, path = tempfile.mkstemp(prefix='sc-simulator-preflight-')
                os.close(descriptor)
                raw_paths.append(Path(path))
            with raw_paths[0].open('wb') as out, raw_paths[1].open('wb') as err:
                proc = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                                        env=child_environment(self.environment), start_new_session=os.name != 'nt')
                next_report = time.monotonic()
                while proc.poll() is None:
                    if any(path.stat().st_size > MAX_BYTES for path in raw_paths):
                        event['status'] = 'output_limit'
                        break
                    if time.monotonic() >= process_deadline:
                        event['status'] = 'timeout'
                        break
                    if time.monotonic() >= next_report:
                        snapshot()
                        self.save()
                        print('Simulator preflight running: ' + name, flush=True)
                        next_report = time.monotonic() + 10
                    time.sleep(.1)
                if proc.poll() is None:
                    if os.name == 'nt':
                        proc.terminate()
                    else:
                        os.killpg(proc.pid, signal.SIGTERM)
                    try:
                        proc.wait(timeout=1)
                    except subprocess.TimeoutExpired:
                        if os.name == 'nt':
                            proc.kill()
                        else:
                            os.killpg(proc.pid, signal.SIGKILL)
                        proc.wait(timeout=1)
                event['exitCode'] = proc.returncode
                if any(path.stat().st_size > MAX_BYTES for path in raw_paths):
                    event['status'] = 'output_limit'
                if event['status'] == 'running':
                    event['status'] = 'success' if proc.returncode == 0 else 'failed'
            snapshot()
            return result if event['status'] == 'success' else None
        except Exception as error:
            event['status'] = 'failed'
            event['failureType'] = type(error).__name__
            return None
        finally:
            if proc is not None and proc.poll() is None:
                try:
                    if os.name == 'nt':
                        proc.kill()
                    else:
                        os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait(timeout=1)
                except (OSError, subprocess.TimeoutExpired):
                    event['cleanupIncomplete'] = True
            snapshot()
            for path in raw_paths:
                path.unlink(missing_ok=True)
            event['endedAtUtc'] = utc()
            event['elapsedSeconds'] = round(time.monotonic() - started, 3)
            self.save()
            print(json.dumps(event), flush=True)


def main():
    runner = Runner(OUTPUT, {key: os.environ[key] for key in ENV_KEYS if key in os.environ})
    owned = None
    success = False
    try:
        runner.run('macos-version', ['sw_vers'], 10)
        arch = runner.run('host-architecture', ['uname', '-m'], 6)
        runner.run('selected-developer-directory', ['xcode-select', '-p'], 10)
        runner.run('xcode-version', ['xcodebuild', '-version'], 15)
        runner.run('find-simctl', ['xcrun', '--find', 'simctl'], 10)
        # Exactly one bounded runtime inventory invocation. Never retry it.
        raw_runtimes = runner.run('runtime-inventory', ['xcrun', 'simctl', 'list', 'runtimes', '-j'], 120)
        if raw_runtimes is None:
            runner.data['selection'] = {'status': 'unavailable_inventory'}
            return 1
        raw_types = runner.run('device-type-inventory', ['xcrun', 'simctl', 'list', 'devicetypes', '-j'], 20)
        if raw_types is None:
            runner.data['selection'] = {'status': 'unavailable_inventory'}
            return 1
        try:
            selected = choose_runtime(json.loads(raw_runtimes), json.loads(raw_types))
        except (ValueError, TypeError, AttributeError):
            runner.data['selection'] = {'status': 'invalid_inventory'}
            return 1
        runner.data['selection'] = {'status': 'compatible' if selected else 'no_compatible_exact_model', 'selected': selected}
        runner.save()
        if selected is None:
            return 1
        if arch is None or arch.strip() != 'arm64':
            runner.data['boot'] = {'status': 'skipped_unexpected_architecture'}
            return 1
        if runner.remaining() < 55:
            runner.data['boot'] = {'status': 'skipped_budget', 'remainingWorkSeconds': round(runner.remaining(), 2)}
            success = True
            return 0
        created = runner.run('create-owned-simulator', ['xcrun', 'simctl', 'create', 'ScaledCircle credential-free preflight', selected['deviceType'], selected['runtime']], 12)
        if created is None or not re.fullmatch(r'[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}', created.strip()):
            runner.data['boot'] = {'status': 'create_not_confirmed'}
            return 1
        owned = created.strip()
        runner.data['ownedSimulator'] = owned
        runner.save()
        if runner.run('boot-owned-simulator', ['xcrun', 'simctl', 'boot', owned], 10) is None:
            runner.data['boot'] = {'status': 'boot_failed'}
            return 1
        ready = runner.run('wait-owned-simulator-boot', ['xcrun', 'simctl', 'bootstatus', owned, '-b'], min(60, runner.remaining()))
        runner.data['boot'] = {'status': 'ready' if ready is not None else 'not_ready'}
        success = ready is not None
        return 0 if success else 1
    finally:
        runner.data.update(status='success' if success else 'failed', workEndedAtUtc=utc())
        runner.save()  # Preserve evidence before cleanup; forced CI termination may skip cleanup.
        if owned:
            runner.run('shutdown-owned-simulator', ['xcrun', 'simctl', 'shutdown', owned], 8, cleanup=True)
            runner.run('delete-owned-simulator', ['xcrun', 'simctl', 'delete', owned], 10, cleanup=True)
        runner.data['endedAtUtc'] = utc()
        runner.save()
        metadata = {}
        for stage in runner.data['stages'][:5]:
            metadata[stage['stage']] = {
                'status': stage['status'],
                'stdout': (runner.output / stage['stdout']).read_text(encoding='utf-8')[:4096],
                'stderr': (runner.output / stage['stderr']).read_text(encoding='utf-8')[:4096]}
        print(json.dumps({'summary': runner.data['status'],
                          'developerDirectory': runner.data['developerDirectory'],
                          'selection': runner.data.get('selection'),
                          'boot': runner.data.get('boot'), 'metadata': metadata,
                          'elapsedSeconds': round(time.monotonic() - runner.started, 3)}), flush=True)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Simulator preflight stopped; inspect retained safe stage evidence.', flush=True)
        raise SystemExit(1) from None
