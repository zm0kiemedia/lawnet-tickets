# LAWNET-Tickets

Discord bot created with TechDashboard template.

## Features

- ✅ Discord.js v14
- ✅ TypeScript
- ✅ Slash Commands
- ✅ Components v2 (Buttons, Modals, Select Menus)
# 🎫 LawNet Ticket System

Ein professionelles Discord Ticket-System mit integriertem Web-Dashboard für Server-Management.

## ✨ Features

### 🎯 Ticket-System
- **Ticket-Erstellung** via Discord-Button
- **Automatische Kategorien** (Support, Bewerbung, Partnerschaft, etc.)
- **Voice-Tickets** mit automatischem Voice-Channel
- **Ticket-Zuweisung** an Team-Mitglieder
- **File Uploads** mit automatischer Speicherung
- **Transcript-Generierung** für geschlossene Tickets
- **Priorisierung** (Niedrig, Normal, Hoch, Kritisch)

### 📊 Web-Dashboard
- **OAuth2-Login** via Discord
- **Rollenbasierte Zugangskontrolle**
- **Live-Statistiken** (Offene Tickets, Team-Mitglieder, etc.)
- **Ticket-Management** (Ansehen, Zuweisen, Schließen)
- **Transkrip-Viewer** mit Timeline und Nachrichtenverlauf
- **File-Gallery** für hochgeladene Dateien
- **Audit-Logs** für alle Aktionen
- **Responsive Design** mit modernem Dark Mode

### 🔊 Voice-Features
- **Automatische Voice-Channels** für Tickets
- **Text-to-Speech** Announcements
- **Voice-Control-Buttons**

### 🔔 Benachrichtigungen
- **WebSocket-Integration** für Echtzeit-Updates
- **Team-Benachrichtigungen** bei neuen Tickets
- **Status-Updates** im Dashboard

## 🚀 Installation

### Voraussetzungen
- Node.js 18+
- Discord Bot Token
- Discord Application mit OAuth2

### Setup

1. **Repository klonen:**
```bash
git clone https://github.com/yourusername/lawnet-tickets.git
cd lawnet-tickets
```

2. **Dependencies installieren:**
```bash
npm install
```

3. **Umgebungsvariablen konfigurieren:**
```bash
cp .env.example .env
```

Bearbeite `.env` und füge deine Werte ein:
```env
BOT_TOKEN=dein_discord_bot_token
CLIENT_ID=deine_discord_client_id
CLIENT_SECRET=dein_discord_client_secret
GUILD_ID=deine_discord_guild_id
REDIRECT_URI=https://deine-domain.de/auth/discord/callback
```

4. **Bot Commands deployen:**
```bash
npm run deploy-commands
```

5. **Projekt builden:**
```bash
npm run build
```

6. **Bot starten:**
```bash
npm start
```

Für Produktion mit PM2:
```bash
pm2 start ecosystem.config.js
```

## 📁 Projekt-Struktur

```
lawnet-tickets/
├── src/
│   ├── commands/          # Discord Slash Commands
│   ├── events/            # Discord Event Handler
│   ├── dashboard/         # Express Dashboard
│   │   ├── server.ts      # Express Server
│   │   └── views/         # EJS Templates
│   ├── database/          # SQLite Datenbank
│   └── utils/             # Helper Functions
├── public/               # Statische Files
│   ├── img/             # Bilder
│   └── uploads/         # Ticket-Uploads
├── dist/                # Compiled JavaScript
└── tickets.db           # SQLite Datenbank
```

## 🛠️ Technologie-Stack

- **Discord.js v14** - Discord Bot Framework
- **Express** - Web Server
- **EJS** - Template Engine
- **SQLite** - Datenbank
- **Passport** - OAuth2 Authentication
- **WebSocket** - Real-time Updates
- **TypeScript** - Type Safety
- **PM2** - Process Manager

## 📝 Discord Bot Setup

1. Gehe zu [Discord Developer Portal](https://discord.com/developers/applications)
2. Erstelle eine neue Application
3. Aktiviere "Server Members Intent" und "Message Content Intent"
4. OAuth2 → Redirect URI hinzufügen: `https://deine-domain.de/auth/discord/callback`
5. Bot Token kopieren und in `.env` eintragen

## 🔐 Permissions

Der Bot benötigt folgende Permissions:
- `Manage Channels` - Für Ticket-Channels
- `Manage Roles` - Für Ticket-Rollen
- `Send Messages` - Nachrichten senden
- `Embed Links` - Embeds senden
- `Attach Files` - Dateien anhängen
- `Read Message History` - Transcript erstellen
- `Connect` & `Speak` - Voice-Features

## 📄 Lizenz

MIT License - siehe LICENSE Datei

## 👨‍💻 Entwickelt von

LawNet Development Team

---
 
**Bot Prefix:** Slash Commands (`/`)

Monitor:
```bash
pm2 logs LAWNET-Tickets
pm2 monit
## Adding New Commands

1. Create a new file in `src/commands/` (e.g., `mycommand.ts`)
2. Export an object with `data` (SlashCommandBuilder) and `execute` function
3. Rebuild: `npm run build`
4. Deploy commands: `npm run deploy`
5. Restart bot

## Project Structure

```
LAWNET-Tickets/
├── src/
│   ├── commands/       # Slash commands
│   ├── events/         # Event handlers
│   ├── utils/          # Utility functions
│   └── index.ts        # Main bot file
├── dist/               # Compiled JavaScript
├── logs/               # PM2 logs
├── .env                # Environment variables
├── ecosystem.config.js # PM2 configuration
├── package.json
└── tsconfig.json
```

## Learn More

- [Discord.js Guide](https://discordjs.guide/)
- [Discord.js Documentation](https://discord.js.org/)
- [Discord Developer Portal](https://discord.com/developers/applications)
