from __future__ import annotations

import base64
import hashlib
import hmac
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SALT_BYTES = 16
KEY_BYTES = 32
NONCE_BYTES = 12


def _scrypt(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=KEY_BYTES,
    )


def new_salt() -> bytes:
    return os.urandom(SALT_BYTES)


def password_hash(password: str, salt: bytes) -> bytes:
    return _scrypt(password, salt)


def password_matches(password: str, salt: bytes, expected: bytes) -> bool:
    return hmac.compare_digest(_scrypt(password, salt), expected)


def new_data_key() -> bytes:
    return AESGCM.generate_key(bit_length=256)


_APP_SALT = b"smeeware:public-chats:v1"


def app_key(secret: str) -> bytes:
    return _scrypt(secret, _APP_SALT)


def wrap_key(dek: bytes, password: str, salt: bytes) -> bytes:
    return encrypt(dek, _scrypt(password, salt))


def unwrap_key(package: bytes, password: str, salt: bytes) -> bytes:
    return decrypt_raw(package, _scrypt(password, salt))


def encrypt(plaintext: bytes, key: bytes) -> bytes:
    nonce = os.urandom(NONCE_BYTES)
    return nonce + AESGCM(key).encrypt(nonce, plaintext, None)


def decrypt_raw(package: bytes, key: bytes) -> bytes:
    if len(package) <= NONCE_BYTES:
        raise ValueError("Ciphertext is too short.")
    nonce, rest = package[:NONCE_BYTES], package[NONCE_BYTES:]
    return AESGCM(key).decrypt(nonce, rest, None)


def encrypt_text(text: str, key: bytes) -> bytes:
    return encrypt(text.encode("utf-8"), key)


def decrypt_text(package: bytes, key: bytes) -> str:
    return decrypt_raw(package, key).decode("utf-8")


PREFIX = "enc:v1:"


def encrypt_field(text: str, key: bytes) -> str:
    return PREFIX + base64.b64encode(
        encrypt_text(text, key)
    ).decode("ascii")


def decrypt_field(value: str, key: bytes) -> str:
    if not value.startswith(PREFIX):
        return value
    return decrypt_text(base64.b64decode(value[len(PREFIX) :]), key)
