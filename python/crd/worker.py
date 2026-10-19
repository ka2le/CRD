"""Persistent, timeout-bounded JSON-lines transport to the authoritative JS rules."""

import json
import queue
import subprocess
import threading
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class WorkerError(RuntimeError):
    pass


class HeadlessWorker:
    def __init__(self, *, timeout=20.0, node="node"):
        self.timeout = timeout
        self._next_id = 1
        self._lock = threading.Lock()
        self._lines = queue.Queue()
        self._errors = deque(maxlen=80)
        self.process = subprocess.Popen(
            [node, str(ROOT / "scripts" / "headless-worker.mjs")],
            cwd=ROOT,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        self._output_thread = threading.Thread(target=self._read_output, daemon=True)
        self._error_thread = threading.Thread(target=self._read_errors, daemon=True)
        self._output_thread.start()
        self._error_thread.start()

    def _read_output(self):
        try:
            for line in self.process.stdout:
                self._lines.put(line)
        finally:
            self._lines.put(None)

    def _read_errors(self):
        for line in self.process.stderr:
            self._errors.append(line.rstrip())

    def request(self, command, **payload):
        with self._lock:
            if self.process.poll() is not None:
                raise WorkerError("Node worker has exited: " + "\n".join(self._errors))
            request_id = self._next_id
            self._next_id += 1
            message = {"id": request_id, "command": command, **payload}
            encoded = json.dumps(message, allow_nan=False)
            try:
                self.process.stdin.write(encoded + "\n")
                self.process.stdin.flush()
                line = self._lines.get(timeout=self.timeout)
            except queue.Empty as error:
                self.close()
                raise TimeoutError(f"Node worker timed out running {command}") from error
            except (BrokenPipeError, OSError) as error:
                raise WorkerError("Node worker pipe failed") from error
            if line is None:
                raise WorkerError("Node worker stopped: " + "\n".join(self._errors))
            response = json.loads(line)
            if response.get("id") != request_id:
                raise WorkerError("Node worker response ID mismatch")
            if not response.get("ok"):
                raise WorkerError(response.get("error", "Unknown worker failure"))
            return response

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=2)
        self._output_thread.join(timeout=1)
        self._error_thread.join(timeout=1)
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            stream.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
