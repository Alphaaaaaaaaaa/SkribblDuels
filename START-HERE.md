# Skribbl Duels v0.71.0 installieren

Die ZIP enthält den vollständigen Quellcode, alle Emoji-Dateien, SQL-Migrationen,
den gebauten Gateway und das installierbare Userscript.

## Update von v0.70.0

1. In Supabase zuerst
   `supabase/migrations/202610010003_social_lobby_join_permissions.sql` ausführen.
   Die bisherigen Social-Migrationen müssen bereits installiert sein.
2. Den enthaltenen Gateway v0.13.0 auf Railway deployen. Die bisherigen
   Umgebungsvariablen genügen. `/readyz` muss `socialHealthy: true` melden.
3. `Skribbl-Duels-v0.71.0.user.js` in Tampermonkey/Violentmonkey installieren
   und Skribbl auf beiden Clients neu laden. Im Projekt liegt dieselbe Datei
   unter `userscript/skribbl-duels-telemetry-inspector.user.js`.

Gateway und Userscript verwenden Contract 18 und werden gemeinsam aktualisiert.
Freundeslisten und Chatverläufe bleiben erhalten.

## Enthaltene Änderungen

- Pins ausschließlich im Friends-Modal; weiterhin Vorrang angepinnter Freunde.
- Lobby-Freigaben Public / Private / None und korrigiertes Vollbild-Lock-Overlay.
- Duel-Einladungen mit Accept/Deny und Status direkt in Quick Messages.
- 132 sortierte Emojis mit Kurz-Codes, Strg+E und Shift-Klick.
- Größere reine Emoji-Nachrichten und Zeichenanzahl bis 300 Unicode-Zeichen.
- Stabile Nachrichtenreihenfolge und Gruppen mit gemeinsamem Hintergrund.
- Anklickbare, unterstrichene Links in Spielchat, Duel-Chat und Quick Messages.

„Private“ erlaubt öffentliche und private Lobbys, „Public“ nur öffentliche,
„None“ sperrt beides. Bisherige Freigaben werden ohne automatische Freigabe
privater Lobbys übernommen.

Technische Details und lokale Prüfschritte stehen in
`docs/social-chat-polish-v0.71.0.md`.
