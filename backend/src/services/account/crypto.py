"""Passwoerter pruefen, Chats verschluesseln.

Zwei Dinge, die man nicht verwechseln darf:

Ein **Passwort** wird nie verschluesselt, sondern gehasht. Verschluesseln
hiesse, es zurueckholen zu koennen -- und das will man bei einem Passwort nie.
Gespeichert wird ein scrypt-Hash; beim Anmelden wird neu gehasht und
verglichen.

Ein **Schluessel** dagegen muss zurueckzuholen sein, sonst waeren die Chats
weg. Deshalb der uebliche Zweischritt: die Chats haengen an einem zufaelligen
Datenschluessel (DEK), und der liegt seinerseits verschluesselt in der
Datenbank -- eingepackt in einen Schluessel, der aus dem Passwort entsteht
(KEK). Wer das Passwort aendert, packt den DEK neu ein; die Chats bleiben,
wie sie sind. Ohne diesen Umweg muesste ein Passwortwechsel jede Nachricht
neu verschluesseln.

Was das schuetzt: wer ``chats.db`` in die Hand bekommt, sieht Titel und
Nachrichten nur als Chiffrat. Was es nicht schuetzt: was der laufende Server
im Speicher haelt, solange jemand angemeldet ist.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Interaktiv, nicht maximal: die Anmeldung soll sich nicht wie ein Ladebalken
# anfuehlen. n=2^14 liegt bei wenigen hundert Millisekunden.
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SALZ_BYTES = 16
SCHLUESSEL_BYTES = 32
NONCE_BYTES = 12


def _scrypt(passwort: str, salz: bytes) -> bytes:
    return hashlib.scrypt(
        passwort.encode("utf-8"),
        salt=salz,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCHLUESSEL_BYTES,
    )


def neues_salz() -> bytes:
    return os.urandom(SALZ_BYTES)


def passwort_hash(passwort: str, salz: bytes) -> bytes:
    """Zum Pruefen beim Anmelden -- nie zum Entschluesseln."""
    return _scrypt(passwort, salz)


def passwort_stimmt(passwort: str, salz: bytes, erwartet: bytes) -> bool:
    # compare_digest statt ==: die Laufzeit soll nicht verraten, wie weit
    # ein Versuch gekommen ist.
    return hmac.compare_digest(_scrypt(passwort, salz), erwartet)


def neuer_datenschluessel() -> bytes:
    return AESGCM.generate_key(bit_length=256)


# Fest, nicht zufaellig -- und das ist hier genau richtig.
#
# Ein Zufallssalz schuetzt davor, dass sich gleiche Passwoerter am gleichen
# Hash erkennen lassen, und gegen vorberechnete Tabellen. Beides trifft auf
# SECRET nicht zu: es gibt genau einen App-Schluessel, und SECRET ist
# Konfiguration mit hoher Entropie, kein von Menschen gewaehltes Wort. Ein
# Zufallssalz muesste dafuer selbst irgendwo liegen und beim Start gefunden
# werden -- mehr bewegliche Teile ohne Gewinn.
_APP_SALZ = b"smeeware:public-chats:v1"


def app_schluessel(secret: str) -> bytes:
    """Der Schluessel fuer Daten, die OHNE Sitzung lesbar sein muessen.

    Geteilte Chats sind der Fall: sie werden von Leuten abgerufen, die nicht
    angemeldet sind, also gibt es keinen Datenschluessel aus einem Passwort.
    An seine Stelle tritt einer aus SECRET.

    Das ist ausdruecklich eine schwaechere Zusage als beim privaten Verlauf:
    wer SECRET und die Datenbank hat, liest geteilte Chats. Genau deshalb
    bekommt sie nur, was jemand bewusst geteilt hat.
    """
    return _scrypt(secret, _APP_SALZ)


def schluessel_einpacken(dek: bytes, passwort: str, salz: bytes) -> bytes:
    """DEK mit einem aus dem Passwort abgeleiteten Schluessel verschliessen."""
    return verschluesseln(dek, _scrypt(passwort, salz))


def schluessel_auspacken(paket: bytes, passwort: str, salz: bytes) -> bytes:
    return entschluesseln_roh(paket, _scrypt(passwort, salz))


def verschluesseln(klartext: bytes, schluessel: bytes) -> bytes:
    """AES-GCM. Der Nonce steht vorne -- er ist kein Geheimnis, nur einmalig.

    GCM traegt seinen Pruefwert selbst: eine veraenderte Zeile in der
    Datenbank faellt beim Entschluesseln auf, statt Unsinn zu liefern.
    """
    nonce = os.urandom(NONCE_BYTES)
    return nonce + AESGCM(schluessel).encrypt(nonce, klartext, None)


def entschluesseln_roh(paket: bytes, schluessel: bytes) -> bytes:
    if len(paket) <= NONCE_BYTES:
        raise ValueError("Ciphertext is too short.")
    nonce, rest = paket[:NONCE_BYTES], paket[NONCE_BYTES:]
    return AESGCM(schluessel).decrypt(nonce, rest, None)


def text_verschluesseln(text: str, schluessel: bytes) -> bytes:
    return verschluesseln(text.encode("utf-8"), schluessel)


def text_entschluesseln(paket: bytes, schluessel: bytes) -> str:
    return entschluesseln_roh(paket, schluessel).decode("utf-8")


# ------------------------------------------------------------------ #
# Einzelne Felder                                                     #
# ------------------------------------------------------------------ #
#
# Titel, Nachrichten und Hinweise liegen in TEXT-Spalten. Statt das Schema
# auf BLOB zu ziehen -- was jede bestehende Datei migrieren muesste --
# traegt der Wert seine Form vorne im Praefix.

PRAEFIX = "enc:v1:"


def feld_ein(text: str, schluessel: bytes) -> str:
    return PRAEFIX + base64.b64encode(
        text_verschluesseln(text, schluessel)
    ).decode("ascii")


def feld_aus(wert: str, schluessel: bytes) -> str:
    """Ohne Praefix unveraendert durchreichen.

    Solche Werte stammen aus der Zeit vor der Verschluesselung -- sie
    scheitern zu lassen hiesse, alte Daten unlesbar zu machen, obwohl sie
    einfach nur im Klartext dastehen.
    """
    if not wert.startswith(PRAEFIX):
        return wert
    return text_entschluesseln(base64.b64decode(wert[len(PRAEFIX) :]), schluessel)
