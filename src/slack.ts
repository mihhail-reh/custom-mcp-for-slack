import { WebClient } from "@slack/web-api";

export type NotificationType = "info" | "plan_complete" | "implementation_complete";

export class SlackService {
  private client: WebClient;
  private slackUserId: string;
  private botUserId: string | undefined;
  private dmChannelId: string | undefined;

  constructor(token: string, slackUserId: string) {
    this.client = new WebClient(token);
    this.slackUserId = slackUserId;
  }

  async initialize(): Promise<void> {
    const authResult = await this.client.auth.test();
    this.botUserId = authResult.user_id as string;

    const convResult = await this.client.conversations.open({
      users: this.slackUserId,
    });
    this.dmChannelId = convResult.channel?.id;

    if (!this.dmChannelId) {
      throw new Error("Failed to open DM channel");
    }
  }

  private getNotificationHeader(agentName: string, type: NotificationType): { text: string; fallback: string } {
    switch (type) {
      case "plan_complete":
        return {
          text: `:clipboard: *Agent \`${agentName}\` has finished planning*`,
          fallback: `:clipboard: Agent *${agentName}* has finished planning`,
        };
      case "implementation_complete":
        return {
          text: `:white_check_mark: *Agent \`${agentName}\` has finished implementation*`,
          fallback: `:white_check_mark: Agent *${agentName}* has finished implementation`,
        };
      default:
        return {
          text: `*Agent \`${agentName}\` needs your attention*`,
          fallback: `Agent *${agentName}* needs your attention`,
        };
    }
  }

  async postNotification(agentName: string, message: string, type: NotificationType = "info"): Promise<string> {
    const header = this.getNotificationHeader(agentName, type);
    const result = await this.client.chat.postMessage({
      channel: this.dmChannelId!,
      text: `${header.fallback}: ${message}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${header.text}\n\n${message}`,
          },
        },
      ],
    });

    return result.ts!;
  }

  async postQuestion(agentName: string, question: string): Promise<string> {
    const result = await this.client.chat.postMessage({
      channel: this.dmChannelId!,
      text: `Agent *${agentName}* is asking: ${question}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Agent \`${agentName}\` is asking:*\n\n${question}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "_Reply in this thread to respond to the agent._",
            },
          ],
        },
      ],
    });

    return result.ts!;
  }

  async pollForReply(
    threadTs: string,
    timeoutMs: number
  ): Promise<string | null> {
    const startTime = Date.now();
    let consecutiveErrors = 0;

    while (Date.now() - startTime < timeoutMs) {
      const elapsed = Date.now() - startTime;

      try {
        const result = await this.client.conversations.replies({
          channel: this.dmChannelId!,
          ts: threadTs,
        });

        consecutiveErrors = 0;

        const messages = result.messages || [];
        for (const msg of messages) {
          if (msg.ts !== threadTs && msg.user !== this.botUserId) {
            return msg.text || "";
          }
        }
      } catch (err) {
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          throw new Error(
            `Failed to poll for reply after 3 consecutive errors: ${err}`
          );
        }
      }

      // Adaptive polling: 2s for first 30s, 5s for 30s-2min, 10s after
      let delay: number;
      if (elapsed < 30_000) {
        delay = 2_000;
      } else if (elapsed < 120_000) {
        delay = 5_000;
      } else {
        delay = 10_000;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return null;
  }
}
