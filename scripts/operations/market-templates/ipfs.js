const { BET_TYPE_LABELS, CATEGORY_NAMES, getResolutionDateDisplay } = require("./helpers");

/**
 * IPFS/Pinata Integration for Market Metadata
 *
 * Handles uploading market metadata to IPFS via Pinata.
 * Follows the market-metadata-v1.json schema.
 *
 * Supported environment variables (in order of preference):
 * - PINATA_JWT (recommended - JWT token from Pinata dashboard)
 * - PINATA_API_KEY + PINATA_SECRET_KEY (legacy - API key pair)
 */

// Category images uploaded to IPFS via Pinata (2026-01-29)
const CATEGORY_IMAGES = {
  sports: "ipfs://bafkreick4q37qtmtev7layzljc3oh2c3ydjwzhr75e432bhf2pqnf6avqu",
  politics: "ipfs://bafkreif4awhkoa5zbzr6nygi36tino6emw6wqz7fz3fg3ngdf5nmp2rspy",
  finance: "ipfs://bafkreihan73g73bxjcphx4tqez3yhasdxl3nuza4myzfnhzvuggpi2m77a",
  tech: "ipfs://bafkreieggubeqnvyhlx7hqpuupb6hhez76lupje4zzj2uy7m4c2xmy6vh4",
  crypto: "ipfs://bafkreigr5putymjyau6mb6i7ibau46xakqixqhrflpe76u3wiwcwnq7ozu",
  "pop-culture": "ipfs://bafkreicwpno6audhbq6rc62yi6g3vvquj4ax23pq7q7ot7jmfa3vauwoem",
  weather: "ipfs://bafkreiea4k4ocudprnq6dc5jj4zdx25xymtj3khqpzfbsmvbhypx7cbc4y",
};

// Default placeholder image if category not found
const DEFAULT_IMAGE = "ipfs://bafkreick4q37qtmtev7layzljc3oh2c3ydjwzhr75e432bhf2pqnf6avqu";

/**
 * Initialize Pinata SDK
 * Supports JWT (preferred) or API key/secret authentication
 * @returns {Object|null} Pinata SDK instance or null if not configured
 */
function initPinata() {
  const jwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const secretKey = process.env.PINATA_SECRET_KEY;

  // Prefer JWT authentication
  if (jwt) {
    try {
      const pinataSDK = require("@pinata/sdk");
      return new pinataSDK({ pinataJWTKey: jwt });
    } catch (error) {
      console.warn("Pinata SDK not installed. Run: npm install @pinata/sdk");
      return null;
    }
  }

  // Fall back to API key/secret
  if (apiKey && secretKey) {
    try {
      const pinataSDK = require("@pinata/sdk");
      return new pinataSDK(apiKey, secretKey);
    } catch (error) {
      console.warn("Pinata SDK not installed. Run: npm install @pinata/sdk");
      return null;
    }
  }

  console.warn("Pinata credentials not configured. Set PINATA_JWT or PINATA_API_KEY + PINATA_SECRET_KEY.");
  return null;
}

/**
 * Build metadata object from template following market-metadata-v1.json schema
 * @param {Object} template - Market template
 * @param {string} imageUrl - IPFS URL for category image
 * @param {Object} options - Additional options
 * @returns {Object} Metadata object
 */
function buildMetadataFromTemplate(template, imageUrl, options = {}) {
  const {
    creatorAddress = "0x0000000000000000000000000000000000000000",
    tradingPeriodDays = 14,
    initialLiquidity = 100,
    network = "Ethereum Classic",
  } = options;

  const now = new Date();
  const resolutionDate = getResolutionDateDisplay(template);

  // Build description: include the question followed by context
  // Frontend shows: name → Title, description → "Question" section
  const fullDescription = template.description
    ? `${template.question}\n\n${template.description}`
    : template.question;

  return {
    // Required fields
    // name: Used for card title and detail header
    name: template.question,
    // description: Shown in "Question" section of detail view
    description: fullDescription,
    image: imageUrl || CATEGORY_IMAGES[template.category] || DEFAULT_IMAGE,

    // Attributes for filtering/display
    attributes: [
      {
        trait_type: "Category",
        value: CATEGORY_NAMES[template.category] || template.category,
      },
      {
        trait_type: "Bet Type",
        value: BET_TYPE_LABELS[template.betType] || "Yes / No",
      },
      {
        trait_type: "Trading Period",
        value: `${tradingPeriodDays} days`,
        display_type: "string",
      },
      {
        trait_type: "Initial Liquidity",
        value: initialLiquidity,
        display_type: "number",
      },
      {
        trait_type: "Network",
        value: network,
      },
      {
        trait_type: "Status",
        value: "Active",
      },
      {
        trait_type: "Resolution Date",
        value: resolutionDate,
      },
    ],

    // Extended properties
    properties: {
      schema_version: "1.1.0",
      resolution_criteria:
        template.resolutionCriteria ||
        `Market resolves based on official outcome of: ${template.question}`,
      creator: creatorAddress,
      created_at: now.toISOString(),
      tags: template.tags || [],
      correlation_group_id: template.correlationGroupId || null,
      correlation_group_name: template.correlationGroupName || null,
    },
  };
}

/**
 * Upload metadata to IPFS via Pinata
 * @param {Object} metadata - Metadata object
 * @param {string} name - Name for the pin
 * @returns {Promise<string>} IPFS URI
 */
async function uploadMetadataToPinata(metadata, name) {
  const pinata = initPinata();

  if (!pinata) {
    // Return a placeholder URI if Pinata not configured
    console.log(`[DRY RUN] Would upload metadata for: ${name}`);
    return `ipfs://placeholder-${Date.now()}`;
  }

  try {
    const options = {
      pinataMetadata: {
        name: `market-${name}-${Date.now()}`,
      },
      pinataOptions: {
        cidVersion: 1,
      },
    };

    const result = await pinata.pinJSONToIPFS(metadata, options);
    return `ipfs://${result.IpfsHash}`;
  } catch (error) {
    console.error(`Failed to upload metadata: ${error.message}`);
    throw error;
  }
}

/**
 * Upload template metadata to IPFS
 * @param {Object} template - Market template
 * @param {Object} options - Upload options
 * @returns {Promise<string>} IPFS URI
 */
async function uploadTemplateMetadata(template, options = {}) {
  const imageUrl = options.imageUrl || CATEGORY_IMAGES[template.category] || DEFAULT_IMAGE;
  const metadata = buildMetadataFromTemplate(template, imageUrl, options);
  const shortName = template.question.slice(0, 50).replace(/[^a-zA-Z0-9]/g, "-");
  return uploadMetadataToPinata(metadata, shortName);
}

/**
 * Batch upload all template metadata with rate limiting
 * @param {Array} templates - Market templates
 * @param {Object} options - Upload options
 * @param {number} delayMs - Delay between uploads (default 500ms)
 * @returns {Promise<Array>} Array of IPFS URIs
 */
async function batchUploadMetadata(templates, options = {}, delayMs = 500) {
  const uris = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  console.log(`Uploading ${templates.length} metadata files to IPFS...`);

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];

    try {
      const uri = await uploadTemplateMetadata(template, options);
      uris.push(uri);
      console.log(`  [${i + 1}/${templates.length}] Uploaded: ${template.question.slice(0, 40)}...`);
    } catch (error) {
      console.error(`  [${i + 1}/${templates.length}] Failed: ${template.question.slice(0, 40)}...`);
      uris.push(null); // Push null for failed uploads
    }

    // Rate limit
    if (i < templates.length - 1) {
      await sleep(delayMs);
    }
  }

  const successful = uris.filter((u) => u !== null).length;
  console.log(`\nUpload complete: ${successful}/${templates.length} successful`);

  return uris;
}

/**
 * Upload category images to IPFS
 * This should be run once to get permanent CIDs for category images
 * @param {string} imagesDir - Directory containing category images
 * @returns {Promise<Object>} Map of category to IPFS URL
 */
async function uploadCategoryImages(imagesDir) {
  const pinata = initPinata();
  const fs = require("fs");
  const path = require("path");

  if (!pinata) {
    console.warn("Pinata not configured. Using placeholder images.");
    return CATEGORY_IMAGES;
  }

  const categories = ["sports", "politics", "finance", "tech", "crypto", "pop-culture", "weather"];
  const results = {};

  for (const category of categories) {
    const imagePath = path.join(imagesDir, `${category}.png`);

    if (!fs.existsSync(imagePath)) {
      console.warn(`Image not found: ${imagePath}. Using placeholder.`);
      results[category] = DEFAULT_IMAGE;
      continue;
    }

    try {
      const readableStreamForFile = fs.createReadStream(imagePath);
      const options = {
        pinataMetadata: {
          name: `market-category-${category}`,
        },
      };

      const result = await pinata.pinFileToIPFS(readableStreamForFile, options);
      results[category] = `ipfs://${result.IpfsHash}`;
      console.log(`Uploaded ${category} image: ${results[category]}`);
    } catch (error) {
      console.error(`Failed to upload ${category} image: ${error.message}`);
      results[category] = DEFAULT_IMAGE;
    }
  }

  return results;
}

/**
 * Verify Pinata connection
 * @returns {Promise<boolean>} True if connected
 */
async function verifyPinataConnection() {
  const pinata = initPinata();

  if (!pinata) {
    return false;
  }

  try {
    const result = await pinata.testAuthentication();
    console.log("Pinata connection verified:", result.authenticated);
    return result.authenticated;
  } catch (error) {
    console.error("Pinata authentication failed:", error.message);
    return false;
  }
}

module.exports = {
  CATEGORY_IMAGES,
  DEFAULT_IMAGE,
  initPinata,
  buildMetadataFromTemplate,
  uploadMetadataToPinata,
  uploadTemplateMetadata,
  batchUploadMetadata,
  uploadCategoryImages,
  verifyPinataConnection,
};
