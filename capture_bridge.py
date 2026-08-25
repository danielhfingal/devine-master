#!/usr/bin/env python3
"""
DEVINE MASTER — local capture bridge (Windows)

  python tools/capture_bridge.py
  python tools/capture_bridge.py --list-devices
  python tools/capture_bridge.py --port 8765

If health fails, try:  python tools/capture_bridge.py --port 8766
"""

from __future__ import annotations

import argparse
import json
import socket
import sys
import threading
import time
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
CAPTURES = ROOT / "captures"
PREF_FILE = CAPTURES / "preferred_device.json"
HOST = "127.0.0.1"
PORT = 8765

_state = {
    "recording": False,
    "error": None,
    "last_path": None,
    "last_name": None,
    "last_peak": None,
    "live_peak": None,  # updated each block while recording (desk EQ meters)
    "meter_pct": 0,  # 0-100 for EQ rails (server-side map)
    "started_at": None,
    "device_id": None,
    "device_name": None,
}
_stop = threading.Event()
_rec_thread: threading.Thread | None = None
_lock = threading.Lock()


def safe_tag(name: str) -> str:
    name = (name or "source").strip() or "source"
    out = []
    for c in name:
        if c.isalnum() or c in " -_":
            out.append(c if c != " " else "_")
        else:
            out.append("_")
    tag = "".join(out).strip("_")[:60] or "source"
    while "__" in tag:
        tag = tag.replace("__", "_")
    return tag


def load_preferred() -> str | None:
    try:
        if PREF_FILE.is_file():
            data = json.loads(PREF_FILE.read_text(encoding="utf-8"))
            return data.get("device_id") or data.get("name")
    except Exception:
        pass
    return None


def save_preferred(device_id: str) -> None:
    CAPTURES.mkdir(parents=True, exist_ok=True)
    PREF_FILE.write_text(
        json.dumps({"device_id": device_id, "saved_at": datetime.now().isoformat()}, indent=2),
        encoding="utf-8",
    )


def list_loopback_devices() -> list[dict]:
    import soundcard as sc

    devices = []
    speaker = sc.default_speaker()
    default_name = getattr(speaker, "name", "") or ""
    for i, m in enumerate(sc.all_microphones(include_loopback=True)):
        name = m.name or f"device-{i}"
        low = name.lower()
        is_loop = (
            "loopback" in low
            or "stereo mix" in low
            or "what u hear" in low
            or name == default_name
        )
        devices.append(
            {
                "id": name,
                "name": name,
                "index": i,
                "likely_loopback": is_loop,
                "matches_default_speaker": name == default_name
                or default_name.lower() in low
                or low in default_name.lower(),
            }
        )
    return devices


def resolve_mic(device_id: str | None):
    import soundcard as sc

    speaker = sc.default_speaker()
    mics = list(sc.all_microphones(include_loopback=True))
    if not mics:
        return None, speaker, None

    if device_id:
        for m in mics:
            if (m.name or "") == device_id:
                return m, speaker, m.name
        low = str(device_id).lower()
        for m in mics:
            if low in (m.name or "").lower():
                return m, speaker, m.name
        try:
            idx = int(device_id)
            if 0 <= idx < len(mics):
                m = mics[idx]
                return m, speaker, m.name
        except ValueError:
            pass

    pref = load_preferred()
    if pref:
        for m in mics:
            if (m.name or "") == pref:
                return m, speaker, m.name

    try:
        mic = sc.get_microphone(id=str(speaker.name), include_loopback=True)
        if mic is not None:
            return mic, speaker, mic.name
    except Exception:
        pass

    for m in mics:
        n = (m.name or "").lower()
        if "loopback" in n or "stereo mix" in n:
            return m, speaker, m.name
    return mics[0], speaker, mics[0].name



def peak_to_meter_pct(peak: float) -> int:
    """Map linear peak to 0-100 for EQ rail display. Open curve for loopback."""
    try:
        p = float(peak or 0.0)
    except Exception:
        p = 0.0
    if p < 0:
        p = 0.0
    if p > 1.5:
        p = 1.5
    # sqrt-ish sensitivity: 0.05 → ~50%, 0.25 → ~85%, 0.7 → ~100%
    if p <= 1e-9:
        return 0
    import math
    pct = (p ** 0.45) * 115.0
    if p > 0.0005 and pct < 12:
        pct = 12.0
    return int(max(0, min(100, round(pct))))

def record_worker(
    out_path: Path,
    max_seconds: float,
    device_id: str | None,
    samplerate: int = 48000,
) -> None:
    import numpy as np
    import soundfile as sf

    try:
        mic, speaker, resolved = resolve_mic(device_id)
        if mic is None:
            raise RuntimeError("No loopback device. Check Windows audio / VB-Cable.")

        with _lock:
            _state["device_id"] = resolved
            _state["device_name"] = resolved

        channels = 2
        try:
            channels = min(2, int(getattr(mic, "channels", 2) or 2))
        except Exception:
            channels = 2

        chunks = []
        frames_target = int(samplerate * max_seconds)
        frames_got = 0
        block = 1024
        _stop.clear()
        print(f"[bridge] device={resolved!r} sr={samplerate} ch={channels}", flush=True)

        with _lock:
            _state["live_peak"] = 0.0
            _state["meter_pct"] = 0
            _state["last_peak"] = None

        with mic.recorder(samplerate=samplerate, channels=channels, blocksize=block) as rec:
            while not _stop.is_set() and frames_got < frames_target:
                data = rec.record(numframes=block)
                if data is None or len(data) == 0:
                    continue
                arr = np.asarray(data, dtype=np.float32)
                chunks.append(arr)
                frames_got += len(data)
                # Live peak for desk EQ meters (mL/mR) — block peak, not whole-take
                try:
                    block_peak = float(np.max(np.abs(arr))) if arr.size else 0.0
                    if block_peak > 1.5:
                        block_peak = 1.5
                    with _lock:
                        # Peak-hold so /status polls always see energy
                        prev = float(_state.get("live_peak") or 0.0)
                        held = block_peak if block_peak >= prev else (prev * 0.82)
                        _state["live_peak"] = held
                        _state["meter_pct"] = peak_to_meter_pct(held)
                        # Log ~4x/sec
                        if (frames_got // block) % 12 == 0:
                            print(
                                f"[bridge] live_peak={held:.4f} meter_pct={_state['meter_pct']}",
                                flush=True,
                            )
                except Exception:
                    pass

        if not chunks:
            raise RuntimeError("No audio captured — is Suno playing through this device?")

        audio = np.concatenate(chunks, axis=0)
        peak = float(np.max(np.abs(audio))) if audio.size else 0.0
        if peak > 1.0:
            audio = audio / peak

        out_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(out_path), audio, samplerate, subtype="PCM_16")
        (CAPTURES / "LAST_CAPTURE.txt").write_text(str(out_path.resolve()) + "\n", encoding="utf-8")

        with _lock:
            _state["last_path"] = str(out_path.resolve())
            _state["last_peak"] = float(peak)
            _state["live_peak"] = float(peak)
            _state["recording"] = False
            _state["error"] = None
        silent = peak < 0.001
        print(f"[bridge] saved {out_path} peak={peak:.4f}" + (" SILENT?" if silent else ""), flush=True)
    except Exception as ex:
        with _lock:
            _state["recording"] = False
            _state["live_peak"] = None
            _state["error"] = str(ex)
        print("[bridge] ERROR:", ex, flush=True)
        traceback.print_exc()


class Handler(BaseHTTPRequestHandler):
    # HTTP/1.0 avoids keep-alive edge cases that show up as ERR_EMPTY_RESPONSE on some Windows setups
    protocol_version = "HTTP/1.0"
    close_connection = True

    def log_message(self, fmt: str, *args) -> None:
        try:
            print("[bridge]", fmt % args, flush=True)
        except Exception:
            pass

    def _send(self, code: int, body: bytes, content_type: str) -> None:
        """Lowest-level safe response."""
        try:
            reason = {
                200: "OK",
                204: "No Content",
                400: "Bad Request",
                404: "Not Found",
                409: "Conflict",
                500: "Internal Server Error",
            }.get(code, "OK")
            self.send_response(code, reason)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Connection", "close")
            self.end_headers()
            if body and self.command != "HEAD":
                self.wfile.write(body)
            self.wfile.flush()
        except Exception as ex:
            print("[bridge] send failed:", ex, flush=True)
            traceback.print_exc()

    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._send(code, body, "application/json; charset=utf-8")

    def do_OPTIONS(self) -> None:
        self._send(204, b"", "text/plain")

    def do_HEAD(self) -> None:
        self.do_GET(head_only=True)

    def do_GET(self, head_only: bool = False) -> None:
        try:
            path = urlparse(self.path).path or "/"
            print(f"[bridge] GET {path}", flush=True)
            if path in ("/", "/health"):
                with _lock:
                    rec = bool(_state.get("recording"))
                    lp = _state.get("live_peak")
                    mp = _state.get("meter_pct")
                self._json(
                    200,
                    {
                        "ok": True,
                        "service": "devine-capture-bridge",
                        "build": "v1x-meter",
                        "port": PORT,
                        "preferred_device": load_preferred(),
                        "recording": rec,
                        "live_peak": float(lp or 0.0),
                        "meter_pct": int(mp or 0),
                        "has_live_peak": True,
                    },
                )
                return
            if path == "/devices":
                try:
                    devices = list_loopback_devices()
                except Exception as ex:
                    self._json(500, {"ok": False, "error": str(ex)})
                    return
                self._json(
                    200,
                    {
                        "ok": True,
                        "devices": devices,
                        "preferred_device": load_preferred(),
                    },
                )
                return
            if path == "/status":
                with _lock:
                    st = dict(_state)
                st["ok"] = True
                st["preferred_device"] = load_preferred()
                # Always numeric for the desk (never null mid-record)
                try:
                    lp = st.get("live_peak")
                    st["live_peak"] = float(lp) if lp is not None else 0.0
                except Exception:
                    st["live_peak"] = 0.0
                try:
                    st["meter_pct"] = int(st.get("meter_pct") or peak_to_meter_pct(st["live_peak"]))
                except Exception:
                    st["meter_pct"] = 0
                st["recording"] = bool(st.get("recording"))
                self._json(200, st)
                return
            if path == "/last.json":
                with _lock:
                    p = _state.get("last_path")
                    name = _state.get("last_name")
                if not p or not Path(p).is_file():
                    self._json(404, {"ok": False, "error": "no capture yet"})
                    return
                self._json(
                    200,
                    {
                        "ok": True,
                        "path": p,
                        "name": name,
                        "filename": Path(p).name,
                        "url": f"http://{HOST}:{PORT}/last.wav",
                    },
                )
                return
            if path == "/last.wav":
                with _lock:
                    p = _state.get("last_path")
                if not p or not Path(p).is_file():
                    self._json(404, {"ok": False, "error": "no capture yet"})
                    return
                data = Path(p).read_bytes()
                self._send(200, data, "audio/wav")
                return
            self._json(404, {"ok": False, "error": f"not found: {path}"})
        except Exception as ex:
            traceback.print_exc()
            try:
                self._json(500, {"ok": False, "error": str(ex)})
            except Exception:
                pass

    def do_POST(self) -> None:
        global _rec_thread
        try:
            path = urlparse(self.path).path or "/"
            print(f"[bridge] POST {path}", flush=True)
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length > 0 else b"{}"
            try:
                payload = json.loads(raw.decode("utf-8") or "{}")
            except Exception:
                payload = {}
            if not isinstance(payload, dict):
                payload = {}

            if path == "/device":
                device_id = str(payload.get("id") or payload.get("device_id") or "").strip()
                if not device_id:
                    self._json(400, {"ok": False, "error": "missing id"})
                    return
                save_preferred(device_id)
                self._json(200, {"ok": True, "device_id": device_id})
                return

            if path == "/record/start":
                with _lock:
                    if _state["recording"]:
                        self._json(409, {"ok": False, "error": "already recording"})
                        return
                name = str(payload.get("name") or "source")
                max_seconds = float(payload.get("max_seconds") or 600)
                max_seconds = max(5.0, min(max_seconds, 600.0))
                device_id = payload.get("device_id") or payload.get("device") or load_preferred()
                tag = safe_tag(name)
                day = datetime.now().strftime("%Y%m%d")
                stamp = datetime.now().strftime("%Y%m%d_%H%M")
                out_path = CAPTURES / f"{day}_{tag}_capture.wav"
                if out_path.exists():
                    out_path = CAPTURES / f"{stamp}_{tag}_capture.wav"

                with _lock:
                    _state["recording"] = True
                    _state["error"] = None
                    _state["last_name"] = name
                    _state["last_path"] = None
                    _state["started_at"] = time.time()

                _stop.clear()
                _rec_thread = threading.Thread(
                    target=record_worker,
                    args=(out_path, max_seconds, device_id),
                    daemon=True,
                )
                _rec_thread.start()
                print(f"[bridge] recording → {out_path.name}", flush=True)
                self._json(
                    200,
                    {
                        "ok": True,
                        "recording": True,
                        "filename": out_path.name,
                        "device_id": device_id,
                        "hint": "Play Suno now. Press Stop when the song ends.",
                    },
                )
                return

            if path == "/record/stop":
                with _lock:
                    was = _state["recording"]
                    p = _state.get("last_path")
                    err = _state.get("error")
                    name = _state.get("last_name")
                if not was:
                    if err:
                        self._json(500, {"ok": False, "error": err})
                        return
                    if p:
                        peak = _state.get("last_peak")
                        silent = peak is not None and float(peak) < 0.001
                        self._json(
                            200,
                            {
                                "ok": True,
                                "recording": False,
                                "path": p,
                                "filename": Path(p).name,
                                "url": f"http://{HOST}:{PORT}/last.wav",
                                "name": name,
                                "peak": peak,
                                "silent": silent,
                                "warning": ("Capture looks silent — is Suno playing on this device?" if silent else None),
                            },
                        )
                        return
                    self._json(400, {"ok": False, "error": "not recording"})
                    return
                _stop.set()
                if _rec_thread:
                    _rec_thread.join(timeout=30)
                with _lock:
                    err = _state.get("error")
                    p = _state.get("last_path")
                    name = _state.get("last_name")
                    peak = _state.get("last_peak")
                if err:
                    self._json(500, {"ok": False, "error": err})
                    return
                if not p:
                    self._json(500, {"ok": False, "error": "stop finished but no file"})
                    return
                silent = peak is not None and float(peak) < 0.001
                self._json(
                    200,
                    {
                        "ok": True,
                        "recording": False,
                        "path": p,
                        "filename": Path(p).name,
                        "url": f"http://{HOST}:{PORT}/last.wav",
                        "name": name,
                        "peak": peak,
                        "silent": silent,
                        "warning": ("Capture looks silent — is Suno playing on this device?" if silent else None),
                    },
                )
                return

            self._json(404, {"ok": False, "error": "not found"})
        except Exception as ex:
            traceback.print_exc()
            try:
                self._json(500, {"ok": False, "error": str(ex)})
            except Exception:
                pass


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def raw_self_test(port: int) -> bool:
    """Pure socket test — does not use urllib (avoids proxy injection)."""
    req = (
        f"GET /health HTTP/1.0\r\n"
        f"Host: 127.0.0.1:{port}\r\n"
        f"Connection: close\r\n"
        f"\r\n"
    ).encode("ascii")
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=3) as s:
            s.sendall(req)
            chunks = []
            while True:
                data = s.recv(4096)
                if not data:
                    break
                chunks.append(data)
        raw = b"".join(chunks)
        text = raw.decode("utf-8", errors="replace")
        print("[bridge] raw self-test response:", repr(text[:300]), flush=True)
        if b"200" in raw and b"ok" in raw:
            print("[bridge] self-test OK", flush=True)
            return True
        print("[bridge] self-test BAD BODY", flush=True)
        return False
    except Exception as ex:
        print("[bridge] self-test FAILED:", ex, flush=True)
        return False


def main(argv: list[str] | None = None) -> int:
    global PORT
    ap = argparse.ArgumentParser(description="DEVINE MASTER capture bridge")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--device", type=str, default="")
    ap.add_argument("--list-devices", action="store_true")
    args = ap.parse_args(argv)

    try:
        import numpy  # noqa: F401
        import soundcard  # noqa: F401
        import soundfile  # noqa: F401
    except ImportError:
        print("Install: python -m pip install -r tools/requirements-capture.txt")
        return 1

    CAPTURES.mkdir(parents=True, exist_ok=True)

    if args.list_devices:
        try:
            for d in list_loopback_devices():
                marks = []
                if d["likely_loopback"]:
                    marks.append("loop?")
                if d["matches_default_speaker"]:
                    marks.append("default-spk")
                print(f"  [{d['index']}] {d['name']!r}  {' '.join(marks)}")
        except Exception as ex:
            print("Device list failed:", ex)
            traceback.print_exc()
            return 1
        print("preferred:", load_preferred() or "(none)")
        return 0

    if args.device.strip():
        save_preferred(args.device.strip())
        print("Preferred device saved:", args.device.strip())

    PORT = int(args.port)

    # Detect anything already bound
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.settimeout(0.5)
    in_use = probe.connect_ex((HOST, PORT)) == 0
    probe.close()
    if in_use:
        print(f"[bridge] WARNING: {HOST}:{PORT} already accepts connections.")
        print("[bridge] Another process may be holding the port. Close it, or use --port 8766")

    try:
        server = ThreadedHTTPServer((HOST, PORT), Handler)
    except OSError as ex:
        print(f"[bridge] FATAL: cannot bind {HOST}:{PORT} — {ex}")
        print("[bridge] Try: python tools\\capture_bridge.py --port 8766")
        return 1

    print(f"DEVINE MASTER capture bridge  http://{HOST}:{PORT}", flush=True)
    print(f"Captures: {CAPTURES}", flush=True)
    print(f"Preferred device: {load_preferred() or '(auto)'}", flush=True)
    print("Desk: Record → play Suno → Stop. Ctrl+C to quit.", flush=True)
    print(f"Browser test: http://127.0.0.1:{PORT}/health", flush=True)

    def _late_test() -> None:
        time.sleep(0.6)
        ok = raw_self_test(PORT)
        if not ok:
            print("[bridge] ---", flush=True)
            print("[bridge] Health still failing. Try:", flush=True)
            print(f"[bridge]   1) Ctrl+C this window", flush=True)
            print(f"[bridge]   2) python tools\\capture_bridge.py --port 8766", flush=True)
            print(f"[bridge]   3) In browser open http://127.0.0.1:8766/health", flush=True)
            print("[bridge] ---", flush=True)

    threading.Thread(target=_late_test, daemon=True).start()

    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("\nbridge stopped", flush=True)
    finally:
        try:
            server.server_close()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
