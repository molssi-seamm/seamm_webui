"""Self-signed TLS certificate generation for non-loopback deployments.

seamm_webui has to be self-contained -- no separately-installed/managed
httpd (Apache/nginx/Caddy) in front of it, since installs are expected on
machines run by non-computer-savvy users. So when it's asked to bind a
non-loopback host with no certificate supplied, it generates and reuses its
own self-signed certificate, the same way an SSH server generates a host
key on first boot: real, browser-trusted HTTPS (Let's Encrypt-style) needs
the host to be publicly reachable on a real DNS name, which doesn't hold
for cluster-internal deployments.
"""

import datetime
import ipaddress
import os
import socket
from pathlib import Path

import fasteners
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID


def get_or_create_self_signed_cert(root_dir: str) -> tuple[str, str]:
    """Return (certfile, keyfile) paths under `root_dir`, generating a
    self-signed cert/key pair on first use and reusing them on subsequent
    calls so a restart doesn't invalidate every browser's trust decision.
    Lock-guarded (like get_or_create_secret_key) so two processes starting
    against the same fresh --root at once can't race.
    """
    root = Path(root_dir).expanduser()
    root.mkdir(parents=True, exist_ok=True)
    certfile = root / "webui.crt"
    keyfile = root / "webui.key"

    lock = fasteners.InterProcessLock(str(certfile) + ".lock")
    locked = lock.acquire(blocking=True, timeout=5)
    if not locked:
        raise RuntimeError(f"Could not lock the certificate files under '{root}'")

    try:
        if certfile.is_file() and keyfile.is_file():
            return str(certfile), str(keyfile)

        hostname = socket.gethostname()
        san_names = sorted({hostname, socket.getfqdn(), "localhost"})

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        subject = issuer = x509.Name(
            [x509.NameAttribute(NameOID.COMMON_NAME, hostname)]
        )
        now = datetime.datetime.now(datetime.timezone.utc)
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=3650))
            .add_extension(
                x509.SubjectAlternativeName(
                    [x509.DNSName(name) for name in san_names]
                    + [x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
                ),
                critical=False,
            )
            .sign(key, hashes.SHA256())
        )

        keyfile.write_bytes(
            key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        os.chmod(keyfile, 0o600)

        certfile.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        os.chmod(certfile, 0o644)

        return str(certfile), str(keyfile)
    finally:
        lock.release()
