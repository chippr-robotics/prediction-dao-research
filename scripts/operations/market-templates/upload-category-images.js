#!/usr/bin/env node
/**
 * Upload Category Images to IPFS
 *
 * Downloads free-to-use images and uploads them to Pinata IPFS
 */

require("dotenv").config();
const https = require("https");
const fs = require("fs");
const path = require("path");

// Free-to-use image URLs (Unsplash - CC0 license)
const IMAGE_SOURCES = {
  sports: "https://images.unsplash.com/photo-1461896836934-28f85eae11e5?w=800&q=80",
  politics: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&q=80",
  finance: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80",
  tech: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80",
  crypto: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80",
  "pop-culture": "https://images.unsplash.com/photo-1598387993441-a364f854c3e1?w=800&q=80",
  weather: "https://images.unsplash.com/photo-1504608524841-42fe6f032b4b?w=800&q=80",
};

const TEMP_DIR = path.join(__dirname, ".temp-images");

async function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const filepath = path.join(TEMP_DIR, filename);
    const file = fs.createWriteStream(filepath);

    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve(filepath);
          });
        }).on("error", reject);
      } else {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(filepath);
        });
      }
    }).on("error", (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

async function uploadToPinata(filepath, name) {
  const pinataSDK = require("@pinata/sdk");
  const pinata = new pinataSDK({ pinataJWTKey: process.env.PINATA_JWT });

  const readableStream = fs.createReadStream(filepath);
  const options = {
    pinataMetadata: {
      name: `market-category-${name}`,
    },
    pinataOptions: {
      cidVersion: 1,
    },
  };

  const result = await pinata.pinFileToIPFS(readableStream, options);
  return `ipfs://${result.IpfsHash}`;
}

async function main() {
  console.log("Uploading category images to IPFS...\n");

  // Create temp directory
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const results = {};

  for (const [category, url] of Object.entries(IMAGE_SOURCES)) {
    try {
      console.log(`[${category}] Downloading...`);
      const filepath = await downloadImage(url, `${category}.jpg`);

      console.log(`[${category}] Uploading to IPFS...`);
      const ipfsUrl = await uploadToPinata(filepath, category);

      results[category] = ipfsUrl;
      console.log(`[${category}] ✓ ${ipfsUrl}\n`);
    } catch (error) {
      console.error(`[${category}] ✗ Failed: ${error.message}\n`);
      results[category] = null;
    }
  }

  // Clean up temp directory
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });

  // Output results for copy/paste into ipfs.js
  console.log("\n===========================================");
  console.log("CATEGORY_IMAGES for ipfs.js:");
  console.log("===========================================\n");
  console.log("const CATEGORY_IMAGES = {");
  for (const [category, ipfsUrl] of Object.entries(results)) {
    if (ipfsUrl) {
      console.log(`  "${category}": "${ipfsUrl}",`);
    }
  }
  console.log("};");
}

main().catch(console.error);
