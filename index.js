require("dotenv").config();
const { firefox } = require("playwright-firefox");
const axios = require("axios");
const { Client, GatewayIntentBits } = require("discord.js");
const sharp = require("sharp");

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

async function getImageWidth(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return metadata.width;
  } catch (error) {
    console.error("Error getting image width:", error);
    return -1;
  }
}

async function downloadInstagramMedia(url, message) {
  try {
    const initialMessage = await message.reply(`Retrieving yakgwa goodies...`);

    // Launch Firefox browser using Playwright
    const browser = await firefox.launch();
    const context = await browser.newContext();

    // Navigate to the Instagram URL
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for single or multiple post container to load
    await page.waitForSelector("._aap0, .x5yr21d.x1uhb9sk.xh8yej3, ._aagv", {
      timeout: 10000,
    });

    const mediaUrls = await getUniqueMediaUrls(page);

    // Get the date of the post
    const postDate = await page.$eval("time", (time) =>
      time.getAttribute("datetime")
    );
    const formattedPostDate = new Date(postDate)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "_");

    const attachments = [];
    let skippedFiles = 0;
    for (let i = 0; i < mediaUrls.length; i++) {
      let response;
      if (mediaUrls[i].type === "video" || mediaUrls[i].type === "image") {
        response = await axios.get(mediaUrls[i].url, {
          responseType: "arraybuffer",
        });
      } else {
        console.log(`Unsupported media type: ${mediaUrls[i].type}. Skipping.`);
        skippedFiles++;
        continue;
      }

      if (mediaUrls[i].type === "image") {
        const width = await getImageWidth(response.data);
        if (width < 1000) {
          console.log(
            `Image ${i + 1} has width less than 1000 pixels. Skipping.`
          );
          skippedFiles++;
          continue;
        }
      }

      const indexAdjusted = i - skippedFiles;
      const filename = `${formattedPostDate}_${(indexAdjusted + 1)
        .toString()
        .padStart(2, "0")}.${mediaUrls[i].type === "image" ? "jpg" : "mp4"}`;

      const attachment = {
        buffer: Buffer.from(response.data, "binary"),
        filename: filename,
        type: mediaUrls[i].type,
      };

      attachments.push(attachment);
    }

    await sendMediaAttachments(url, attachments, initialMessage);

    await browser.close();
  } catch (error) {
    console.error("Error:", error);
  }
}

async function sendMediaAttachments(url, attachments, initialMessage) {
  const files = [];
  attachments.forEach((attachment, index) => {
    files.push({
      attachment: attachment.buffer,
      name: attachment.filename,
    });
  });

  await initialMessage.edit({ content: `<${url}>`, files: files });
  attachments.length = 0;
}

async function getUniqueMediaUrls(page) {
  let mediaUrls = [];
  const retrievedUrls = new Set();
  let hasNextPage = true;

  while (hasNextPage) {
    // Check for single photo posts
    const singlePhoto = await page.$$eval("._aagv img", (imgs) =>
      imgs.map((img) => ({ url: img.src, type: "image" }))
    );

    // Check for single video posts
    const singleVideo = await page.$$eval(
      ".x5yr21d.x1uhb9sk.xh8yej3 video",
      (vids) => vids.map((vid) => ({ url: vid.src, type: "video" }))
    );

    // Check for multiple posts
    const multiplePost = await page.$$eval(
      ".x1iyjqo2 ._aap0 img, .x1iyjqo2 ._aap0 video", // Adjusted selector for multiple post
      (medias) =>
        medias.map((media) => ({
          url: media.src || media.getAttribute("srcset"),
          type: media.tagName.toLowerCase() === "img" ? "image" : "video",
        }))
    );

    // Add single photo posts to mediaUrls
    for (const media of singlePhoto) {
      if (!retrievedUrls.has(media.url)) {
        mediaUrls.push(media);
        retrievedUrls.add(media.url);
      }
    }

    // Add single video posts to mediaUrls
    for (const media of singleVideo) {
      if (!retrievedUrls.has(media.url)) {
        mediaUrls.push(media);
        retrievedUrls.add(media.url);
      }
    }

    // Add multiple post media to mediaUrls
    for (const media of multiplePost) {
      if (!retrievedUrls.has(media.url)) {
        mediaUrls.push(media);
        retrievedUrls.add(media.url);
      }
    }

    // Check for the "Next" button within the same container
    const nextButton = await page.$('.x1iyjqo2 ._aao_ button[aria-label="Next"]');
    if (!nextButton) {
      hasNextPage = false;
    } else {
      // Click on the "Next" button to load the next page
      await nextButton.click();

      // Wait for the media container to load on the next page
      await page.waitForSelector(".x1iyjqo2 .x5yr21d.x1uhb9sk.xh8yej3, .x1iyjqo2 ._aagv, .x1iyjqo2 ._aap0", {
        timeout: 10000,
      });
    }
  }

  return mediaUrls;
}

client.login(process.env.DISCORD_TOKEN);
