require("dotenv").config();
const { downloadInstagramMedia } = require("./instagram");
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once("ready", () => {
  console.log("Bot is ready!");
});

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  if (message.content.startsWith("!ig")) {
    if (!message.member.permissions.has("ADMINISTRATOR")) {
      message.reply("Only moderators can use the command right now...");
      return;
    } else console.log("!download command detected");

    let instagramUrl = message.content.split(" ")[1];

    // Remove trailing slash if present
    if (instagramUrl.endsWith("/")) {
      instagramUrl = instagramUrl.slice(0, -1);
    }

    downloadInstagramMedia(instagramUrl, message)
      .then(() => console.log("Media downloaded successfully"))
      .catch((error) => console.error("Error downloading media:", error));
  }
});

client.login(process.env.DISCORD_TOKEN);
