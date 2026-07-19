# Stream Schedule Bot

A Discord bot that automates weekly stream schedule posting. Server admins configure a target channel, posting day, and time. Streamers submit their schedule entries throughout the week, and the bot compiles and posts the full schedule automatically.

## Features

- **Admin setup** — Configure posting channel, day, and time via `/schedule setup`
- **Schedule entries** — Streamers add/remove their stream times with `/schedule add` and `/schedule remove`
- **Automatic posting** — Bot posts the compiled schedule at the configured day and time each week
- **UPSERT semantics** — Resubmitting for the same day/time replaces the previous entry
- **Retry logic** — If posting fails, retries once after 1 minute and DMs the admin on second failure
- **Per-guild isolation** — Each server has independent configuration and schedule data

## Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/schedule setup channel` | Set the posting channel | Administrator |
| `/schedule setup day` | Set the posting day (Mon–Sun) | Administrator |
| `/schedule setup time` | Set the posting time (HH:MM UTC) | Administrator |
| `/schedule setup view` | View current configuration | Administrator |
| `/schedule add` | Add a stream entry (day, time, title) | Everyone |
| `/schedule remove` | Remove a stream entry | Everyone |
| `/schedule mine` | View your entries for this week | Everyone |

## Tech Stack

- **Runtime** — Node.js + TypeScript
- **Discord** — discord.js v14 (slash commands)
- **Database** — SQLite via better-sqlite3
- **Scheduler** — node-cron (every-minute tick)
- **Testing** — Vitest + fast-check (property-based testing)

## Getting Started

### Prerequisites

- Node.js 18+
- A Discord bot application ([create one here](https://discord.com/developers/applications))

### Installation

```bash
git clone <repo-url>
cd stream-schedule
npm install
```

### Configuration

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Your bot token |
| `CLIENT_ID` | Application client ID |
| `GUILD_ID` | Server ID for command registration |

### Deploy Commands

Register slash commands with Discord:

```bash
npm run deploy-commands
```

### Run

```bash
# Development (with hot reload via tsx)
npm run dev

# Production
npm run build
npm start
```

## Testing

```bash
# Run all tests (191 tests across 16 files)
npm test

# Watch mode
npm run test:watch
```

The test suite includes:
- **Unit tests** — Validators, services, commands, week calculator
- **Property-based tests** — 13 correctness properties verified with fast-check (100+ iterations each)
- **Integration tests** — Setup flow and posting flow with real SQLite + mocked Discord

## Project Structure

```
src/
├── commands/          # Slash command definitions and handlers
├── database/          # SQLite initialization and schema
├── services/          # Business logic (config, schedule, posting)
├── types/             # Shared TypeScript types and enums
├── utils/             # Validators, week calculator, formatters
├── scheduler.ts       # Cron job (every-minute tick)
└── index.ts           # Bot entry point

tests/
├── unit/              # Example-based unit tests
├── properties/        # Property-based tests (fast-check)
└── integration/       # End-to-end flow tests
```

## License

ISC
