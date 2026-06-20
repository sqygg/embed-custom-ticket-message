const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const TICKET_CHANNEL_PREFIX = "ticket-";
const TICKET_CATEGORY_NAME = ╭ tickets ╮;

// ─── PRODUCT KNOWLEDGE BASE ───────────────────────────────────────────────────

// Exodus: fetched automatically from your website
const EXODUS_URL = "https://m0gged.mysellauth.com/blog";

// Crusader: paste your product guide below
const CRUSADER_KNOWLEDGE = `
How to download and run Crusader correctly?
Step-by-step instructions for running the software:

After successful payment, you will receive a key to activate access to the cheat, a link to this page, and a link to the loader.
Download the cheat loader from the link you received with the key.
Extract the files from the archive and place them in a separate folder. The folder name should be written in English letters, it is recommended to place this folder in the root of the C drive.
Run the cheat loader as administrator.
Insert your key into the "Serial Key" field and click "Sign In".
After a short loading, you will see the R6S icon. 
Click the "Start Injection Process" button.
The message "Please Open Rainbow Six Siege" will appear, it's time to launch the game!
When the game starts, press the "Insert" key while in the main menu.
After pressing Insert, you need to wait a little for the injection to complete.
The cheat menu will appear in front of you. The key to close/open the menu is Insert.
If you plan to use Crusader with a spoofer, always run the cheat loader first, and then the spoofer.

Common problems and solutions.
Here we have collected popular problems and ways to fix them:

Uninstall Faceit anti-cheat and Riot Vanguard using "Add or Remove Programs". Anti-cheats prevent cheats from working;
Disable all antiviruses on your computer, and also completely disable Windows Defender (Real-time Protection).
Disable Windows Defender (https://www.sordum.org/9480/defender-control-v2-1/)
If you have problems with launching/injection, then you need to download this file. Run the file and restart your PC, then try to run the cheat again. You should also disable kernel isolation and vulnerable driver blocking in Windows Defender.
To run the cheat, you must also disable Reputation-based Protection.
Open the start(windows) menu and search for “Reputation-Based Protection.” Open this window.

In the window that opens, disable all options.
Also, if you have problems with cheat injection or other problems during the game (ESP lags, etc.), then try switching the screen mode to "Borderless / Windowed)" in the game settings.
https://mega.nz/file/uURS0ZgL#gn9i_rBW__80V9uzexA_Cr2vPUPNGQK2aif4qtevXHs 

`;

// Vega: paste your product guide below
const VEGA_KNOWLEDGE = `
Common Error Fixes 
- Menu Not Showing
Disable Windows Exploit Protection:
Windows Security -> App & Browser Control ->
Exploit Protection -> Turn OFF 
- Loader Crashes / Won't Start
Run CMD as Administrator and type:
DISM /Online /Cleanup-Image /ScanHealth
DISM /Online /Cleanup-Image /RestoreHealth sfc / scannow
Requires restart afterwards 
- DLL Error on Startup
Install Visual C++ 2015 x64 Redistributable: https://www.microsoft.com/en-us/download/details.aspx?id=48145
-Loader Keeps Asking to Restart
Common causes:
Multiple Windows installs
Broken / duplicate EFI partition
Rare laptop firmware issue
Fixes:
Unplug other Windows drives
Delete extra EFI partition (advancec
Reinstall Windows
- BSOD (Blue Screen Of Death)
If BSODs occur, re-check:
Hyper-V / VBS disabled
No antivirus or anticheat running
System meets requirements
- Failed to load map memory = ask if he has at least 16gb ram
and if yes tell him to disable every startup apps
`;

// -----------------------------------------------------

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Cache Exodus website content so we don't fetch it on every single message
let exodusCache = { content: null, fetchedAt: null };
const CACHE_TTL_MS = 30 * 60 * 1000; // refresh every 30 minutes

async function fetchExodus() {
  const now = Date.now();
  if (exodusCache.content && (now - exodusCache.fetchedAt) < CACHE_TTL_MS) {
    return exodusCache.content;
  }
  try {
    console.log("🌐 Fetching Exodus guide from website...");
    const res = await fetch(EXODUS_URL);
    const html = await res.text();
    // Strip HTML tags to get plain text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20000); // limit to 20k chars
    exodusCache = { content: text, fetchedAt: now };
    console.log("✅ Exodus guide fetched successfully");
    return text;
  } catch (err) {
    console.error("❌ Failed to fetch Exodus guide:", err.message);
    return "Exodus product guide could not be loaded. Please let the customer know a human agent will assist them.";
  }
}

function detectProduct(text) {
  const lower = text.toLowerCase();
  if (lower.includes("exodus")) return "exodus";
  if (lower.includes("crusader")) return "crusader";
  if (lower.includes("vega")) return "vega";
  return null;
}

async function buildSystemPrompt(product) {
  let knowledgeSection = "";

  if (product === "exodus") {
    const content = await fetchExodus();
    knowledgeSection = `EXODUS PRODUCT GUIDE (fetched from website):\n${content}`;
  } else if (product === "crusader") {
    knowledgeSection = `CRUSADER PRODUCT GUIDE:\n${CRUSADER_KNOWLEDGE}`;
  } else if (product === "vega") {
    knowledgeSection = `VEGA PRODUCT GUIDE:\n${VEGA_KNOWLEDGE}`;
  } else {
    // No product detected — load all knowledge
    const exodusContent = await fetchExodus();
    knowledgeSection = `
EXODUS PRODUCT GUIDE (fetched from website):
${exodusContent}

CRUSADER PRODUCT GUIDE:
${CRUSADER_KNOWLEDGE}

VEGA PRODUCT GUIDE:
${VEGA_KNOWLEDGE}
    `;
  }

  return `You are a friendly and professional customer support agent for a software/product store.
Answer the customer's question using ONLY the product guide below.
- Be concise and clear.
- If the answer isn't in the guide, say you don't have that information and let them know a human agent will follow up.
- Always greet the customer warmly in your first message.
- Use Discord markdown for formatting when helpful (bold, bullet points).
- If the customer mentions a specific product (Exodus, Crusader, or Vega), focus on that product's guide.

${knowledgeSection}`;
}

function isOwnerUnavailable() {
  // Greece timezone (Europe/Athens) — automatically handles EET/EEST daylight saving
  const hour = parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Athens",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
  return hour >= 0 && hour < 10;
}

const UNAVAILABLE_MSG =
  "⚠️ The owner is not available right now. I can support you as well as the mods, however for further technical support you will have to wait.";

function isTicketChannel(channel) {
  if (channel.type !== ChannelType.GuildText) return false;
  if (TICKET_CHANNEL_PREFIX && !channel.name.startsWith(TICKET_CHANNEL_PREFIX)) return false;
  if (TICKET_CATEGORY_NAME &&
    channel.parent?.name?.toLowerCase() !== TICKET_CATEGORY_NAME.toLowerCase()) return false;
  return true;
}

async function askGemini(systemPrompt, history, newMessage) {
  const chat = model.startChat({
    history: history.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    systemInstruction: systemPrompt,
  });
  const result = await chat.sendMessage(newMessage);
  return result.response.text();
}

// Fires when Ticket King creates a new ticket channel
discord.on("channelCreate", async (channel) => {
  try {
    if (!isTicketChannel(channel)) return;
    console.log(`🎫 New ticket channel: #${channel.name}`);

    await new Promise((r) => setTimeout(r, 2000));

    const messages = await channel.messages.fetch({ limit: 10 });
    const openingContent = messages
      .filter((m) => m.author.id !== discord.user.id)
      .map((m) => m.content)
      .reverse()
      .join("\n");

    const product = detectProduct(openingContent);
    const systemPrompt = await buildSystemPrompt(product);

    const userMessage = openingContent
      ? `A new support ticket has been opened. Ticket content:\n\n${openingContent}\n\nPlease greet the customer and answer their question.`
      : "A new support ticket has been opened. Please greet the customer and let them know you're here to help.";

    // Send unavailability notice if it's between 00:00 and 10:00 Greece time
    if (isOwnerUnavailable()) {
      await channel.send(UNAVAILABLE_MSG);
    }

    await channel.sendTyping();
    const reply = await askGemini(systemPrompt, [], userMessage);
    await channel.send(reply);
    console.log(`✉️  Replied to #${channel.name} (product: ${product || "unknown"})`);
  } catch (err) {
    console.error("Error handling ticket channel:", err);
  }
});

// Respond to follow-up messages in ticket channels
discord.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!isTicketChannel(message.channel)) return;

    const channel = message.channel;

    const history = await channel.messages.fetch({ limit: 20 });
    const sorted = [...history.values()].reverse();

    // Detect product from full conversation
    const fullText = sorted.map(m => m.content).join(" ");
    const product = detectProduct(fullText);
    const systemPrompt = await buildSystemPrompt(product);

    const chatHistory = sorted
      .slice(0, -1)
      .filter((m) => m.content.trim())
      .map((m) => ({
        role: m.author.id === discord.user.id ? "assistant" : "user",
        content: m.content,
      }));

    await channel.sendTyping();
    const reply = await askGemini(systemPrompt, chatHistory, message.content);
    await channel.send(reply);
  } catch (err) {
    console.error("Error handling follow-up message:", err);
  }
});

discord.once("ready", () => {
  console.log(`✅ Bot is online as ${discord.user.tag}`);
  // Pre-fetch Exodus on startup
  fetchExodus();
});

discord.login(DISCORD_TOKEN);