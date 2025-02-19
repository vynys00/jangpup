require("dotenv").config();
const { firefox, chromium } = require("playwright");
const axios = require("axios");
const sharp = require("sharp");
const path = require("path");
const USER_DATA_DIR = path.join(__dirname, "user_data");
const fs = require('fs');
async function getImageWidth(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return metadata.width;
  } catch (error) {
    console.error("Error getting image width:", error);
    return -1;
  }
}
async function initialize(browser, page, url, initialMessage) {
  try {
    // Navigate to the Instagram URL

    await page.goto(url, { waitUntil: "domcontentloaded" });

    console.log("waiting page");
    // Wait for single or multiple post container to load

    await page.waitForSelector("._aap0, .x5yr21d.x1uhb9sk.xh8yej3, ._aagv", {
      timeout: 30000,
    });
    await page.evaluate(() => {
      const targetElement = document.querySelector(
        "div.x1qjc9v5.x972fbf.xcfux6l.x1qhh985.xm0m39n.x9f619.x1lliihq.xdt5ytf.x2lah0s.xln7xf2.xk390pu.xdj266r.x11i5rnm.xat24cr.x1mh8g0r.x4uap5.x18d9i69.xkhd6sd.x24vp2c.x1n2onr6.x11njtxf"
      );
      if (targetElement) {
        targetElement.remove(); // Remove the element if found
      }
    });
    const mediaUrls = await getUniqueMediaUrls(page);

    // Get the date of the post
    const postDate = await page.$eval("time.x1p4m5qa", (time) =>
      time.getAttribute("datetime")
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
    await browser.close();
  } catch (error) {
    await page.close();
    await browser.close();
    console.error("Error:", error);
  }
}

async function downloadInstagramMedia(url, message) {
  const cookies = await JSON.parse(fs.readFileSync('cookies.json', 'utf8'));
  // Launch Firefox browser using Playwright
  const browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    logger: {
      isEnabled: (name, severity) => name === "api",
      log: (name, severity, message, args) => console.log(`${name} ${message}`),
    },
    viewport: { width: 1366, height: 1024 }, // Set custom viewport size
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1", // Set custom user agent
  });
  await browser.addCookies(cookies);
  const initialMessage = await message.reply(`Retrieving yakgwa goodies...`);

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1366, height: 1024 });
  await browser.addInitScript(() => {
    // This will modify the user agent for every page in this context
    Object.defineProperty(navigator, "userAgent", {
      get: () =>
        "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    });
  });
  // page.on("console", (msg) => {
  //   console.log(msg);
  // });
  await page.goto("https://www.instagram.com/accounts/login/");
// const cookies = await page.context().cookies();
//   fs.writeFileSync('cookies.json', JSON.stringify(cookies));
//   console.log('Cookies saved!');
  // Wait for the login page to load
  await page
    .waitForSelector("form#loginForm", { visible: true, timeout: 10000 })
    .catch(() => {});

  // Check if the login form is visible (indicates user is not logged in yet)
  const isLoginFormVisible = await page.isVisible("form#loginForm");

  if (!isLoginFormVisible) {
    console.log("Already logged in!");
    await initialize(browser, page, url, initialMessage);
  } else {
    // Fill in the username
    await page.waitForSelector(
      'input[aria-label="Phone number, username, or email"]',
      { visible: true }
    );
    await page.fill(
      'input[aria-label="Phone number, username, or email"]',
      process.env.USER_NAME
    );

    // Fill in the password
    await page.waitForSelector('input[aria-label="Password"]', {
      visible: true,
    });
    await page.fill('input[aria-label="Password"]', process.env.SECRET);
    await page.waitForSelector('button[type="submit"]:not([disabled])', {
      visible: true,
    });
    await page.click('button[type="submit"]');
    await page.waitForTimeout(10000);
    await initialize(browser, page, url, initialMessage);
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
  const nextButton = await page.$(
    'button[aria-label="Next"]._afxw._al46._al47'
  );
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
      'button[aria-label="Next"]._afxw._al46._al47'
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
