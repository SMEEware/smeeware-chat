import type { Locale } from "@/lib/i18n/config";

export function td(locale: Locale, text: string): string {
  if (locale === "de") return docsDe[text] ?? text;
  return text;
}

export const docsDe: Record<string, string> = {
  // chat/steering
  "You don't have to wait for an answer to finish. Keep typing while the model works — your message joins the running turn at the next step, the way a colleague takes a note mid-task.":
    "Du musst nicht warten, bis eine Antwort fertig ist. Tipp weiter, während das Modell arbeitet — deine Nachricht fließt beim nächsten Schritt in die laufende Runde ein, so wie ein Kollege mitten in der Aufgabe eine Notiz entgegennimmt.",
  "How it works": "So funktioniert's",
  "Type while it answers": "Tippen, während es antwortet",
  "Press Enter as usual. The message appears above the box as queued — nothing is interrupted.":
    "Drück Enter wie gewohnt. Die Nachricht erscheint über dem Feld als wartend — nichts wird unterbrochen.",
  "Picked up at the next step": "Beim nächsten Schritt aufgenommen",
  "Between tool calls the agent checks for new messages. Yours is added to the conversation and the model continues with it in mind — changing course, adding a detail, or answering both.":
    "Zwischen Werkzeugaufrufen prüft der Agent auf neue Nachrichten. Deine wird der Unterhaltung hinzugefügt, und das Modell macht mit ihr im Hinterkopf weiter — ändert den Kurs, ergänzt ein Detail oder beantwortet beides.",
  "Or sent right after": "Oder direkt danach gesendet",
  "If the model is already writing its final answer, there is no next step to join. Your message then goes out as the next question the moment the answer is done.":
    "Schreibt das Modell schon an seiner finalen Antwort, gibt es keinen nächsten Schritt mehr. Deine Nachricht geht dann als nächste Frage raus, sobald die Antwort fertig ist.",
  "Changed your mind?": "Es dir anders überlegt?",
  "Queued messages can be withdrawn with the × until the agent picks them up. Pressing stop puts anything still queued back into the input box.":
    "Wartende Nachrichten lassen sich mit dem × zurückziehen, bis der Agent sie aufnimmt. Stopp drücken legt alles noch Wartende zurück ins Eingabefeld.",
  "Over the API": "Über die API",
  "Pass a stream_id of your choice with POST /chat/stream. While it runs, POST /chat/stream/{stream_id}/steer with id and content adds a message. To add files, include attachment_ids and the same chat_id, using the stream's active session. A steer frame acknowledges the message. A 409 means the turn ended; send a normal next turn instead. DELETE /chat/stream/{stream_id}/steer/{id} withdraws a message that has not been picked up.":
    "Gib bei POST /chat/stream eine stream_id deiner Wahl mit. Während der Stream läuft, fügt POST /chat/stream/{stream_id}/steer mit id und content eine Nachricht hinzu. Für Dateien sende attachment_ids und dieselbe chat_id mit der aktiven Sitzung des Streams. Ein steer-Frame bestätigt die Nachricht. Ein 409 heißt, die Runde ist beendet; sende stattdessen eine normale nächste Runde. DELETE /chat/stream/{stream_id}/steer/{id} zieht eine noch nicht aufgenommene Nachricht zurück.",
  "Stops, errors and cut-offs": "Stopps, Fehler und Abbrüche",
  "A chat stays usable whatever happens to a turn. Answers stopped while thinking, answers cut off by a lost connection, and very long answers are all tidied up before the next question goes out — empty replies are dropped or marked, consecutive questions are merged, and oversized messages are shortened in the middle. A connection that drops mid-answer is shown as interrupted with a Try again button, instead of silently looking finished.":
    "Ein Chat bleibt nutzbar, egal was mit einer Runde passiert. Beim Denken gestoppte Antworten, durch eine verlorene Verbindung abgebrochene Antworten und sehr lange Antworten werden alle aufgeräumt, bevor die nächste Frage rausgeht — leere Antworten werden verworfen oder markiert, aufeinanderfolgende Fragen zusammengeführt und übergroße Nachrichten in der Mitte gekürzt. Eine Verbindung, die mitten in der Antwort abbricht, wird als unterbrochen mit einem „Erneut versuchen“-Knopf gezeigt, statt still fertig auszusehen.",
  // chat/voice-call
  "Talk to the chat like a phone call. It listens, notices when you have finished, and answers aloud while the answer is still being written. Every turn lands in the chat as text.":
    "Rede mit dem Chat wie bei einem Telefonat. Er hört zu, merkt, wann du fertig bist, und antwortet laut, während die Antwort noch geschrieben wird. Jede Runde landet als Text im Chat.",
  "Start a call": "Einen Anruf starten",
  "With an empty message box, the waveform button next to Send starts the call — or type /call, or run Voice call from the palette. Press the green button to begin — your browser asks for the microphone once. Esc or the red button hangs up.":
    "Bei leerem Nachrichtenfeld startet der Wellenform-Button neben „Senden“ den Anruf — oder tipp /call, oder führ „Sprachanruf“ aus der Palette aus. Drück den grünen Knopf zum Start — dein Browser fragt einmal nach dem Mikrofon. Esc oder der rote Knopf legt auf.",
  "Voices and transcription": "Stimmen und Transkription",
  "Neural voices without a key or quota. The multilingual ones (Seraphina, Florian, Ava, Andrew) switch languages mid-sentence without changing voice. If the voice service is unreachable, the browser's own voice takes over.":
    "Neuronale Stimmen ohne Schlüssel oder Kontingent. Die mehrsprachigen (Seraphina, Florian, Ava, Andrew) wechseln die Sprache mitten im Satz, ohne die Stimme zu ändern. Ist der Stimmen-Dienst nicht erreichbar, übernimmt die browsereigene Stimme.",
  "Whatever transcriber you picked in the settings — the same one the microphone button uses.":
    "Der Transkribierer, den du in den Einstellungen gewählt hast — derselbe, den auch der Mikrofon-Knopf nutzt.",
  Interrupting: "Unterbrechen",
  "Start talking while it speaks — or while it is still thinking — and it stops, listens, and treats what you said as the next question, first word included. The hand button and a tap on the orb stop it too.":
    "Fang an zu reden, während es spricht — oder während es noch denkt — und es stoppt, hört zu und behandelt das Gesagte als nächste Frage, inklusive erstem Wort. Der Hand-Knopf und ein Tipp auf die Kugel stoppen es ebenfalls.",
  "When the voice hears itself": "Wenn die Stimme sich selbst hört",
  "The voice is played back like the other side of a video call, so the browser's echo cancellation knows to remove it from the microphone. Where that is not enough — some Android browsers on speaker — an interruption is only paused until it is transcribed: if what it heard is just the voice's own words, it keeps talking and switches this device to tap-to-interrupt. You can turn talking-over back on in the voice menu, for example once you use headphones.":
    "Die Stimme wird wie die Gegenseite eines Videoanrufs wiedergegeben, damit die Echo-Unterdrückung des Browsers sie aus dem Mikrofon entfernt. Wo das nicht reicht — manche Android-Browser über Lautsprecher — wird eine Unterbrechung nur pausiert, bis sie transkribiert ist: War das Gehörte nur die Stimme selbst, redet sie weiter und schaltet dieses Gerät auf Tipp-zum-Unterbrechen. Im Stimmen-Menü kannst du Dazwischenreden wieder einschalten, etwa sobald du Kopfhörer nutzt.",
  "Answers made for listening": "Antworten zum Zuhören",
  "Questions asked in a call are sent with mode set to call. The backend then adds speaking rules to the persona's system prompt: short, clear sentences, no lists, tables, brackets or emojis, and numbers written the way they are said. The persona itself stays the same, and the answer still lands in the chat as text.":
    "In einem Anruf gestellte Fragen werden mit mode auf call gesendet. Das Backend fügt dem System-Prompt der Persona dann Sprechregeln hinzu: kurze, klare Sätze, keine Listen, Tabellen, Klammern oder Emojis, und Zahlen so geschrieben, wie man sie sagt. Die Persona selbst bleibt gleich, und die Antwort landet weiterhin als Text im Chat.",
  // chat/commands
  "Every action in the chat lives in one catalog. Two surfaces read it: the command palette and the slash menu. They can never drift apart, because there is only one list behind both.":
    "Jede Aktion im Chat lebt in einem Katalog. Zwei Oberflächen lesen ihn: die Befehlspalette und das Slash-Menü. Sie können nie auseinanderdriften, weil hinter beiden nur eine Liste steht.",
  "The command palette": "Die Befehlspalette",
  "Press ⌘K (Ctrl+K on Windows and Linux) anywhere in the chat to open the palette. It shows the whole catalog — grouped by purpose — plus your open chats, your workspaces, and your personas. Start typing to filter across labels, descriptions and keywords at once.":
    "Drück ⌘K (Strg+K unter Windows und Linux) irgendwo im Chat, um die Palette zu öffnen. Sie zeigt den ganzen Katalog — nach Zweck gruppiert — plus deine offenen Chats, Workspaces und Personas. Fang an zu tippen, um gleichzeitig über Namen, Beschreibungen und Schlagwörter zu filtern.",
  "Dynamic groups": "Dynamische Gruppen",
  "Some groups are filled at runtime: your Chats, Workspaces and Personas, the Answer / Transcription / Read-aloud model pickers, and “Reference a chat”. Selecting a persona switches the system prompt, a model switches what answers, and a referenced chat pulls its transcript into the box as context.":
    "Manche Gruppen werden zur Laufzeit gefüllt: deine Chats, Workspaces und Personas, die Auswahl für Antwort-/Transkriptions-/Vorlese-Modell und „Auf einen Chat beziehen“. Eine Persona zu wählen wechselt den System-Prompt, ein Modell wechselt, was antwortet, und ein referenzierter Chat zieht seinen Verlauf als Kontext ins Feld.",
  "The slash menu": "Das Slash-Menü",
  "Type / at the start of a word in the message box to open the slash menu. It carries the quick, in-flow commands: actions like /new, /attach and /record, and templates like /prompt, /spec, /plan and /image. Arrow keys move, Enter runs, Esc closes.":
    "Tipp / am Anfang eines Wortes im Nachrichtenfeld, um das Slash-Menü zu öffnen. Es trägt die schnellen Befehle für zwischendurch: Aktionen wie /new, /attach und /record sowie Vorlagen wie /prompt, /spec, /plan und /image. Pfeiltasten bewegen, Enter führt aus, Esc schließt.",
  "Templates do not send anything on their own. They drop a fill-in scaffold into the message box; you replace the placeholders and send, and the model turns your notes into the finished prompt, spec, plan or image request.":
    "Vorlagen senden von sich aus nichts. Sie legen ein Ausfüll-Gerüst ins Nachrichtenfeld; du ersetzt die Platzhalter und sendest, und das Modell macht aus deinen Notizen den fertigen Prompt, die Spezifikation, den Plan oder die Bildanfrage.",
  "How commands are grouped": "Wie Befehle gruppiert sind",
  "Start, share and manage conversations.": "Unterhaltungen starten, teilen und verwalten.",
  "Drop a ready-made template into the message.": "Eine fertige Vorlage in die Nachricht einfügen.",
  "The workspace and references the model works from.": "Der Workspace und die Referenzen, mit denen das Modell arbeitet.",
  "Bring files and voice into the message.": "Dateien und Stimme in die Nachricht bringen.",
  "Pick what answers, transcribes and speaks.": "Wähle, was antwortet, transkribiert und spricht.",
  "Swap the system prompt behind the answers.": "Tausche den System-Prompt hinter den Antworten.",
  "Thinking, tools, notifications and theme.": "Denken, Werkzeuge, Hinweise und Thema.",
  "Jump to the docs, account and settings.": "Zur Doku, zum Konto und zu den Einstellungen springen.",
  "Keys for the API.": "Schlüssel für die API.",
  "Keyboard shortcuts": "Tastenkürzel",
  "Open the command palette.": "Die Befehlspalette öffnen.",
  "Start a new chat.": "Einen neuen Chat starten.",
  "Attach files.": "Dateien anhängen.",
  "Start voice recording.": "Sprachaufnahme starten.",
  "The shortcut list in the sidebar footer is generated from the same catalog, so a key printed there always matches what the command actually does.":
    "Die Kürzelliste in der Seitenleisten-Fußzeile wird aus demselben Katalog erzeugt, sodass eine dort gedruckte Taste immer zu dem passt, was der Befehl tatsächlich tut.",
  // chat/workspaces
  "A workspace is the context you are working in — a project, a folder, a set of notes. The active workspace rides along with every message, so the model always knows which project and path you mean.":
    "Ein Workspace ist der Kontext, in dem du arbeitest — ein Projekt, ein Ordner, ein Satz Notizen. Der aktive Workspace reist mit jeder Nachricht mit, damit das Modell immer weiß, welches Projekt und welchen Pfad du meinst.",
  "Create a workspace": "Einen Workspace anlegen",
  "Open the manager": "Den Manager öffnen",
  "Click the folder pill in the message bar, run “Workspaces” from the palette, or type /workspace.":
    "Klick auf die Ordner-Pille in der Nachrichtenleiste, führ „Workspaces“ aus der Palette aus oder tipp /workspace.",
  "Pick a folder": "Einen Ordner wählen",
  "Give it a name and notes, then Browse. The browser lists the folders on the machine the agent runs on — locally that's your computer, deployed it's the agent's host — so the path always points somewhere the agent's tools can reach. You can also paste an absolute path.":
    "Gib ihm Namen und Notizen, dann „Durchsuchen“. Der Browser listet die Ordner auf dem Rechner, auf dem der Agent läuft — lokal dein Computer, deployed der Host des Agenten — sodass der Pfad immer irgendwohin zeigt, das die Werkzeuge des Agenten erreichen. Du kannst auch einen absoluten Pfad einfügen.",
  "Make it active": "Aktiv setzen",
  "The first workspace you add becomes active automatically. Click any workspace to activate it; click the active one again to work with no context.":
    "Der erste Workspace, den du hinzufügst, wird automatisch aktiv. Klick einen beliebigen an, um ihn zu aktivieren; klick den aktiven erneut an, um ohne Kontext zu arbeiten.",
  "How it reaches the model": "Wie es zum Modell gelangt",
  "The active workspace is attached to your latest message as a short context block — name, path and notes — right before the request goes out. It is never stored in the transcript, so switching workspaces mid-conversation always reflects the one active right now.":
    "Der aktive Workspace wird deiner letzten Nachricht als kurzer Kontextblock angehängt — Name, Pfad und Notizen — kurz bevor die Anfrage rausgeht. Er wird nie im Verlauf gespeichert, sodass ein Wechsel mitten im Gespräch immer den gerade aktiven widerspiegelt.",
  "Where they live": "Wo sie leben",
  "Your list of workspaces lives in your browser, next to your other preferences — the context travels as text with each message. The folder browser reads the agent's host over an authenticated endpoint (GET /fs), listing directories only, never file contents.":
    "Deine Workspace-Liste lebt in deinem Browser, neben deinen anderen Einstellungen — der Kontext reist als Text mit jeder Nachricht. Der Ordner-Browser liest den Host des Agenten über einen authentifizierten Endpunkt (GET /fs) und listet nur Verzeichnisse, nie Dateiinhalte.",
  // overview
  "The Smeeware API answers chat requests as a stream. These docs take you from your first call to the full endpoint reference.":
    "Die Smeeware-API beantwortet Chat-Anfragen als Stream. Diese Doku nimmt dich vom ersten Aufruf bis zur vollständigen Endpunkt-Referenz mit.",
  Quickstart: "Schnellstart",
  "Your first call in under five minutes.": "Dein erster Aufruf in unter fünf Minuten.",
  Authentication: "Authentifizierung",
  "Create keys and use them safely.": "Schlüssel erstellen und sicher verwenden.",
  Streaming: "Streaming",
  "Process answers token by token.": "Antworten Token für Token verarbeiten.",
  Endpoints: "Endpunkte",
  "Every route with parameters and examples.": "Jede Route mit Parametern und Beispielen.",
  "How the docs are organized": "Wie die Doku aufgebaut ist",
  "The docs are grouped into four tracks. Getting started takes you from an empty project to a first streamed answer. Basics covers what every call relies on — authentication, the request and response shape, streaming, attachments, errors and rate limits. Endpoints is the full reference, one page per route. Chat app documents the bundled web client: the command palette, workspaces, steering and the voice call.":
    "Die Doku ist in vier Stränge gegliedert. Erste Schritte führt dich vom leeren Projekt zur ersten gestreamten Antwort. Grundlagen behandelt, worauf jeder Aufruf baut — Authentifizierung, die Form von Anfrage und Antwort, Streaming, Anhänge, Fehler und Rate-Limits. Endpunkte ist die vollständige Referenz, eine Seite pro Route. Chat-App dokumentiert den mitgelieferten Web-Client: die Befehlspalette, Workspaces, das Steuern und den Sprachanruf.",
  "Every endpoint page follows the same layout: a short lead, the parameters, an example request, and the response.":
    "Jede Endpunkt-Seite folgt demselben Aufbau: eine kurze Einleitung, die Parameter, eine Beispielanfrage und die Antwort.",
  Conventions: "Konventionen",
  "Examples come as cURL, TypeScript and Python — pick the tab you like. The base URL is written as https://your-host/api/v1; locally that is http://127.0.0.1:8000/api/v1. Anything in UPPER_CASE is an environment variable, and sk_smee_… stands in for a real API key.":
    "Beispiele gibt es als cURL, TypeScript und Python — wähl den Tab, den du magst. Die Basis-URL steht als https://dein-host/api/v1; lokal ist das http://127.0.0.1:8000/api/v1. Alles in GROSSBUCHSTABEN ist eine Umgebungsvariable, und sk_smee_… steht für einen echten API-Schlüssel.",
  // getting-started
  "From an empty project to your first streamed answer — three steps, no setup beyond an API key.":
    "Vom leeren Projekt zur ersten gestreamten Antwort — drei Schritte, kein Setup außer einem API-Schlüssel.",
  Prerequisites: "Voraussetzungen",
  "You need a running backend and, if it is reachable over the network, an API key. Locally the backend trusts localhost, so a bare request works with no key at all. Node 18+ or Python 3.10+ is enough to run the examples below.":
    "Du brauchst ein laufendes Backend und, falls es über das Netz erreichbar ist, einen API-Schlüssel. Lokal vertraut das Backend localhost, sodass eine blanke Anfrage ganz ohne Schlüssel funktioniert. Node 18+ oder Python 3.10+ reicht, um die Beispiele unten auszuführen.",
  "Create a key": "Einen Schlüssel erstellen",
  "Create a new key in the dashboard under Settings → API keys.":
    "Erstelle einen neuen Schlüssel im Dashboard unter Einstellungen → API-Schlüssel.",
  "Set an environment variable": "Eine Umgebungsvariable setzen",
  "Store the key as SMEEWARE_API_KEY, never directly in source.":
    "Speichere den Schlüssel als SMEEWARE_API_KEY, nie direkt im Quellcode.",
  "Send your first call": "Deinen ersten Aufruf senden",
  "Copy the example below and run it — the answer comes back as a stream.":
    "Kopier das Beispiel unten und führ es aus — die Antwort kommt als Stream zurück.",
  "First call": "Erster Aufruf",
  "Send a list of messages and a model id. The answer streams back as Server-Sent Events — one JSON frame per line.":
    "Schick eine Liste von Nachrichten und eine Modell-ID. Die Antwort streamt als Server-Sent Events zurück — ein JSON-Frame pro Zeile.",
  "Next steps": "Nächste Schritte",
  "From here, learn how to read the stream frame by frame, how to recover from errors and rate limits, and what each endpoint accepts. The two cards below are the usual next stops.":
    "Von hier aus lernst du, wie du den Stream Frame für Frame liest, wie du dich von Fehlern und Rate-Limits erholst und was jeder Endpunkt akzeptiert. Die beiden Karten unten sind die üblichen nächsten Stationen.",
  "Process tokens one at a time instead of waiting.":
    "Token einzeln verarbeiten, statt zu warten.",
  "Error handling": "Fehlerbehandlung",
  "What to do on a timeout or a 429.": "Was bei einem Timeout oder einem 429 zu tun ist.",
  // installation
  "There is nothing to install yet. You call the HTTP API directly — a bearer token and a request. Typed SDKs for TypeScript, Python and Go are on the way.":
    "Es gibt noch nichts zu installieren. Du rufst die HTTP-API direkt auf — ein Bearer-Token und eine Anfrage. Typisierte SDKs für TypeScript, Python und Go sind unterwegs.",
  "SDKs are coming": "SDKs kommen",
  "Official clients will wrap this API as thin, typed packages (npm, pip, go get). Nothing about the API changes when they land — build against the HTTP endpoints today and swap in a client later.":
    "Offizielle Clients werden diese API als dünne, typisierte Pakete umhüllen (npm, pip, go get). An der API ändert sich dabei nichts — bau heute gegen die HTTP-Endpunkte und tausch später einen Client ein.",
  "Call it with curl": "Mit curl aufrufen",
  "Send your key as a bearer token. Locally, against your own machine, no key is needed at all — a bare request works. See Authentication for when keys are required and how to create one.":
    "Schick deinen Schlüssel als Bearer-Token. Lokal, gegen deinen eigenen Rechner, braucht es gar keinen Schlüssel — eine blanke Anfrage funktioniert. Unter Authentifizierung steht, wann Schlüssel nötig sind und wie du einen erstellst.",
  Configuration: "Konfiguration",
  "Keep the key and the base URL in your environment rather than in code. Locally the base URL is http://127.0.0.1:8000/api/v1 and no key is needed; in production use your own host and a key created under Settings → API keys.":
    "Halte Schlüssel und Basis-URL in deiner Umgebung statt im Code. Lokal ist die Basis-URL http://127.0.0.1:8000/api/v1 und es braucht keinen Schlüssel; in Produktion nimm deinen eigenen Host und einen unter Einstellungen → API-Schlüssel erstellten Schlüssel.",
  "Keep your .env out of version control. Rotate any accidentally published key immediately.":
    "Halte deine .env aus der Versionsverwaltung heraus. Rotiere jeden versehentlich veröffentlichten Schlüssel sofort.",
  "Point your client — or your own fetch calls — at the backend and give it the API key. Locally the base URL is http://127.0.0.1:8000/api/v1 and no key is needed; in production use your own host and a key created under Settings → API keys.":
    "Richte deinen Client — oder deine eigenen fetch-Aufrufe — auf das Backend und gib ihm den API-Schlüssel. Lokal ist die Basis-URL http://127.0.0.1:8000/api/v1 und es braucht keinen Schlüssel; in Produktion nimm deinen eigenen Host und einen unter Einstellungen → API-Schlüssel erstellten Schlüssel.",
  "Don't commit keys": "Keine Schlüssel committen",
  "Keep .env.local in .gitignore. Rotate any accidentally published key immediately.":
    "Halte .env.local in der .gitignore. Rotiere jeden versehentlich veröffentlichten Schlüssel sofort.",
  // authentication
  "Locally the backend trusts localhost and needs no key. The moment you expose it, an API key becomes the ticket in — sent as a bearer token in the Authorization header.":
    "Lokal vertraut das Backend localhost und braucht keinen Schlüssel. Sobald du es nach außen stellst, wird ein API-Schlüssel zur Eintrittskarte — als Bearer-Token im Authorization-Header geschickt.",
  "Your account is ready for external access.": "Dein Konto ist bereit für externen Zugriff.",
  "Manage API keys": "API-Schlüssel verwalten",
  "When keys are required": "Wann Schlüssel nötig sind",
  "Key checks are off by default so a plain curl against your own machine keeps working. Start the backend with REQUIRE_API_KEY=true and the inference endpoints (chat, transcribe, vision) begin turning away anyone without proof: either an open session — that is your own frontend — or a valid API key.":
    "Schlüsselprüfungen sind standardmäßig aus, damit ein blankes curl gegen deinen eigenen Rechner weiter funktioniert. Starte das Backend mit REQUIRE_API_KEY=true, und die Inferenz-Endpunkte (chat, transcribe, vision) weisen jeden ohne Nachweis ab: entweder eine offene Sitzung — also dein eigenes Frontend — oder ein gültiger API-Schlüssel.",
  "Keys belong to your account. Open Settings → API keys, create one, and copy it right then — the full key is shown exactly once. Afterwards only a hash lives in the database, so nobody, not even the server, can show it to you again. Lose it and you revoke it and make a new one.":
    "Schlüssel gehören zu deinem Konto. Öffne Einstellungen → API-Schlüssel, erstelle einen und kopier ihn gleich — der vollständige Schlüssel wird genau einmal gezeigt. Danach liegt nur ein Hash in der Datenbank, sodass ihn niemand, nicht einmal der Server, dir erneut zeigen kann. Verlierst du ihn, widerrufst du ihn und erstellst einen neuen.",
  "Every key starts with sk_smee_ so a leaked one is easy to spot. Delete a key to revoke it immediately; deleting your account takes all of its keys with it.":
    "Jeder Schlüssel beginnt mit sk_smee_, damit ein geleakter leicht zu erkennen ist. Lösch einen Schlüssel, um ihn sofort zu widerrufen; dein Konto zu löschen nimmt all seine Schlüssel mit.",
  "Send it with a request": "Mit einer Anfrage mitschicken",
  "Bearer followed by your secret key. Required on inference endpoints once REQUIRE_API_KEY is on.":
    "Bearer gefolgt von deinem geheimen Schlüssel. Auf Inferenz-Endpunkten nötig, sobald REQUIRE_API_KEY an ist.",
  "The frontend's own way in — its session, forwarded automatically. You won't set this by hand.":
    "Der eigene Zugang des Frontends — seine Sitzung, automatisch weitergereicht. Das setzt du nicht von Hand.",
  "Server-side only": "Nur serverseitig",
  "A key is a secret. Keep it out of client code and public repos — put it behind your own backend route and rotate any key that slips out.":
    "Ein Schlüssel ist ein Geheimnis. Halt ihn aus Client-Code und öffentlichen Repos heraus — leg ihn hinter deine eigene Backend-Route und rotier jeden Schlüssel, der nach außen gerät.",
  // requests
  "Every endpoint speaks JSON over HTTP. Shape, encoding, and response format are the same everywhere.":
    "Jeder Endpunkt spricht JSON über HTTP. Form, Kodierung und Antwortformat sind überall gleich.",
  "Base URL": "Basis-URL",
  "Every path hangs off api_prefix — /api/v1 by default. In the examples the backend runs locally at http://localhost:8000.":
    "Jeder Pfad hängt an api_prefix — standardmäßig /api/v1. In den Beispielen läuft das Backend lokal unter http://localhost:8000.",
  "Chat body limits": "Grenzen des Chat-Body",
  "role is system | user | assistant; content allows up to 400000 characters. User messages can include attachment_ids.":
    "role ist system | user | assistant; content erlaubt bis zu 400000 Zeichen. Nutzernachrichten können attachment_ids enthalten.",
  "Required with attachment_ids. Identifies the conversation that owns the uploaded files and working directory.":
    "Mit attachment_ids erforderlich. Kennzeichnet die Unterhaltung, zu der die hochgeladenen Dateien und das Arbeitsverzeichnis gehören.",
  "null = default from configuration.": "null = Vorgabe aus der Konfiguration.",
  "Counts thinking tokens on reasoning models.": "Zählt bei Reasoning-Modellen Denk-Token mit.",
  "null = default.": "null = Vorgabe.",
  Stateless: "Zustandslos",
  "Send the full message history with every chat call. A chat_id links file references and the working directory across turns; it does not add earlier messages to the request automatically.":
    "Schick bei jedem Chat-Aufruf den vollständigen Nachrichtenverlauf mit. Eine chat_id verknüpft Dateireferenzen und das Arbeitsverzeichnis über mehrere Runden; sie fügt frühere Nachrichten nicht automatisch zur Anfrage hinzu.",
  // streaming
  "Instead of waiting for the full answer, the API delivers Server-Sent Events — token by token.":
    "Statt auf die volle Antwort zu warten, liefert die API Server-Sent Events — Token für Token.",
  Endpoint: "Endpunkt",
  "Streaming runs over POST /api/v1/chat/stream with the same body as /chat. The response is a text/event-stream of data: lines, each a JSON frame with a type, terminated by data: [DONE].":
    "Streaming läuft über POST /api/v1/chat/stream mit demselben Body wie /chat. Die Antwort ist ein text/event-stream aus data:-Zeilen, jede ein JSON-Frame mit einem type, abgeschlossen durch data: [DONE].",
  Order: "Reihenfolge",
  "reasoning* → (tool_call → tool_result)* → content* → [DONE]. Multiple rounds are normal. Always link tool_call and tool_result by call_id, never by order.":
    "reasoning* → (tool_call → tool_result)* → content* → [DONE]. Mehrere Runden sind normal. Verknüpfe tool_call und tool_result immer über call_id, nie über die Reihenfolge.",
  "Frame types": "Frame-Typen",
  "The model's reasoning (reasoning models only, comes first). Kept separate from the content.":
    "Das Denken des Modells (nur Reasoning-Modelle, kommt zuerst). Getrennt vom content gehalten.",
  "A chunk of the visible answer. Appended continuously and rendered as Markdown.":
    "Ein Stück der sichtbaren Antwort. Laufend angehängt und als Markdown gerendert.",
  "A tool is being called. arguments is an object.": "Ein Werkzeug wird aufgerufen. arguments ist ein Objekt.",
  "Result. ok=false = failure, preview then carries the message.":
    "Ergebnis. ok=false = Fehlschlag, preview trägt dann die Meldung.",
  "Error after the stream started — as its own event: error event; the stream ends afterwards.":
    "Fehler nach Streamstart — als eigenes event: error-Ereignis; der Stream endet danach.",
  Aborting: "Abbrechen",
  "An AbortController ends the stream cleanly; tokens already received stay valid.":
    "Ein AbortController beendet den Stream sauber; bereits empfangene Token bleiben gültig.",
  // errors
  "Errors before the first byte come as an HTTP status; errors mid-stream come as a frame.":
    "Fehler vor dem ersten Byte kommen als HTTP-Status; Fehler mitten im Stream kommen als Frame.",
  "Error envelope": "Fehler-Hülle",
  "Every error comes in the same shape. details is optional and only set on body validation.":
    "Jeder Fehler kommt in derselben Form. details ist optional und nur bei Body-Validierung gesetzt.",
  Codes: "Codes",
  "Invalid body or parameter, empty or corrupt image file.":
    "Ungültiger Body oder Parameter, leere oder beschädigte Bilddatei.",
  "Authentication missing or invalid.": "Authentifizierung fehlt oder ist ungültig.",
  "Provider quota exhausted.": "Anbieter-Kontingent erschöpft.",
  "Misconfiguration, e.g. VISION_ENABLED=false on a vision call.":
    "Fehlkonfiguration, z. B. VISION_ENABLED=false bei einem Vision-Aufruf.",
  "Unexpected error in the backend.": "Unerwarteter Fehler im Backend.",
  "Upstream returns nothing usable.": "Der Upstream liefert nichts Verwertbares.",
  "Upstream is too slow.": "Der Upstream ist zu langsam.",
  "In the stream": "Im Stream",
  "On /chat/stream the error does not come as an HTTP status (that is 200 by then) but as an event: error frame with the same error object.":
    "Bei /chat/stream kommt der Fehler nicht als HTTP-Status (der ist dann 200), sondern als event: error-Frame mit demselben error-Objekt.",
  // rate-limits
  "Quotas apply per key and are reported back through response headers.":
    "Kontingente gelten pro Schlüssel und werden über Antwort-Header zurückgemeldet.",
  Headers: "Header",
  "Requests allowed in the current window.": "Im aktuellen Zeitfenster erlaubte Anfragen.",
  "Requests remaining in the current window.": "Im aktuellen Zeitfenster verbleibende Anfragen.",
  "How long to wait after a 429 before retrying.":
    "Wie lange nach einem 429 vor dem erneuten Versuch zu warten ist.",
  Quotas: "Kontingente",
  "Rate limits are per API key. When you exceed one, the API answers 429 with a Retry-After header saying how many seconds to wait. Local, keyless use is not rate limited. See Rate limits for the headers that report your remaining quota.":
    "Rate-Limits gelten pro API-Schlüssel. Überschreitest du eins, antwortet die API mit 429 und einem Retry-After-Header, der sagt, wie viele Sekunden zu warten sind. Lokale, schlüssellose Nutzung wird nicht limitiert. Siehe Rate-Limits für die Header, die dein verbleibendes Kontingent melden.",
  // endpoints overview
  "Every endpoint lives under the base /api/v1. Send the full history with every chat call; chat_id keeps file references and working files associated with the conversation.":
    "Jeder Endpunkt liegt unter der Basis /api/v1. Sende bei jedem Chat-Aufruf den vollständigen Verlauf; chat_id ordnet Dateireferenzen und Arbeitsdateien der Unterhaltung zu.",
  "Liveness — is the process running?": "Lebendigkeit — läuft der Prozess?",
  "Readiness — is the LLM provider reachable?": "Bereitschaft — ist der LLM-Anbieter erreichbar?",
  "Answer in one piece as JSON.": "Antwort am Stück als JSON.",
  "Answer as SSE — thinking, tools, answer.": "Antwort als SSE — Denken, Werkzeuge, Antwort.",
  "The models /chat accepts.": "Die Modelle, die /chat akzeptiert.",
  "Every registered tool with its schema.": "Jedes registrierte Werkzeug mit seinem Schema.",
  "Look at images by address (JSON).": "Bilder per Adresse ansehen (JSON).",
  "Look at uploaded image files (multipart).": "Hochgeladene Bilddateien ansehen (multipart).",
  "List system prompts.": "System-Prompts auflisten.",
  "Fetch one prompt verbatim.": "Einen Prompt wortgetreu abrufen.",
  "Non-production only": "Nur außerhalb von Produktion",
  "GET /docs (Swagger UI) and GET /openapi.json are only available when the environment is not production.":
    "GET /docs (Swagger UI) und GET /openapi.json sind nur verfügbar, wenn die Umgebung nicht production ist.",
  // chat endpoint
  "Takes the full history and produces the next answer in one piece. Tools run internally in the agent loop — this response shows only the final result; the intermediate steps are visible only in the stream.":
    "Nimmt den vollen Verlauf und erzeugt die nächste Antwort am Stück. Werkzeuge laufen intern in der Agent-Schleife — diese Antwort zeigt nur das Endergebnis; die Zwischenschritte sind nur im Stream sichtbar.",
  Parameters: "Parameter",
  "The full history in order. Each message has a role (system | user | assistant) and content (up to 400000 characters). User messages may include attachment_ids, an array of uploaded file IDs within UPLOADS_MAX_FILES.":
    "Der vollständige Verlauf in Reihenfolge. Jede Nachricht hat eine role (system | user | assistant) und content (bis zu 400000 Zeichen). Nutzernachrichten können attachment_ids enthalten, eine Liste hochgeladener Datei-IDs innerhalb von UPLOADS_MAX_FILES.",
  "Enable available tools. Reading, unpacking and editing attachments requires true.":
    "Verfügbare Werkzeuge aktivieren. Das Lesen, Entpacken und Bearbeiten von Anhängen benötigt true.",
  "An id from GET /models. null = default from the backend configuration.":
    "Eine id aus GET /models. null = Vorgabe aus der Backend-Konfiguration.",
  "Creativity. Lower = more predictable. null = default.":
    "Kreativität. Niedriger = vorhersehbarer. null = Vorgabe.",
  "Upper bound on answer length incl. thinking tokens. null = default.":
    "Obergrenze der Antwortlänge inkl. Denk-Token. null = Vorgabe.",
  "Nucleus sampling. null = default.": "Nucleus-Sampling. null = Vorgabe.",
  "For read_aloud: the ElevenLabs voice to speak with. null = the configured default. The model never picks this — the caller does.":
    "Für read_aloud: die ElevenLabs-Stimme zum Sprechen. null = die konfigurierte Vorgabe. Das Modell wählt das nie — der Aufrufer schon.",
  "For read_aloud: an id from GET /tts/models. null = the configured default.":
    "Für read_aloud: eine id aus GET /tts/models. null = die konfigurierte Vorgabe.",
  "Reasoning model": "Reasoning-Modell",
  "A small max_tokens counts thinking tokens too and can return an empty answer. When in doubt, send null.":
    "Ein kleines max_tokens zählt auch Denk-Token mit und kann eine leere Antwort liefern. Im Zweifel null senden.",
  "Example request": "Beispielanfrage",
  Response: "Antwort",
  "reasoning is only filled on reasoning models, otherwise null. usage can be null if the provider returns nothing.":
    "reasoning ist nur bei Reasoning-Modellen gefüllt, sonst null. usage kann null sein, wenn der Anbieter nichts liefert.",
  "Answer generated.": "Antwort erzeugt.",
  "Invalid body or parameter.": "Ungültiger Body oder Parameter.",
  // chat-stream endpoint
  "Same request body as /chat, but the response is a text/event-stream. Only this way do thinking, tool calls, and the answer arrive live token by token — always use this endpoint for the chat UI.":
    "Gleicher Request-Body wie /chat, aber die Antwort ist ein text/event-stream. Nur so kommen Denken, Werkzeugaufrufe und die Antwort live Token für Token an — nimm für die Chat-Oberfläche immer diesen Endpunkt.",
  "Frame format": "Frame-Format",
  "Each frame is a line data: {json}, separated by blank lines. Each JSON carries a type. The stream always ends with data: [DONE].":
    "Jeder Frame ist eine Zeile data: {json}, getrennt durch Leerzeilen. Jedes JSON trägt einen type. Der Stream endet immer mit data: [DONE].",
  "Model is thinking (reasoning models only, comes first). Append delta, show it greyed out / collapsed.":
    "Modell denkt (nur Reasoning-Modelle, kommt zuerst). delta anhängen, ausgegraut/eingeklappt zeigen.",
  "A chunk of the actual answer. Append delta and render as Markdown.":
    "Ein Stück der eigentlichen Antwort. delta anhängen und als Markdown rendern.",
  "A tool is being called. arguments is an object for a readable line.":
    "Ein Werkzeug wird aufgerufen. arguments ist ein Objekt für eine lesbare Zeile.",
  "Result. ok=false = failure (red), preview = message. Link to the tool_call by call_id, not by order.":
    "Ergebnis. ok=false = Fehlschlag (rot), preview = Meldung. Verknüpfe mit dem tool_call über call_id, nicht über die Reihenfolge.",
  "Abort after the stream started — as its own event: error event.":
    "Abbruch nach Streamstart — als eigenes event: error-Ereignis.",
  "Example stream": "Beispiel-Stream",
  "Errors mid-stream": "Fehler mitten im Stream",
  "The HTTP status is already 200, so the error arrives as event: error with the same error object as everywhere else.":
    "Der HTTP-Status ist schon 200, also kommt der Fehler als event: error mit demselben error-Objekt wie überall sonst.",
  // models endpoint
  "Returns the models that /chat and /chat/stream accept as model. No parameters.":
    "Gibt die Modelle zurück, die /chat und /chat/stream als model akzeptieren. Keine Parameter.",
  Fields: "Felder",
  "Number of models in the list.": "Anzahl der Modelle in der Liste.",
  "The id /chat uses when no model is given (deepseek-v4-flash).":
    "Die id, die /chat nutzt, wenn kein model angegeben ist (deepseek-v4-flash).",
  "Exactly the value you send as model in the /chat body. Short and stable — a local model is addressed by its short name, not by its full Ollama tag. An unknown id gets a 422 that lists the known ones.":
    "Genau der Wert, den du als model im /chat-Body sendest. Kurz und stabil — ein lokales Modell wird über seinen Kurznamen angesprochen, nicht über seinen vollen Ollama-Tag. Eine unbekannte id bekommt einen 422, der die bekannten auflistet.",
  "Display name for the model picker in the frontend.":
    "Anzeigename für die Modellauswahl im Frontend.",
  "Short description shown next to the name.": "Kurze Beschreibung neben dem Namen.",
  "The provider headings, in the order the picker should show them. Derived from the catalogue, so a new provider appears here on its own.":
    "Die Anbieter-Überschriften, in der Reihenfolge, in der die Auswahl sie zeigen soll. Aus dem Katalog abgeleitet, sodass ein neuer Anbieter hier von selbst erscheint.",
  "Which heading this model belongs under — OpenAI, DeepSeek or Local.":
    "Unter welche Überschrift dieses Modell gehört — OpenAI, DeepSeek oder Lokal.",
  "Where it runs: openai (Responses API), hosted (the provider from LLM_PROVIDER) or local (Ollama). local is the one where nothing leaves the machine.":
    "Wo es läuft: openai (Responses-API), hosted (der Anbieter aus LLM_PROVIDER) oder local (Ollama). local ist das, bei dem nichts den Rechner verlässt.",
  "How hard the model thinks before answering — none, low, medium, high, xhigh or max. Only set for the OpenAI models; null everywhere else.":
    "Wie gründlich das Modell vor dem Antworten denkt — none, low, medium, high, xhigh oder max. Nur bei den OpenAI-Modellen gesetzt; sonst überall null.",
  "true when OpenAI has to approve your account for this model first. It stays in the list — the key is there, only the approval is missing — but a request will come back with 'model does not exist' until it is granted.":
    "true, wenn OpenAI dein Konto für dieses Modell erst freischalten muss. Es bleibt in der Liste — der Schlüssel ist da, nur die Freigabe fehlt — aber eine Anfrage kommt mit 'model does not exist' zurück, bis sie erteilt ist.",
  "The list is filtered to what can actually run: without OPENAI_API_KEY the whole OpenAI group is gone, and the Local one only appears when Ollama is enabled (OLLAMA_ENABLED=true), a model is named (OLLAMA_MODEL) and that Ollama is reachable. The local entry's id and tag come straight from OLLAMA_MODEL, so pick a model that can think and call tools. A model that is offered here will not fail on the key.":
    "Die Liste ist auf das gefiltert, was tatsächlich laufen kann: ohne OPENAI_API_KEY ist die ganze OpenAI-Gruppe weg, und die lokale erscheint nur, wenn Ollama aktiviert ist (OLLAMA_ENABLED=true), ein Modell benannt ist (OLLAMA_MODEL) und dieses Ollama erreichbar ist. id und Tag des lokalen Eintrags kommen direkt aus OLLAMA_MODEL, also wähl ein Modell, das denken und Werkzeuge aufrufen kann. Ein hier angebotenes Modell scheitert nicht am Schlüssel.",
  "Using it with /chat": "Mit /chat benutzen",
  "Take an id from this list and send it as model in the chat request.":
    "Nimm eine id aus dieser Liste und schick sie als model in der Chat-Anfrage.",
  "List retrieved successfully.": "Liste erfolgreich abgerufen.",
  // tools endpoint
  "Lists every registered tool with name, description, and JSON schema of its parameters. No parameters.":
    "Listet jedes registrierte Werkzeug mit Name, Beschreibung und JSON-Schema seiner Parameter. Keine Parameter.",
  // health endpoint
  "Liveness check without upstream: is the process running? Lightweight, for status indicators and uptime checks. No parameters.":
    "Lebendigkeits-Check ohne Upstream: läuft der Prozess? Leichtgewichtig, für Statusanzeigen und Uptime-Checks. Keine Parameter.",
  "status is always ok here as long as the process runs.":
    "status ist hier immer ok, solange der Prozess läuft.",
  "Process is running.": "Der Prozess läuft.",
  "Visible in the chat": "Im Chat sichtbar",
  "The dot in the chat header polls exactly this endpoint at regular intervals.":
    "Der Punkt im Chat-Header fragt genau diesen Endpunkt in regelmäßigen Abständen ab.",
  // ready endpoint
  "Readiness check: is the service ready to accept requests? Actually pings the LLM provider. No parameters.":
    "Bereitschafts-Check: ist der Dienst bereit, Anfragen anzunehmen? Pingt tatsächlich den LLM-Anbieter an. Keine Parameter.",
  "Response (reachable)": "Antwort (erreichbar)",
  "Provider unreachable": "Anbieter nicht erreichbar",
  "If the upstream does not answer, status becomes degraded and provider_reachable false — the HTTP status stays 200 regardless.":
    "Antwortet der Upstream nicht, wird status zu degraded und provider_reachable false — der HTTP-Status bleibt trotzdem 200.",
  "Read the status, not the 200": "Lies den status, nicht die 200",
  "For load balancers and deploy gates, status/provider_reachable is authoritative, not the HTTP code.":
    "Für Load-Balancer und Deploy-Gates ist status/provider_reachable maßgeblich, nicht der HTTP-Code.",
  "Always 200 — the state is in the body.": "Immer 200 — der Zustand steht im Body.",
  // vision endpoint
  "Look at images by address — URL, local file path, or data URL, mixed freely. Nothing is stored; for a URL the model fetches it itself, otherwise we embed the image inline.":
    "Bilder per Adresse ansehen — URL, lokaler Dateipfad oder data-URL, frei gemischt. Nichts wird gespeichert; bei einer URL holt das Modell sie selbst, sonst betten wir das Bild inline ein.",
  "Image addresses as URL, path, or data URL.": "Bildadressen als URL, Pfad oder data-URL.",
  "Optional question about the image.": "Optionale Frage zum Bild.",
  "Level of detail for the description.": "Detailgrad der Beschreibung.",
  "inlined=false = the model fetched the URL itself (bytes is then 0). For a path or data URL we load the image and embed it → inlined=true with a real byte count.":
    "inlined=false = das Modell hat die URL selbst geholt (bytes ist dann 0). Bei einem Pfad oder einer data-URL laden wir das Bild und betten es ein → inlined=true mit echter Byte-Zahl.",
  "Description generated.": "Beschreibung erzeugt.",
  "Empty or corrupt image file.": "Leere oder beschädigte Bilddatei.",
  // vision upload
  "Raw image files — the path for a frontend with a file picker. multipart/form-data, nothing is stored persistently.":
    "Rohe Bilddateien — der Weg für ein Frontend mit Dateiauswahl. multipart/form-data, nichts wird dauerhaft gespeichert.",
  "Form fields": "Formularfelder",
  "One or more images.": "Ein oder mehrere Bilder.",
  "Optional text field.": "Optionales Textfeld.",
  "Uploaded bytes are always embedded → inlined=true.":
    "Hochgeladene Bytes werden immer eingebettet → inlined=true.",
  "Invalid format or file too large.": "Ungültiges Format oder Datei zu groß.",
  // attachments and upload endpoints
  "Attach files of any type: ZIP archives, documents, source code, images or files without an extension. Each upload keeps the complete original on the backend.":
    "Hänge Dateien beliebigen Typs an: ZIP-Archive, Dokumente, Quellcode, Bilder oder Dateien ohne Endung. Jeder Upload bewahrt das vollständige Original im Backend.",
  "Say what you want done with the files. The model can inspect them, read supported formats, unpack a ZIP, edit working copies and export the result as a download. Image analysis and image generation keep using their existing tools.":
    "Sag, was mit den Dateien geschehen soll. Das Modell kann sie prüfen, unterstützte Formate lesen, ein ZIP entpacken, Arbeitskopien bearbeiten und das Ergebnis als Download exportieren. Bildanalyse und Bilderzeugung verwenden weiterhin ihre bisherigen Werkzeuge.",
  "Upload IDs in the chat request":
    "Upload-IDs in der Chat-Anfrage",
  "Upload first, then add the returned IDs to attachment_ids on the user message and send a chat_id. The backend resolves the files for that conversation; the original bytes never become inline prompt text.":
    "Lade zuerst hoch, füge dann die zurückgegebenen IDs als attachment_ids zur Nutzernachricht hinzu und sende eine chat_id. Das Backend löst die Dateien für diese Unterhaltung auf; die Originalbytes werden nie als Text in den Prompt eingefügt.",
  "Working with files":
    "Mit Dateien arbeiten",
  "List attached originals and files in this conversation's working directory.":
    "Angehängte Originale und Dateien im Arbeitsverzeichnis dieser Unterhaltung auflisten.",
  "Read text and source files in pages, or extract text from PDF, DOCX, PPTX and XLSX. PDF reading uses pypdf.":
    "Text- und Quelldateien abschnittsweise lesen oder Text aus PDF, DOCX, PPTX und XLSX auslesen. Das Lesen von PDF verwendet pypdf.",
  "Copy an attached original or working file byte-for-byte into a working copy.":
    "Ein angehängtes Original oder eine Arbeitsdatei bytegenau in eine Arbeitskopie kopieren.",
  "Write edited text into the conversation's working directory; attached originals stay unchanged.":
    "Bearbeiteten Text ins Arbeitsverzeichnis der Unterhaltung schreiben; angehängte Originale bleiben unverändert.",
  "Replace an exact UTF-8 text fragment in a working copy. The match must be unique unless replace_all=true.":
    "Ein exaktes UTF-8-Textstück in einer Arbeitskopie ersetzen. Der Treffer muss eindeutig sein, außer bei replace_all=true.",
  "Unpack a ZIP into the conversation's working directory within the configured expansion limits.":
    "Ein ZIP innerhalb der konfigurierten Entpackgrenzen ins Arbeitsverzeichnis der Unterhaltung entpacken.",
  "Export a working file or package a directory as a ZIP and return a download link.":
    "Eine Arbeitsdatei exportieren oder ein Verzeichnis als ZIP verpacken und einen Download-Link zurückgeben.",
  "File processing needs tools=true. Uploading accepts every format; reading or editing depends on the available parser or tool. Unknown binary formats remain available as originals, and the model can explain what further conversion is needed.":
    "Die Dateiverarbeitung benötigt tools=true. Der Upload akzeptiert jedes Format; das Lesen oder Bearbeiten hängt vom verfügbaren Parser oder Werkzeug ab. Unbekannte Binärformate bleiben als Originale verfügbar, und das Modell kann erklären, welche weitere Umwandlung nötig ist.",
  "For a small change in a large text file, copy_file creates a working copy and edit_file replaces the requested fragment without regenerating the whole file. export_file returns the complete edited result.":
    "Für eine kleine Änderung in einer großen Textdatei erstellt copy_file eine Arbeitskopie, und edit_file ersetzt das gewünschte Textstück, ohne die gesamte Datei neu zu erzeugen. export_file liefert das vollständige bearbeitete Ergebnis.",
  "Images":
    "Bilder",
  "PNG, JPEG, WebP and GIF retain their chat previews. The agent can use analyze_image to inspect them or generate_image with reference_images to make a changed or new image.":
    "PNG, JPEG, WebP und GIF behalten ihre Chat-Vorschau. Der Agent kann sie mit analyze_image prüfen oder mit generate_image und reference_images ein bearbeitetes oder neues Bild erstellen.",
  "Files live on the backend":
    "Dateien liegen im Backend",
  "Uploads and file tools run on the backend host. The frontend can run on another host: it forwards the upload, so no shared frontend filesystem is needed.":
    "Uploads und Dateiwerkzeuge laufen auf dem Backend-Host. Das Frontend kann auf einem anderen Host laufen: Es leitet den Upload weiter, sodass kein gemeinsames Frontend-Dateisystem nötig ist.",
  "Older saved chats with inline text attachments remain readable. New text uploads keep the full file rather than a browser-truncated copy.":
    "Ältere gespeicherte Chats mit eingebetteten Textanhängen bleiben lesbar. Neue Text-Uploads bewahren die vollständige Datei statt einer im Browser gekürzten Kopie.",
  "Limits":
    "Grenzen",
  "Files per upload request and per user message.":
    "Dateien pro Upload-Anfrage und pro Nutzernachricht.",
  "Per original or exported file, 20 MB by default.":
    "Pro Original oder exportierter Datei, standardmäßig 20 MB.",
  "Maximum expanded ZIP content, 100 MB by default.":
    "Maximaler entpackter ZIP-Inhalt, standardmäßig 100 MB.",
  "Maximum number of members in an archive.":
    "Maximale Anzahl von Einträgen in einem Archiv.",
  "Where originals, exports and conversation work files live.":
    "Wo Originale, Exporte und Arbeitsdateien der Unterhaltung liegen.",
  "Enable file uploads and the conversation's file tools.":
    "Datei-Uploads und die Dateiwerkzeuge der Unterhaltung aktivieren.",
  "GET /api/v1/capabilities reports uploads, uploads_max_bytes and uploads_max_files. The composer checks those limits before uploading and shows size errors in the selected UI language. The backend also checks them; oversized files return 413 with code file_too_large and details.max_bytes and details.filename.":
    "GET /api/v1/capabilities meldet uploads, uploads_max_bytes und uploads_max_files. Das Eingabefeld prüft diese Grenzen vor dem Upload und zeigt Größenfehler in der gewählten UI-Sprache. Das Backend prüft sie ebenfalls; zu große Dateien liefern 413 mit dem Code file_too_large sowie details.max_bytes und details.filename.",
  "Downloads and sharing":
    "Downloads und Teilen",
  "Uploads and attachment processing require an active session. Downloads also require a session, except when the file is referenced by a currently shared chat. Removing the share removes public access. Reopening a chat keeps its original references and exported download links.":
    "Uploads und die Verarbeitung von Anhängen benötigen eine aktive Sitzung. Downloads benötigen ebenfalls eine Sitzung, außer wenn ein aktuell geteilter Chat auf die Datei verweist. Das Beenden der Freigabe entfernt den öffentlichen Zugriff. Beim erneuten Öffnen bleiben die Originalreferenzen und exportierten Download-Links erhalten.",
  "Upload one or more original files as multipart/form-data. The response returns an ID and metadata for each file; use those IDs in a chat message's attachment_ids.":
    "Lade eine oder mehrere Originaldateien als multipart/form-data hoch. Die Antwort liefert für jede Datei eine ID und Metadaten; verwende diese IDs in den attachment_ids einer Chat-Nachricht.",
  "All file types are accepted, including text, ZIP, documents and unknown MIME types. An active session is required through X-Session-Id; the bundled frontend forwards it automatically.":
    "Alle Dateitypen werden angenommen, einschließlich Text, ZIP, Dokumenten und unbekannten MIME-Typen. Eine aktive Sitzung ist über X-Session-Id erforderlich; das mitgelieferte Frontend leitet sie automatisch weiter.",
  "One or more files, at most UPLOADS_MAX_FILES per request, each within UPLOADS_MAX_BYTES.":
    "Eine oder mehrere Dateien, höchstens UPLOADS_MAX_FILES pro Anfrage, jeweils innerhalb von UPLOADS_MAX_BYTES.",
  "The filename is kept for display and downloads. Disk names use generated IDs. path describes the backend location; chat requests use the ID rather than a caller-supplied filesystem path.":
    "Der Dateiname bleibt für Anzeige und Downloads erhalten. Dateinamen auf der Platte verwenden erzeugte IDs. path beschreibt den Speicherort im Backend; Chat-Anfragen verwenden die ID statt eines vom Aufrufer gelieferten Dateisystempfads.",
  "Stored.":
    "Gespeichert.",
  "No active session.":
    "Keine aktive Sitzung.",
  "File too large: code file_too_large, details { max_bytes, filename }.":
    "Datei zu groß: Code file_too_large, Details { max_bytes, filename }.",
  "Empty file, invalid form or too many files. too_many_files includes details.max_files.":
    "Leere Datei, ungültiges Formular oder zu viele Dateien. too_many_files enthält details.max_files.",
  "Uploads are disabled (UPLOADS_ENABLED=false).":
    "Uploads sind deaktiviert (UPLOADS_ENABLED=false).",
  "Fetch an original attachment or an exported result. Images retain their previews; other files download with their original filename.":
    "Einen Originalanhang oder ein exportiertes Ergebnis abrufen. Bilder behalten ihre Vorschau; andere Dateien werden mit ihrem ursprünglichen Dateinamen heruntergeladen.",
  "Send an active X-Session-Id, unless a currently shared chat references this file. The frontend forwards its session automatically for previews and downloads.":
    "Sende eine aktive X-Session-Id, sofern kein aktuell geteilter Chat auf diese Datei verweist. Das Frontend leitet seine Sitzung für Vorschauen und Downloads automatisch weiter.",
  "Path parameter":
    "Pfad-Parameter",
  "The generated ID from the upload or export response.":
    "Die erzeugte ID aus der Upload- oder Export-Antwort.",
  "The response carries the stored media type, Content-Disposition filename, private no-store caching and X-Content-Type-Options: nosniff. Supported images and audio can display inline; other files are attachments.":
    "Die Antwort enthält den gespeicherten Medientyp, den Dateinamen in Content-Disposition, privates no-store-Caching und X-Content-Type-Options: nosniff. Unterstützte Bilder und Audio können direkt angezeigt werden; andere Dateien werden als Anhänge heruntergeladen.",
  "The file.":
    "Die Datei.",
  "No active session or public chat reference.":
    "Keine aktive Sitzung oder öffentliche Chat-Referenz.",
  "No attachment under that id.":
    "Kein Anhang unter dieser ID.",
  "Malformed id.":
    "Fehlerhafte ID.",
  // transcribe endpoint
  "Turns a recording into text. Multipart in, JSON out. The language is detected — you never have to pick one first, and a sentence that switches mid-way still comes back whole.":
    "Macht aus einer Aufnahme Text. Multipart rein, JSON raus. Die Sprache wird erkannt — du musst nie vorher eine wählen, und ein Satz, der mittendrin wechselt, kommt trotzdem vollständig zurück.",
  "The recording. webm/opus, mp4, ogg, mp3, wav and flac all work — send what the browser recorded, no conversion needed. Up to 25 MB.":
    "Die Aufnahme. webm/opus, mp4, ogg, mp3, wav und flac funktionieren alle — schick, was der Browser aufgenommen hat, keine Konvertierung nötig. Bis 25 MB.",
  "An id from GET /transcribe/models. Left out, the server uses TRANSCRIBE_MODEL. This is also what decides whether the recording leaves the machine: whisper-local keeps it here, everything else goes to OpenAI.":
    "Eine id aus GET /transcribe/models. Weggelassen, nutzt der Server TRANSCRIBE_MODEL. Das entscheidet auch, ob die Aufnahme den Rechner verlässt: whisper-local behält sie hier, alles andere geht an OpenAI.",
  "ISO code such as de or en. Normally unnecessary — the model detects it. Set it only when you already know, to skip the detection step.":
    "ISO-Code wie de oder en. Normalerweise unnötig — das Modell erkennt sie. Setz ihn nur, wenn du sie schon kennst, um den Erkennungsschritt zu überspringen.",
  Example: "Beispiel",
  "The transcript as one flowing string.": "Das Transkript als ein durchgehender String.",
  "What the model heard, not what you asked for. null when the model does not report it — whisper-1 in plain JSON, for instance.":
    "Was das Modell gehört hat, nicht, wonach du gefragt hast. null, wenn das Modell sie nicht meldet — whisper-1 in reinem JSON etwa.",
  "Length of the recording in milliseconds, where the model reports it.":
    "Länge der Aufnahme in Millisekunden, sofern das Modell sie meldet.",
  "Which entry actually did the work.": "Welcher Eintrag die Arbeit tatsächlich gemacht hat.",
  Availability: "Verfügbarkeit",
  "GET /api/v1/transcribe answers whether it can work at all, without sending a recording: { available, reason, model }. Pass ?model= to ask about a specific one — the answer differs, since whisper-local needs two programs installed and the hosted ones need a key. The frontend asks once on load and hides the microphone when the answer is no, rather than showing a button that is certain to fail.":
    "GET /api/v1/transcribe beantwortet, ob es überhaupt funktionieren kann, ohne eine Aufnahme zu schicken: { available, reason, model }. Gib ?model= mit, um nach einem bestimmten zu fragen — die Antwort unterscheidet sich, da whisper-local zwei installierte Programme braucht und die gehosteten einen Schlüssel. Das Frontend fragt einmal beim Laden und blendet das Mikrofon aus, wenn die Antwort nein ist, statt einen Knopf zu zeigen, der sicher scheitert.",
  "Transcribed successfully.": "Erfolgreich transkribiert.",
  "The recording was empty, too large, or could not be decoded.":
    "Die Aufnahme war leer, zu groß oder ließ sich nicht dekodieren.",
  "Transcription is disabled (TRANSCRIBE_ENABLED=false).":
    "Transkription ist deaktiviert (TRANSCRIBE_ENABLED=false).",
  // transcribe-models
  "The transcription models you can send as model. Filtered to what can actually run: no OPENAI_API_KEY and the hosted group disappears, no whisper.cpp on the machine and the local one does. No parameters.":
    "Die Transkriptions-Modelle, die du als model senden kannst. Gefiltert auf das, was wirklich laufen kann: kein OPENAI_API_KEY und die gehostete Gruppe verschwindet, kein whisper.cpp auf dem Rechner und die lokale. Keine Parameter.",
  "What /transcribe uses when no model is given.":
    "Was /transcribe nutzt, wenn kein model angegeben ist.",
  "The headings, in the order the settings should show them.":
    "Die Überschriften, in der Reihenfolge, in der die Einstellungen sie zeigen sollen.",
  "openai or local. This is the field worth reading: local means the recording stays on this machine.":
    "openai oder local. Das ist das Feld, das es zu lesen lohnt: local heißt, die Aufnahme bleibt auf diesem Rechner.",
  // tts endpoint
  "Whether read-aloud works, and which voice it uses. Speech itself is not a call you make — the read_aloud tool does it inside a chat. This only tells the UI what to offer.":
    "Ob Vorlesen funktioniert und welche Stimme es nutzt. Sprache selbst ist kein Aufruf, den du machst — das Werkzeug read_aloud erledigt das in einem Chat. Das hier sagt der Oberfläche nur, was sie anbieten soll.",
  "With an ELEVENLABS_API_KEY, provider is \"elevenlabs\" and voice_id is the default voice. Without one, provider is \"free\" — read-aloud still works through a keyless voice that reads English only, and reason says so. available is only false when TTS_ENABLED=false.":
    "Mit einem ELEVENLABS_API_KEY ist provider \"elevenlabs\" und voice_id die Standardstimme. Ohne einen ist provider \"free\" — Vorlesen funktioniert weiter über eine schlüssellose Stimme, die nur Englisch liest, und reason sagt es. available ist nur false, wenn TTS_ENABLED=false.",
  "Status retrieved.": "Status abgerufen.",
  // tts-models
  "The speech models the read_aloud tool can use. Filtered to what can run: no ELEVENLABS_API_KEY and only the free, English-only voice remains, with the default shifting to it. No parameters.":
    "Die Sprachmodelle, die das Werkzeug read_aloud nutzen kann. Gefiltert auf das, was laufen kann: ohne ELEVENLABS_API_KEY bleibt nur die kostenlose, rein englische Stimme, und die Vorgabe wechselt auf sie. Keine Parameter.",
  "The model read_aloud uses when the request names none.":
    "Das Modell, das read_aloud nutzt, wenn die Anfrage keins nennt.",
  "The ElevenLabs voice used when the request sets no voice_id.":
    "Die ElevenLabs-Stimme, die genutzt wird, wenn die Anfrage keine voice_id setzt.",
  "elevenlabs or free — whether a key stands behind it.":
    "elevenlabs oder free — ob ein Schlüssel dahintersteht.",
  "Only set for the free voice: the one language it reads in (en unless TTS_FREE_LANGUAGE says otherwise). ElevenLabs models are multilingual and report null.":
    "Nur bei der kostenlosen Stimme gesetzt: die eine Sprache, in der sie vorliest (en, solange TTS_FREE_LANGUAGE nichts anderes sagt). ElevenLabs-Modelle sind mehrsprachig und melden null.",
  // prompts endpoints
  "Lists the available system prompts with title, variables, and length. No parameters.":
    "Listet die verfügbaren System-Prompts mit Titel, Variablen und Länge. Keine Parameter.",
  "Returns a single system prompt verbatim, along with its metadata.":
    "Gibt einen einzelnen System-Prompt wortgetreu samt seiner Metadaten zurück.",
  "Path parameters": "Pfad-Parameter",
  "Name of the prompt, e.g. default.": "Name des Prompts, z. B. default.",
  "Prompt found.": "Prompt gefunden.",
  "Unknown name.": "Unbekannter Name.",
  // sdks
  "Officially maintained clients with types, retries, and streaming out of the box.":
    "Offiziell gepflegte Clients mit Typen, Retries und Streaming von Haus aus.",
  "SDKs are on the way": "SDKs sind unterwegs",
  "The official clients aren't published yet. The HTTP API they wrap is stable and documented in full under Endpoints — build against it today, and the SDKs will drop in later as thin wrappers.":
    "Die offiziellen Clients sind noch nicht veröffentlicht. Die HTTP-API, die sie umhüllen, ist stabil und unter Endpunkte vollständig dokumentiert — bau heute dagegen, und die SDKs schieben sich später als dünne Hüllen davor.",
  "Planned SDKs": "Geplante SDKs",
  "Typed client with streaming, retries and small helpers.":
    "Typisierter Client mit Streaming, Retries und kleinen Helfern.",
  "Pythonic client with both sync and async APIs.":
    "Pythonischer Client mit synchroner und asynchroner API.",
  "Idiomatic Go client with context support.":
    "Idiomatischer Go-Client mit Context-Unterstützung.",
  "Until then": "Bis dahin",
  "Every change to the API, the chat app and the clients lands here — newest first.":
    "Hier landet jede Änderung an API, Chat-App und Clients – das Neueste zuerst.",
  "The first entry: SDKs": "Der erste Eintrag: die SDKs",
  "Nothing to log yet. The changelog starts with the release of the official TypeScript, Python and Go clients — until then, the API works exactly as documented under Endpoints.":
    "Noch gibt es nichts zu vermerken. Der Changelog beginnt mit dem Release der offiziellen Clients für TypeScript, Python und Go – bis dahin funktioniert die API genau so, wie unter Endpunkte beschrieben.",
  "Every endpoint is documented under Endpoints, errors and streaming included. Anything an SDK will do, you can do today with a plain HTTP client — the examples throughout these docs show exactly how.":
    "Jeder Endpunkt ist unter Endpunkte dokumentiert, Fehler und Streaming inklusive. Alles, was ein SDK tun wird, kannst du heute mit einem einfachen HTTP-Client tun — die Beispiele in dieser Doku zeigen genau wie.",
  // navigation group + page titles/descriptions
  "Getting started": "Erste Schritte",
  Overview: "Überblick",
  "What the Smeeware API does and how the docs are organized.":
    "Was die Smeeware-API tut und wie die Doku aufgebaut ist.",
  "From an empty project to your first answer in a few minutes.":
    "Vom leeren Projekt zur ersten Antwort in wenigen Minuten.",
  Installation: "Installation",
  "Call the API with a key and curl — SDKs coming soon.":
    "Die API mit Schlüssel und curl aufrufen — SDKs bald verfügbar.",
  Basics: "Grundlagen",
  "Create, rotate, and safely store API keys.":
    "API-Schlüssel erstellen, rotieren und sicher aufbewahren.",
  "Requests & responses": "Anfragen & Antworten",
  "Request shape, content types, and the response format.":
    "Form der Anfrage, Content-Types und das Antwortformat.",
  "Receive answers token by token over Server-Sent Events.":
    "Antworten Token für Token über Server-Sent Events empfangen.",
  Attachments: "Anhänge",
  "Upload originals of any type; read, unpack, edit and download the result.":
    "Originale beliebigen Typs hochladen; lesen, entpacken, bearbeiten und das Ergebnis herunterladen.",
  "Error codes, retries, and what to do when things break.":
    "Fehlercodes, Retries und was zu tun ist, wenn etwas bricht.",
  "Rate limits": "Rate-Limits",
  "Per-key quotas and the related headers.":
    "Kontingente pro Schlüssel und die zugehörigen Header.",
  "Every endpoint of the API at a glance.":
    "Jeder Endpunkt der API auf einen Blick.",
  "Answer as SSE — including thinking and tools.":
    "Antwort als SSE — inklusive Denken und Werkzeugen.",
  "List the models that /chat accepts.":
    "Die Modelle auflisten, die /chat akzeptiert.",
  "Store attachments and get an address back (multipart).":
    "Anhänge speichern und eine Adresse zurückbekommen (multipart).",
  "Fetch one stored attachment by id.":
    "Einen gespeicherten Anhang per id abrufen.",
  "Turn a recording into text (multipart).":
    "Eine Aufnahme in Text verwandeln (multipart).",
  "Transcribe Models": "Transkriptions-Modelle",
  "The transcription models you can pick.":
    "Die Transkriptions-Modelle, die du wählen kannst.",
  "Read Aloud": "Vorlesen",
  "Is read-aloud usable, and who speaks?":
    "Ist Vorlesen nutzbar, und wer spricht?",
  "Speech Models": "Sprachmodelle",
  "The speech models you can pick.": "Die Sprachmodelle, die du wählen kannst.",
  Prompts: "Prompts",
  "List the available system prompts.":
    "Die verfügbaren System-Prompts auflisten.",
  Prompt: "Prompt",
  "Fetch one system prompt verbatim.":
    "Einen System-Prompt wortgetreu abrufen.",
  "Chat app": "Chat-App",
  "Commands & shortcuts": "Befehle & Kürzel",
  "The command palette, the slash menu, and every shortcut.":
    "Die Befehlspalette, das Slash-Menü und jedes Kürzel.",
  Workspaces: "Workspaces",
  "Give the model a project and path to work from.":
    "Gib dem Modell ein Projekt und einen Pfad zum Arbeiten.",
  "Steering a running answer": "Eine laufende Antwort steuern",
  "Add to a turn while it runs — and recover from any stop.":
    "Zu einer laufenden Runde ergänzen — und dich von jedem Stopp erholen.",
  "Voice call": "Sprachanruf",
  "Talk hands-free with a free neural voice.":
    "Freihändig reden mit einer kostenlosen neuronalen Stimme.",
  Tooling: "Werkzeuge",
  "Official clients for TypeScript, Python, and Go.":
    "Offizielle Clients für TypeScript, Python und Go.",
  "Release notes — starting with the SDKs.":
    "Versionshinweise – los geht's mit den SDKs.",
};
