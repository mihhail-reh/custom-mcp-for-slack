# Slack Notifier MCP Server

An MCP (Model Context Protocol) server that lets Claude Code send you Slack DM notifications when it finishes a task, gets stuck, or needs your input. Works with any number of concurrent Claude Code sessions.

## Features

- **`notify`** — Send a Slack DM notification (info, plan complete, or implementation complete)
- **`ask`** — Ask a question via Slack DM and wait for your threaded reply

## Prerequisites

- A Slack workspace where you can create apps
- Docker and Docker Compose (recommended) **or** Node.js 22+
- Claude Code CLI installed

## Setup

### 1. Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** → **From scratch**
2. Name it (e.g. "Claude Notifier") and select your workspace
3. Go to **OAuth & Permissions** and add these **Bot Token Scopes**:
   - `chat:write` — send messages
   - `conversations.history` — read thread replies (for the `ask` tool)
   - `im:history` — read DM history
   - `im:write` — open DM conversations
4. Click **Install to Workspace** and authorize
5. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### 2. Find Your Slack User ID

1. In Slack, click on your profile picture → **Profile**
2. Click the **⋮** (more) button → **Copy member ID**

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_USER_ID=U0123456789
```

### 4. Start the Server

**With Docker (recommended):**

```bash
docker compose up -d
```

**Without Docker:**

```bash
npm install
npm run build
npm start
```

The server runs on port `50000` by default.

### 5. Configure Claude Code

There are two things to configure: registering the MCP server and adding instructions so Claude actually uses it.

#### a) Register the MCP server globally

Add to your `~/.claude.json` under the top-level `mcpServers` key:

```json
{
  "mcpServers": {
    "slack-notifier": {
      "type": "http",
      "url": "http://localhost:50000/mcp"
    }
  }
}
```

> **Tip:** You can also run `claude mcp add --transport http slack-notifier http://localhost:50000/mcp` to add it via the CLI.

#### b) Add global instructions

Create or edit `~/.claude/CLAUDE.md` and add:

```markdown
## Slack Notifications (MANDATORY)

You MUST use the `slack-notifier` MCP tools to notify the user in the following situations:

1. **Task completed** — When you finish a task or reach a natural stopping point, use `mcp__slack-notifier__notify` to inform the user what was accomplished.
2. **Stuck or blocked** — When you encounter an error you cannot resolve, are blocked, or need to make a decision you cannot make autonomously, use `mcp__slack-notifier__notify` to describe what you're stuck on.
3. **Waiting for user input** — When you need user input or approval to proceed (e.g., after using AskUserQuestion or presenting options), use `mcp__slack-notifier__notify` to let the user know their input is needed.

Keep notification messages concise — a single sentence summarizing the status and what (if anything) is needed from the user.
```

This ensures **every** Claude Code session (terminal, IDE, background agents) will send you Slack notifications.

### 6. Verify

Start a new Claude Code session and ask it to send a test notification:

```
Send me a test slack notification
```

You should receive a DM from your Slack app.

## Configuration

| Environment Variable | Description | Default |
|---|---|---|
| `SLACK_BOT_TOKEN` | Slack bot OAuth token (required) | — |
| `SLACK_USER_ID` | Your Slack member ID (required) | — |
| `PORT` | Server port | `50000` |
| `DEFAULT_TIMEOUT` | Default timeout for `ask` replies (seconds) | `300` |

## Tools

### `notify`

Send a notification DM to the user.

| Parameter | Type | Description |
|---|---|---|
| `agentName` | string | Name of the agent sending the notification |
| `message` | string | The notification message |
| `type` | enum | `info` (default), `plan_complete`, or `implementation_complete` |

### `ask`

Send a question via DM and wait for a threaded reply.

| Parameter | Type | Description |
|---|---|---|
| `agentName` | string | Name of the agent asking |
| `question` | string | The question to ask |
| `timeoutSeconds` | number | Timeout waiting for reply (default: 300) |

## Running as a Background Service (macOS)

To keep the server running automatically, create a launchd plist:

```bash
cat > ~/Library/LaunchAgents/com.slack-notifier-mcp.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.slack-notifier-mcp</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/docker</string>
        <string>compose</string>
        <string>-f</string>
        <string>/path/to/custom-mcp-for-slack/docker-compose.yml</string>
        <string>up</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.slack-notifier-mcp.plist
```

Update the path to match your actual repo location.
