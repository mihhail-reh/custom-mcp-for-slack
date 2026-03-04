export interface Config {
  slackBotToken: string;
  slackUserId: string;
  defaultTimeout: number;
  port: number;
}

export function loadConfig(): Config {
  const slackBotToken = process.env.SLACK_BOT_TOKEN;
  if (!slackBotToken) {
    console.error("SLACK_BOT_TOKEN environment variable is required");
    process.exit(1);
  }

  const slackUserId = process.env.SLACK_USER_ID;
  if (!slackUserId) {
    console.error("SLACK_USER_ID environment variable is required");
    process.exit(1);
  }

  const defaultTimeout = parseInt(process.env.DEFAULT_TIMEOUT || "300", 10);
  const port = parseInt(process.env.PORT || "50000", 10);

  return { slackBotToken, slackUserId, defaultTimeout, port };
}
