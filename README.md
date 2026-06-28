# AI Support Bot

An AI-powered Discord ticket bot using Google Gemini and discord.js for automated customer support.

## Features

- Automatic ticket channel detection and response
- AI-powered support responses using Google Gemini
- Product-specific knowledge bases (Exodus, Crusader, Vega)
- Timezone-aware availability status
- Multi-turn conversation support

## Setup

### Prerequisites

- Node.js 16+
- Discord Bot Token
- Google Gemini API Key

### Environment Variables

Set these environment variables before running:

```
DISCORD_TOKEN=your_discord_bot_token
GEMINI_API_KEY=your_gemini_api_key
NODE_ENV=production
```

### Installation

```bash
npm install
npm start
```

## Deployment on Katabump

1. Push this repository to GitHub
2. Connect your GitHub repo to Katabump
3. Add environment variables in Katabump dashboard:
   - `DISCORD_TOKEN`
   - `GEMINI_API_KEY`
4. Deploy using `katabump.yaml` configuration

## Configuration

- **TICKET_CHANNEL_PREFIX**: Prefix for ticket channels (default: "ticket-")
- **TICKET_CATEGORY_NAME**: Category name for tickets (default: "📋 tickets")
- **EXODUS_URL**: URL to fetch Exodus product guide
- **CACHE_TTL_MS**: Cache refresh interval (default: 30 minutes)

## License

MIT
