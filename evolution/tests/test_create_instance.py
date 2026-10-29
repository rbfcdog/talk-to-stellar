"""Run with python3 evolution/tests/test_create_instance.py. No provider access."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread


def check_create_instance():
    requests = []
    response_secret = "synthetic-provider-response-secret"

    class Provider(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            self.send_response(200)
            self.end_headers()

        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            requests.append(self.path)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(('{"hash":{"apikey":"' + response_secret + '"}}').encode())

    server = HTTPServer(("127.0.0.1", 0), Provider)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            source = Path(__file__).resolve().parents[1] / "scripts"
            script = (source / "create-instance.sh").read_text()
            # Relocate the legacy dump path so a regression cannot overwrite a real file.
            script = script.replace("/tmp/talktostellar-evolution-create-instance.json", str(root / "response.json"))
            (root / "scripts/create-instance.sh").write_text(script)
            shutil.copyfile(source / "lib.sh", root / "scripts/lib.sh")
            settings = (
                f"EVOLUTION_PUBLIC_URL=http://127.0.0.1:{server.server_port}\n"
                "EVOLUTION_API_KEY=synthetic-local-api-key\n"
            )
            env = {"PATH": os.environ["PATH"]}
            command = ["bash", str(root / "scripts/create-instance.sh")]
            (root / ".env").write_text(settings + "INSTANCE_TOKEN=synthetic-local-instance-token\n")
            result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=15)
            assert result.returncode == 0, "Instance setup failed before checking disclosure"
            assert requests == ["/instance/create"], "Setup did not reach the local provider"
            output = result.stdout + result.stderr
            assert all(value not in output for value in (
                response_secret, "synthetic-local-api-key", "synthetic-local-instance-token"
            )), "Credential-bearing data reached terminal output"
            assert not (root / "response.json").exists(), "Raw provider response was persisted"

            (root / ".env").write_text(settings)
            rejected = subprocess.run(command, env=env, capture_output=True, text=True, timeout=15)
            assert rejected.returncode != 0 and "INSTANCE_TOKEN" in rejected.stderr
            assert requests == ["/instance/create"], "Missing token reached the provider"
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == "__main__":
    check_create_instance()
    print("PASS - instance setup neither exposes credentials nor accepts a missing token")
