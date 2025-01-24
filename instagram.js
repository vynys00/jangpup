const { firefox } = require("playwright");
const axios = require("axios");
const sharp = require("sharp");

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
  // Launch Firefox browser using Playwright
  const browser = await firefox.launch({
    logger: {
      isEnabled: (name, severity) => name === "api",
      log: (name, severity, message, args) => console.log(`${name} ${message}`),
    },
  });

  const initialMessage = await message.reply(`Retrieving yakgwa goodies...`);

  const context = await browser.newContext({
    viewport: { width: 810, height: 1080 },
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1",
    bypassCSP: true,
  });
  const page = await context.newPage();
  try {
    // Navigate to the Instagram URL

    await page.goto(url, { waitUntil: "domcontentloaded" });

    console.log("waiting page");
    // Wait for single or multiple post container to load

    // const orderSent = page.locator("._aap0, .x5yr21d.x1uhb9sk.xh8yej3, ._aagv");
    // await orderSent.waitFor({ state: "attached" });

    // await page.reload({ waitUntil: "domcontentloaded" });
    // await orderSent.waitFor();
    const mediaUrls = await getUniqueMediaUrls(page);

    // Get the date of the post
    const postDate = await page.$eval('time.x1p4m5qa', (time) =>
      time.getAttribute('datetime')
    );
    const formattedPostDate = new Date(postDate)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "_");

    const attachments = [];
    console.log(mediaUrls);
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
    await page.close();
    await context.close();
    await browser.close();
  } catch (error) {
    await page.close();
    await context.close();
    await browser.close();
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

  if (files.length <= 10) {
    // Send a single message with all attachments
    await initialMessage.edit({ content: `<${url}>`, files: files });
  } else {
    // Split attachments into two messages
    const firstBatch = files.slice(0, 10);
    const secondBatch = files.slice(10);

    await initialMessage.edit({ content: `<${url}>`, files: firstBatch });

    // Send a new message for the second batch
    await initialMessage.channel.send({
      content: `<${url}>`,
      files: secondBatch,
    });
  }

  // Clear the attachments array
  files.length = 0;
}

async function getUniqueMediaUrls(page) {
  let mediaUrls = [];
  const retrievedUrls = new Set();
  let hasNextPage = true;
  const nextButton = await page.$('.x1iyjqo2 ._aao_ button[aria-label="Next"]');
  if (!nextButton) {
    // Check for single photo posts
    const singlePhoto = await page.$$eval("._aagv img", (imgs) =>
      imgs.map((img) => ({ url: img.src, type: "image" }))
    );

    // Check for single video posts
    const singleVideo = await page.$$eval(
      ".x5yr21d.x1uhb9sk.xh8yej3 video",
      (vids) => vids.map((vid) => ({ url: vid.src, type: "video" }))
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
  }

  while (hasNextPage) {
    // Check for multiple posts
    const multiplePost = await page.$$eval(
      "._acaz img, ._acaz video", // Adjusted selector for multiple post
      (medias) =>
        medias.map((media) => ({
          url: media.src || media.getAttribute("srcset"),
          type: media.tagName.toLowerCase() === "img" ? "image" : "video",
        }))
    );

    // Add multiple post media to mediaUrls
    for (const media of multiplePost) {
      if (!retrievedUrls.has(media.url)) {
        mediaUrls.push(media);
        retrievedUrls.add(media.url);
      }
    }

    // Check for the "Next" button within the same container
    const nextButton = await page.$(
      '._aatg ._aatk._aatn button[aria-label="Next"]'
    );
    if (!nextButton) {
      hasNextPage = false;
    } else {
      // Click on the "Next" button to load the next page
      await nextButton.click();

      // Wait for the media container to load on the next page
      await page.waitForSelector(
        ".x1iyjqo2 .x5yr21d.x1uhb9sk.xh8yej3, ._acaz ._aagv, ._acaz ._aap0",
        {
          timeout: 30000,
        }
      );
    }
  }
  return mediaUrls;
}
module.exports = { downloadInstagramMedia };
