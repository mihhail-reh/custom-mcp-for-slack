import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { SlackService, type NotificationType } from "./slack.js";

const config = loadConfig();

const slack = new SlackService(config.slackBotToken, config.slackUserId);

try {
  await slack.initialize();
  console.log("Slack service initialized successfully");
} catch (err) {
  console.error("Failed to initialize Slack service:", err);
  process.exit(1);
}

function createServer(): McpServer {
  const server = new McpServer({
    name: "slack-notifier",
    version: "1.0.0",
  });

  server.tool(
    "notify",
    "Send a Slack DM notification to the user. Use type to indicate the notification kind: 'info' (default, needs attention), 'plan_complete' (finished planning), or 'implementation_complete' (finished implementation).",
    {
      agentName: z.string().describe("Name of the agent sending the notification"),
      message: z.string().describe("The notification message"),
      type: z
        .enum(["info", "plan_complete", "implementation_complete"])
        .optional()
        .default("info")
        .describe("Notification type: info (default), plan_complete, or implementation_complete"),
    },
    async ({ agentName, message, type }) => {
      try {
        await slack.postNotification(agentName, message, type as NotificationType);
        return {
          content: [
            { type: "text", text: `Notification sent to user successfully.` },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Failed to send notification: ${err}` },
          ],
        };
      }
    }
  );

  server.tool(
    "ask",
    "Send a question via Slack DM and wait for the user to reply in-thread",
    {
      agentName: z.string().describe("Name of the agent asking the question"),
      question: z.string().describe("The question to ask the user"),
      timeoutSeconds: z
        .number()
        .optional()
        .default(config.defaultTimeout)
        .describe("Timeout in seconds to wait for a reply (default 300)"),
    },
    async ({ agentName, question, timeoutSeconds }) => {
      try {
        const threadTs = await slack.postQuestion(agentName, question);
        const reply = await slack.pollForReply(threadTs, timeoutSeconds * 1000);

        if (reply === null) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `No reply received within ${timeoutSeconds} seconds.`,
              },
            ],
          };
        }

        return {
          content: [{ type: "text", text: reply }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Failed to ask question: ${err}` },
          ],
        };
      }
    }
  );

  return server;
}

const transports: Record<string, StreamableHTTPServerTransport> = {};

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

// Simple REST endpoint for hooks (no MCP session needed)
app.post("/notify", async (req, res) => {
  try {
    const { message, agentName = "Claude Code", type = "info" } = req.body;
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    await slack.postNotification(agentName, message, type);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error sending notification:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.listen(config.port, () => {
  console.log(`Slack notifier MCP server listening on port ${config.port}`);
});
