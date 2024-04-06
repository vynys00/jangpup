const { firefox } = require("playwright-firefox");
const axios = require("axios");
const sharp = require("sharp");

async function downloadWeverseArtistMedia(url, message) {
  try {
    const initialMessage = await message.reply("Retrieving yakgwa goodies...");
    // Launch Firefox browser using Playwright
    const browser = await firefox.launch();
    const context = await browser.newContext();
    // Navigate to the Instagram URL
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Wait for single or multiple post container to load
    await page.waitForSelector(".WeverseViewer", {
      timeout: 50000,
    });

    const mediaUrls = await getUniqueMediaUrls(page);

    // Get the date of the post
    const postDateText = await page.$eval(
      ".PostHeaderView_date__XJXBZ",
      (element) => element.textContent.trim()
    );

    // Function to add current year if year is missing and extract date
    function formatDateWithYearIfMissing(dateString) {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const yearRegex = /\d{4}/;

      // Regular expression to extract date in the format "MM. DD."
      const dateRegex = /(\d{2}\. \d{2}\.)/;

      // If year is missing, append current year to the date
      if (!yearRegex.test(dateString)) {
        return `${currentYear}_${dateString
          .match(dateRegex)[0]
          .replace(/\./g, "_")
          .replace(/\s/g, "")}`;
      } else {
        // Year is present, extract date and return
        return dateString.replace(/\./g, "_").replace(/\s/g, "").slice(0, 11);
      }
    }

    const formattedPostDate = formatDateWithYearIfMissing(postDateText);
    console.log(formattedPostDate); // Output the formatted date

    const attachments = [];
    let skippedFiles = 0;
    for (let i = 0; i < mediaUrls.length; i++) {
      let response;
      if (mediaUrls[i].type === "image") {
        response = await axios.get(mediaUrls[i].url, {
          responseType: "arraybuffer",
        });
      } else {
        console.log(`Unsupported media type: ${mediaUrls[i].type}. Skipping.`);
        skippedFiles++;
        continue;
      }
      const indexAdjusted = i - skippedFiles;
      const filename = `${formattedPostDate}${(indexAdjusted + 1)
        .toString()
        .padStart(2, "0")}.jpg}`;

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
    console.log(error);
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
  const wvPhotos = await page.$$eval(".photo_wrap img", (imgs) =>
    imgs.map((img) => ({
      url: img.src.split('?')[0], // Remove query parameters
      type: "image"
    }))
  );

  for (const media of wvPhotos) {
    if (!retrievedUrls.has(media.url)) {
      mediaUrls.push(media);
      retrievedUrls.add(media.url);
    }
  }
  console.log(mediaUrls);
  return mediaUrls;
}

module.exports = { downloadWeverseArtistMedia };
