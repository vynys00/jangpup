const { firefox } = require("playwright-firefox");
const axios = require("axios");

async function downloadWeverseMedia(url, message) {
  try {
    const initialMessage = await message.reply("Retrieving yakgwa goodies...");
    // Launch Firefox browser using Playwright
    const browser = await firefox.launch();
    const context = await browser.newContext();
    // Navigate to the Instagram URL
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for single or multiple post container to load
    await page.waitForSelector(".body", {
      timeout: 50000,
    });

    const mediaUrls = await getUniqueMediaUrls(page);
    console.log(mediaUrls);

    // Send the mediaUrls
    await sendMediaUrls(url, mediaUrls, initialMessage);

    await browser.close();
  } catch (error) {
    console.log(error);
  }
}

async function sendMediaUrls(url, mediaUrls, initialMessage) {
  const formattedUrls = mediaUrls.map((media) => media.url);

  // Splitting the URLs into chunks of 2000 characters each
  const chunks = [];
  let currentChunk = "";
  for (const url of formattedUrls) {
    if (currentChunk.length + url.length > 2000) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += url + "\n";
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  // Sending each chunk as a separate message
  for (let i = 0; i < chunks.length; i++) {
    const content =
      i === 0 ? `Media URLs from <${url}>:\n${chunks[i]}` : chunks[i];
    await initialMessage.channel.send(content);
  }
}

async function getUniqueMediaUrls(page) {
  const retrievedUrls = new Set();
  const wvPhotos = await page.$$eval(
    ".MediaImageView_media_image__Cb1pb img",
    (imgs) => imgs.map((img) => ({ url: img.src, type: "image" }))
  );

  const mediaUrls = [];
  for (const media of wvPhotos) {
    if (!retrievedUrls.has(media.url)) {
      mediaUrls.push(media);
      retrievedUrls.add(media.url);
    }
  }
  return mediaUrls;
}

module.exports = { downloadWeverseMedia };
