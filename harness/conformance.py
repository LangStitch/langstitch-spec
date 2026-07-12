"""LangStitch conformance harness — run a compiled project against a fixture.

Usage:
    python conformance.py --fixture <fixture-dir> --project <compiled-project-dir> \
        --python <python-exe> [--port 8765]

Checks (per langstitch-spec):
  1.  Server boots and reports healthy.
  2.  Security: /invoke without credentials -> 401; with the API key -> 200.
  3.  Dev run events: SSE stream emits schema-shaped, correctly ordered events
      keyed by IR node ids; the expected-trace partial order holds; nodes in
      `mustNotRun` never appear; run manifest written.
  4.  Execution: final state matches the fixture's expected assertions.
  5.  Logging: stdout lines are JSON with run_id/node_id correlation on node
      logs; fixture secrets never appear in logs or generated files.
  6.  Production posture: without the dev flag, the events endpoint does not
      exist and no run manifest is written.

Exit code 0 = conformant. Requires only the Python standard library.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

EVENTS_PATH = "/__langstitch/events"
RUN_MANIFEST = ".langstitch-run.json"

PASS: list[str] = []
FAIL: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    (PASS if ok else FAIL).append(f"{name}{f' — {detail}' if detail and not ok else ''}")
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail and not ok else ""))


def wait_for_port(port: int, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.3)
    return False


def http(method: str, url: str, body: dict | None = None, headers: dict | None = None) -> tuple[int, dict | str]:
    req = urllib.request.Request(url, method=method, headers=headers or {})
    data = json.dumps(body).encode() if body is not None else None
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=data, timeout=60) as resp:
            raw = resp.read().decode()
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()
    except urllib.error.URLError as exc:
        return -1, str(exc)


class SseCollector(threading.Thread):
    def __init__(self, url: str) -> None:
        super().__init__(daemon=True)
        self.url = url
        self.events: list[dict] = []
        self.connected = False
        self.error = ""
        self._stop = threading.Event()

    def run(self) -> None:
        try:
            req = urllib.request.Request(self.url)
            with urllib.request.urlopen(req, timeout=120) as resp:
                self.connected = True
                for raw in resp:
                    if self._stop.is_set():
                        break
                    line = raw.decode().strip()
                    if line.startswith("data: "):
                        self.events.append(json.loads(line[6:]))
        except Exception as exc:  # noqa: BLE001
            self.error = str(exc)

    def stop(self) -> None:
        self._stop.set()


def json_path_check(state: dict, key: str, expectation) -> bool:
    """Fixture finalState assertion mini-language."""
    if key.endswith(".length"):
        value = state.get(key[: -len(".length")])
        return isinstance(value, list) and len(value) == expectation
    m = re.match(r"^(\w+)\[-1\]\.contains$", key)
    if m:
        seq = state.get(m.group(1))
        if not isinstance(seq, list) or not seq:
            return False
        last = seq[-1]
        content = last.get("content", "") if isinstance(last, dict) else str(last)
        return str(expectation) in content
    return state.get(key) == expectation


def start_server(project: Path, python: str, port: int, env_extra: dict, log_path: Path) -> subprocess.Popen:
    env = {**os.environ, **env_extra}
    log = open(log_path, "w", encoding="utf-8")
    return subprocess.Popen(
        [python, "-m", "app.main"],
        cwd=project,
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", required=True)
    ap.add_argument("--project", required=True)
    ap.add_argument("--python", default=sys.executable)
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()

    fixture = Path(args.fixture).resolve()
    project = Path(args.project).resolve()
    stubs = json.loads((fixture / "stubs.json").read_text(encoding="utf-8"))
    trace = json.loads((fixture / "expected-trace.json").read_text(encoding="utf-8"))
    document = json.loads((fixture / "document.langstitch.json").read_text(encoding="utf-8"))
    all_node_ids = {n["id"] for g in document["logical"]["graphs"] for n in g["nodes"]}

    secrets = dict(stubs.get("secrets", {}))
    # Fixtures may pin their own API key secret; otherwise use a harness key.
    api_key = secrets.get("LANGSTITCH_API_KEY", "conformance-test-key")
    base_env = {
        "LANGSTITCH_STUB_LLM": "1",
        "LANGSTITCH_STUB_RESPONSES": str(fixture / "stubs.json"),
        "LANGSTITCH_PORT": str(args.port),
        "LANGSTITCH_HOST": "127.0.0.1",
        **secrets,
        "LANGSTITCH_API_KEY": api_key,
    }
    base = f"http://127.0.0.1:{args.port}"

    # ── secret-leak: generated files must not contain fixture secret values ──
    print("\n[1/3] static checks on generated project")
    leaked = []
    for path in project.rglob("*"):
        if path.is_file() and path.suffix in {".py", ".yaml", ".toml", ".json", ".md"}:
            text = path.read_text(encoding="utf-8", errors="ignore")
            for env_name, value in secrets.items():
                if value and value in text:
                    leaked.append(f"{path.name}:{env_name}")
    check("secret-leak: no fixture secret values in generated files", not leaked, ", ".join(leaked))
    manifest_path = project / ".langstitch-build-manifest.json"
    check("build manifest exists", manifest_path.exists())
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest_ids = {n["nodeId"] for n in manifest["nodes"]}
        expected_ids = {n["id"] for g in document["logical"]["graphs"] for n in g["nodes"] if n["kind"] not in ("start", "end")}
        check("build manifest covers all compiled nodes", manifest_ids == expected_ids, f"{manifest_ids} != {expected_ids}")

    # ── dev-mode run ─────────────────────────────────────────────────────────
    print("\n[2/3] dev-mode run (events + auth + logs + trace)")
    (project / RUN_MANIFEST).unlink(missing_ok=True)
    dev_log = project / "conformance-dev.log"
    proc = start_server(project, args.python, args.port, {**base_env, "LANGSTITCH_DEV_EVENTS": "1"}, dev_log)
    try:
        check("server boots (dev)", wait_for_port(args.port))
        status, body = http("GET", f"{base}/health")
        check("health endpoint", status == 200, f"{status} {body}")

        status, _ = http("POST", f"{base}/invoke", body={"state": stubs["input"]})
        check("security: invoke without key -> 401", status == 401, f"got {status}")
        status, _ = http("GET", f"{base}/info")
        check("security: info without key -> 401", status == 401, f"got {status}")

        sse = SseCollector(base + EVENTS_PATH)
        sse.start()
        time.sleep(1.0)
        check("dev events endpoint reachable", sse.connected, sse.error)

        status, body = http("POST", f"{base}/invoke", body={"state": stubs["input"]}, headers={"X-API-Key": api_key})
        check("invoke with key -> 200", status == 200, f"{status} {body}")
        result = body.get("result", {}) if isinstance(body, dict) else {}

        for key, expectation in trace.get("finalState", {}).items():
            check(f"final state: {key}", json_path_check(result, key, expectation), f"state={json.dumps(result)[:400]}")

        time.sleep(1.5)
        sse.stop()
        events = sse.events
        check("received run events", len(events) > 0)
        types = [e["type"] for e in events]
        check("run_started emitted first", bool(types) and types[0] == "run_started", str(types))
        check("run_finished succeeded", any(e["type"] == "run_finished" and e["status"] == "succeeded" for e in events))
        seqs = [e["seq"] for e in events]
        check("event seq strictly increasing", seqs == sorted(seqs) and len(set(seqs)) == len(seqs))
        event_node_ids = {e["nodeId"] for e in events if "nodeId" in e}
        check("all event node ids exist in the IR", event_node_ids <= all_node_ids, str(event_node_ids - all_node_ids))

        finished_order = [e["nodeId"] for e in events if e["type"] == "node_finished" and e.get("status") == "succeeded"]
        for entry in trace.get("nodes", []):
            nid = entry["nodeId"]
            check(f"trace: node {nid} ran", nid in finished_order)
            for dep in entry.get("after", []):
                ok = nid in finished_order and dep in finished_order and finished_order.index(dep) < finished_order.index(nid)
                check(f"trace: {dep} before {nid}", ok, str(finished_order))
        for nid in trace.get("mustNotRun", []):
            check(f"trace: {nid} did NOT run", nid not in event_node_ids, str(event_node_ids))

        check("run manifest written in dev mode", (project / RUN_MANIFEST).exists())

        logging_cfg = document["logical"].get("settings", {}).get("logging", {})
        if logging_cfg.get("sink") == "file":
            file_path = project / logging_cfg.get("file", {}).get("path", "logs/app.log")
            check("file sink: rotating log file created", file_path.exists(), str(file_path))
    finally:
        proc.kill()
        proc.wait()

    log_text = dev_log.read_text(encoding="utf-8")
    json_lines = [json.loads(l) for l in log_text.splitlines() if l.startswith("{")]
    check("logs: JSON lines present", len(json_lines) > 0)
    node_logs = [l for l in json_lines if l.get("logger") == "langstitch.nodes"]
    logging_cfg = document["logical"].get("settings", {}).get("logging", {})
    effective_level = logging_cfg.get("levels", {}).get("langstitch.nodes", logging_cfg.get("level", "info"))
    if effective_level == "debug":
        check("logs: node lifecycle lines at DEBUG", bool(node_logs) and all(l["level"] == "DEBUG" for l in node_logs))
        check(
            "logs: node lines carry run_id + node_id",
            bool(node_logs) and all("run_id" in l and "node_id" in l for l in node_logs),
        )
    else:
        # Level above debug: node lifecycle lines must be suppressed.
        check("logs: no node lifecycle lines above configured level", not node_logs)
    leak_in_logs = [k for k, v in secrets.items() if v and v in log_text]
    check("logs: no secret values", not leak_in_logs, ", ".join(leak_in_logs))
    stub_answers = list(stubs.get("llm", {}).values())
    info_leaks = [
        l for l in json_lines if l["level"] != "DEBUG" and any(ans in json.dumps(l) for ans in stub_answers)
    ]
    check("logs: no llm content above DEBUG", not info_leaks, json.dumps(info_leaks[:2]))

    # ── production posture ───────────────────────────────────────────────────
    print("\n[3/3] production-mode run (no dev surface)")
    (project / RUN_MANIFEST).unlink(missing_ok=True)
    prod_log = project / "conformance-prod.log"
    env = dict(base_env)
    proc = start_server(project, args.python, args.port, env, prod_log)
    try:
        check("server boots (prod)", wait_for_port(args.port))
        status, _ = http("GET", base + EVENTS_PATH)
        check("prod: events endpoint absent -> 404", status == 404, f"got {status}")
        check("prod: no run manifest written", not (project / RUN_MANIFEST).exists())
        status, body = http("POST", f"{base}/invoke", body={"state": stubs["input"]}, headers={"X-API-Key": api_key})
        check("prod: invoke with key still works", status == 200, f"{status} {body}")
    finally:
        proc.kill()
        proc.wait()

    print(f"\n{'=' * 60}\nRESULT: {len(PASS)} passed, {len(FAIL)} failed")
    for f in FAIL:
        print(f"  FAILED: {f}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
