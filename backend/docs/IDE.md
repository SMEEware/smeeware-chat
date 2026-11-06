# Isolierte VS-Code-Kopplung – IDE-Protokoll v1

Ab Extension **1.1.0** ist ein Backend-Update erforderlich. Die bisherigen
Versionen 1.0.x verwendeten den allgemeinen Chat mit `tools:false` und einem
JSON-Aktionsadapter. Dieser Vertrag ließ weiterhin native `notify_user`- und
`ask_user`-Aufrufe zu und konnte lokale Tools nicht nativ an die Extension
übergeben. Das ist jetzt durch einen eigenen Vertrag ersetzt.

## Ablauf

1. Die Extension authentifiziert sich wie bisher mit Session oder API-Key und
   prüft `/ide/capabilities`. Alte oder abweichende Protokolle werden abgewiesen.
2. `/ide/chat/stream` ruft den Modellprovider direkt mit dem eigenen IDE-Prompt
   und nativen Tool-Spezifikationen auf. Keine normale Agent-/Desktop-Toolbox,
   keine Desktop-Skills, keine Notifications, keine internen Server-Toolrunden.
3. Der SSE-Stream liefert Markdown-Deltas und am Ende genau ein `ide_turn`.
   Dieses enthält die vollständige Assistant-Nachricht, Provider-Reasoning zur
   nötigen Fortsetzung und Tool-Calls mit festem Ziel `client` oder `server_web`.
4. Erst nach dem vollständigen Stream inklusive `[DONE]` validiert die Extension
   Namen, Ziel, Argumentobjekt und eindeutige Call-ID. Projektaktionen laufen
   über die vorhandenen lokalen Datei-/Diff-/Befehlsregeln. Rückfragen sind lokal.
5. Web-Anfragen werden an `/ide/web` geschickt. Dieser RPC prüft eine feste
   Recherche-Freigabeliste und die aktivierten Plugins erneut. Seine getrennte
   Toolbox enthält weder Shell, Dateien, MCP-Aufgaben noch Notification-Bus.
6. Jedes Ergebnis wird als echte `tool`-Nachricht mit Call-ID zurückgegeben.
   Der nächste Modellturn enthält die native Assistant-Nachricht und ihre
   Ergebnisse. Es gibt keine als Nutzernachricht verkleideten Tool-Antworten mehr.

## Endpunkte

Alle Pfade beginnen mit dem Deployment-Prefix und `/api/v1`.

| Endpoint | Zweck |
| --- | --- |
| `GET /ide/capabilities` | Protokollversion, lokale und serverseitige Tool-Namen, Notifications=false |
| `POST /ide/chat/stream` | Ein nativer Modellturn; führt selbst keine Tools aus |
| `POST /ide/web` | Authentifizierte, begrenzte Server-Recherche |
| `POST /ide/completion` | Stille Inline-Ergänzung, direkt beim Provider, ohne Tools |
| `/account/*`, `/models` | Bestehende Anmeldung und Modellwahl |
| `/chat/stream` | Nur der explizit bestätigte separate Servermodus |

`ChatRequest`, `/chat`, `/chats`, Web-App und Electron bleiben auf ihrem bisherigen
Vertrag. `tools:false` wird dort nicht umdefiniert. Der neue Modus erzeugt keine
serverseitige Chat-/Upload-Sitzung für das lokale Projekt.

## Feste Ziele

Client-Tools heißen `vscode_list_files`, `vscode_read_file`, `vscode_search_files`,
`vscode_write_file`, `vscode_replace_text`, `vscode_run_command`,
`vscode_diagnostics` und `vscode_ask_user`.

Die feste Server-Liste besteht aus `web_search`, `google_search`, `brave_answers`,
`fetch_page`, `fetch_json`, `extract_selectors`, `extract_tables`, `list_links`
und `batch_fetch`, jeweils nur wenn konfiguriert und im Backend aktiviert.
Andere Namen werden auch bei direktem RPC-Aufruf abgewiesen. `fetch_json` ist
im IDE-Profil auf GET ohne eigene Header oder Request-Body begrenzt.

Der eigene HTTP-Client für IDE-Recherche nutzt keine Backend-Sitzung oder
Umgebungs-Proxies. DNS-Ziele werden auf öffentliche Adressen geprüft und für die
Verbindung fixiert; Host/TLS-Name und Quellen-URL bleiben erhalten. Redirects
werden erneut geprüft. Suchanbieter-Header werden nicht an fremde Hosts gereicht.

Das Backend kann keine lokalen Projektaktionen ausführen. Die lokale Extension
kann keine Server-Shell über die IDE-API freischalten. Eine Modellanweisung kann
diese Grenzen nicht ändern. Shell-Befehle auf dem VS-Code-Host bleiben normale
Benutzerbefehle und sind keine Sandbox. SSH/WSL/Container benutzen den jeweiligen
Workspace-Host; der Modellserver ist ein anderer Ausführungsort.

## Kontext, Limits und Abbruch

- Modellbudget standardmäßig 16.384 Tokens, `low` Reasoning, clientseitig einstellbar.
- Native Assistant-/Tool-Paare bleiben bei Kontextkürzung zusammen. Reasoning wird
  für benötigte Provider-Fortsetzungen erhalten und nicht als Chattext dargestellt.
- Große Dateien werden mit Offset/Limit gelesen; Ergebnisse für den Modellkontext
  werden begrenzt. Die vollständige lokale Befehlsausgabe bleibt im Output-Kanal.
- Native Call-IDs werden vom Backend pro Übergabe eindeutig vergeben, damit lokale
  Provider mit wiederverwendeten `call_0`-IDs den Verlauf nicht beschädigen.
- Ungültige, doppelte, falsch zugeordnete oder unvollständige Übergaben führen zu
  keiner Aktion. Das Gleiche gilt für unterbrochene Upstream-Modellantworten.
- IDE-Anfragen fordern einen vollständigen Provider-Abschluss. Token-/Contextlimit,
  fehlender Abschluss oder Responses-`incomplete` verwerfen alle pending Calls.
  Normale Web-/Desktop-Anfragen behalten das bisherige Provider-Verhalten.
- Bei Abbruch werden native Paare mit klaren Stopp-/Nicht-ausgeführt-Ergebnissen
  geschlossen. Erledigte Aktionen werden nicht automatisch erneut ausgeführt.
- Drei identische aufeinanderfolgende Anfragen und das lokale Aktionslimit stoppen
  Modellschleifen. Rückfragen pausieren alle anderen Calls desselben Batches.

## Backend ausrollen

Die Backend-Änderungen gehören zu diesem Repository; die VS-Code-Extension liegt im benachbarten `smeeware-chat-vscode`-Projekt. Das Release
enthält außerdem `backend-ide-protocol-v1.patch` und ein ZIP mit den geänderten
Backend-Dateien. Vor dem Patch aus dem **Repository-Stamm** prüfen:

```sh
git apply --check /path/to/backend-ide-protocol-v1.patch
git apply /path/to/backend-ide-protocol-v1.patch
```

Bei bereits integrierten Dateien den Patch nicht erneut anwenden. Es sind keine
neuen Python-Abhängigkeiten, Umgebungsvariablen oder Datenbankmigrationen nötig.
Den Backend-Prozess mit dem bestehenden Deployment-Verfahren neu starten bzw.
das Backend-Container-Image neu bauen. Dann mit vorhandener Session/API-Key
`GET /api/v1/ide/capabilities` prüfen. Bei aktivem API-Key-Schutz ist auch dieser
Endpoint geschützt. Erwartet: `protocol:1`, `client:vscode`, `notifications:false`.
Die Proxy-Konfiguration muss `/api/v1/ide/*` durchreichen und SSE nicht puffern.

Danach die VSIX 1.1.0 installieren, das VS-Code-Fenster neu laden und einen neuen
Coding-Chat starten. Die neue Extension sendet an alte Backends keine normalen
Agentenanfragen als stillen Fallback.
