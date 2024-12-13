const { firefox } = require("playwright");
const axios = require("axios");

async function downloadWeverseArtistMedia(url, message) {
  const browser = await firefox.launch();
  
    // Function to add current year if year is missing and extract date
    function formatDateWithYearIfMissing(dateString) {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
    
      // Regular expression to extract the month abbreviation and day
      const dateRegex = /([A-Za-z]{3}) (\d{1,2}),/;
    
      // Try to match the new format "Dec 9, ..."
      const dateMatch = dateString.match(dateRegex);
    
      if (!dateMatch) {
        throw new Error('Date format invalid or missing from dateString: ' + dateString);
      }
    
      const monthAbbreviation = dateMatch[1];
      const day = dateMatch[2];
    
      // Convert month abbreviation to number (e.g., 'Dec' -> 12)
      const monthMap = {
        Jan: '01',
        Feb: '02',
        Mar: '03',
        Apr: '04',
        May: '05',
        Jun: '06',
        Jul: '07',
        Aug: '08',
        Sep: '09',
        Oct: '10',
        Nov: '11',
        Dec: '12',
      };
    
      const month = monthMap[monthAbbreviation];
    
      if (!month) {
        throw new Error('Invalid month abbreviation in date string: ' + monthAbbreviation);
      }
    
      // If the year is missing, append the current year to the date
      const formattedDate = `${currentYear}_${month}${day.padStart(2, '0')}_`;
    
      return formattedDate;
    }
  try {
    const initialMessage = await message.reply("Retrieving yakgwa goodies...");
    // Launch Firefox browser using Playwright
    
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
    await browser.close();
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
      url: img.src.split("?")[0], // Remove query parameters
      type: "image",
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
