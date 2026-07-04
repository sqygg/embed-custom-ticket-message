require("dotenv").config();
const { Client, GatewayIntentBits, ChannelType, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ADMIN_ROLE_NAME = process.env.ADMIN_ROLE || "Admin";

const TICKET_CHANNEL_PREFIX = "ticket-";
const TICKET_CATEGORY_NAME = "╭ tickets ╮";
const REVIEW_CHANNEL_ID = "1518902652380123238";
const HONEYPOT_CHANNEL_ID = "1516174575082410115";
const SERVER_INVITE = "https://discord.gg/m0gged";
const BANNED_USERNAME_WORDS = ["bio", "server in bio"];
const INAPPROPRIATE_USERNAME = "inappropriate username";

// Map to track who opened each ticket: channelId -> { userId, channelName }
const ticketOpeners = new Map();
const GUIDES_FILE = path.join(__dirname, "guides.json");
const LOADER_FILE = path.join(__dirname, "loader.json");

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function loadFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function saveFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ─── AVAILABILITY ─────────────────────────────────────────────────────────────
function isOwnerOnline() {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Athens",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
  return hour >= 10 && hour < 24;
}

// ─── DISCORD CLIENT ───────────────────────────────────────────────────────────
const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

function isTicketChannel(channel) {
  if (channel.type !== ChannelType.GuildText) return false;
  if (!channel.name.startsWith(TICKET_CHANNEL_PREFIX)) return false;
  if (
    TICKET_CATEGORY_NAME &&
    channel.parent?.name?.toLowerCase() !== TICKET_CATEGORY_NAME.toLowerCase()
  ) return false;
  return true;
}

function isAdmin(member) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.roles.cache.some((r) => r.name === ADMIN_ROLE_NAME)
  );
}

function hasInappropriateUsername(username) {
  // Check for banned words
  const lowerUsername = username.toLowerCase();
  if (BANNED_USERNAME_WORDS.some((word) => lowerUsername.includes(word))) {
    return true;
  }

  // Check for special characters that sort to top (Unicode symbols, etc)
  // Allow: letters, numbers, spaces, common punctuation (-, _, .)
  const appropriateChars = /^[a-zA-Z0-9\s\-_\.]+$/;
  if (!appropriateChars.test(username)) {
    return true;
  }

  return false;
}

// ─── TICKET MESSAGE ───────────────────────────────────────────────────────────
discord.on("channelCreate", async (channel) => {
  try {
    if (!isTicketChannel(channel)) return;
    console.log(`🎫 New ticket: #${channel.name}`);

    await new Promise((r) => setTimeout(r, 2000));

    // Find the ticket opener from Ticket King's ping
    try {
      const messages = await channel.messages.fetch({ limit: 10 });
      for (const msg of messages.values()) {
        if (msg.mentions.users.size > 0) {
          const opener = msg.mentions.users.find((u) => !u.bot);
          if (opener) {
            ticketOpeners.set(channel.id, { userId: opener.id, channelName: channel.name });
            console.log(`👤 Ticket opener saved: ${opener.tag} for #${channel.name}`);
            break;
          }
        }
      }
    } catch (err) {
      console.error("Could not fetch opener:", err.message);
    }

    const online = isOwnerOnline();
    const guides = loadFile(GUIDES_FILE);
    const loaders = loadFile(LOADER_FILE);
    const allProducts = [...new Set([...Object.keys(guides), ...Object.keys(helps)])];
    const productList = allProducts.length > 0
      ? allProducts.map((p) => `• **${p}**`).join("\n")
      : "• Exodus\n• Crusader\n• Vega";

    const embed = new EmbedBuilder()
      .setTitle("👋 Welcome to Support")
      .setColor(online ? 0x00ff88 : 0xaa00ff)
      .setDescription(
        online
          ? "The owner is **online** and will assist you shortly.\n\nIn the meantime, feel free to ping a **moderator** or use the commands below, if u have a cheet related issue or question."
          : "The owner is currently **offline**. Please ping a **moderator** or use the commands below while you wait, if u have a cheet related issue or question."
      )
      .addFields(
        {
          name: "📚 Guide Commands",
          value: `Use \`/guide <product>\` for setup guides:\n${productList}`,
        },
        {
          name: "🆘 Loader Commands",
          value: `Use \`/loader <product>\` for troubleshooting:\n${productList}`,
        }
      )
      .setFooter({ text: "Please describe your issue and we'll get back to you ASAP." });

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Error handling ticket channel:", err);
  }
});

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
discord.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /ping — admin only
  if (interaction.commandName === "ping") {
    if (!isAdmin(interaction.member)) {
      await interaction.reply({ content: "❌ You don't have permission to use this command." });
      return;
    }
    await interaction.reply({ content: "Pong! 🏓" });
  }

  // ── GUIDE COMMANDS ──────────────────────────────────────────────────────────

  if (interaction.commandName === "guide") {
    const product = interaction.options.getString("product").toLowerCase();
    const guides = loadFile(GUIDES_FILE);

    if (!guides[product]) {
      await interaction.reply({ content: `❌ No guide found for **${product}**. An admin can create one with \`/guidecreate\`.` });
      return;
    }

    const g = guides[product];
    const embed = new EmbedBuilder()
      .setTitle(g.title || `📖 ${product} — Setup Guide`)
      .setColor(g.color || 0x00ffff)
      .setDescription(g.content)
      .setFooter({ text: "If your issue persists, ping a moderator." });

    await interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "guidecreate") {
    if (!isAdmin(interaction.member)) {
      await interaction.reply({ content: "❌ You don't have permission to use this command." });
      return;
    }

    const product = interaction.options.getString("product").toLowerCase();
    const title = interaction.options.getString("title");
    const content = interaction.options.getString("content");
    const colorHex = interaction.options.getString("color") || "#00ffff";
    const color = parseInt(colorHex.replace("#", ""), 16) || 0x00ffff;

    const guides = loadFile(GUIDES_FILE);
    guides[product] = { title, content, color };
    saveFile(GUIDES_FILE, guides);

    const embed = new EmbedBuilder()
      .setTitle(`✅ Guide saved for **${product}**`)
      .setColor(0x00ff88)
      .addFields(
        { name: "Product", value: product },
        { name: "Title", value: title },
        { name: "Content Preview", value: content.slice(0, 200) + (content.length > 200 ? "..." : "") }
      );

    await interaction.reply({ embeds: [embed] });
    console.log(`📝 Guide saved for: ${product}`);
  }

  if (interaction.commandName === "guidelist") {
    const guides = loadFile(GUIDES_FILE);
    const list = Object.keys(guides);

    if (list.length === 0) {
      await interaction.reply({ content: "No guides saved yet. Use `/guidecreate` to add one." });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📚 Saved Guides")
      .setColor(0x00ffff)
      .setDescription(list.map((p) => `• **${p}** — ${guides[p].title}`).join("\n"));

    await interaction.reply({ embeds: [embed] });
  }

  // ── HELP COMMANDS ───────────────────────────────────────────────────────────

  if (interaction.commandName === "loader") {
    const product = interaction.options.getString("product").toLowerCase();
    const loaders = loadFile(LOADER_FILE);

    if (!loaders[product]) {
      await interaction.reply({ content: `❌ No loader found for **${product}**. An admin can create one with \`/loadercreate\`.` });
      return;
    }

    const h = loaders[product];
    const embed = new EmbedBuilder()
      .setTitle(h.title || `🆘 ${product} — Troubleshooting`)
      .setColor(h.color || 0xaa00ff)
      .setDescription(h.content)
      .setFooter({ text: "If your issue persists, ping a moderator." });

    await interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "loadercreate") {
    if (!isAdmin(interaction.member)) {
      await interaction.reply({ content: "❌ You don't have permission to use this command." });
      return;
    }

    const product = interaction.options.getString("product").toLowerCase();
    const title = interaction.options.getString("title");
    const content = interaction.options.getString("content");
    const colorHex = interaction.options.getString("color") || "#ff4444";
    const color = parseInt(colorHex.replace("#", ""), 16) || 0xaa00ff;

    const loaders = loadFile(LOADER_FILE);
    loaders[product] = { title, content, color };
    saveFile(LOADER_FILE, loaders);

    const embed = new EmbedBuilder()
      .setTitle(`✅ Help saved for **${product}**`)
      .setColor(0x00ff88)
      .addFields(
        { name: "Product", value: product },
        { name: "Title", value: title },
        { name: "Content Preview", value: content.slice(0, 200) + (content.length > 200 ? "..." : "") }
      );

    await interaction.reply({ embeds: [embed] });
    console.log(`🆘 Loader saved for: ${product}`);
  }

  if (interaction.commandName === "loaderlist") {
    const loaders = loadFile(LOADER_FILE);
    const list = Object.keys(helps);

    if (list.length === 0) {
      await interaction.reply({ content: "No help entries saved yet. Use `/helpcreate` to add one." });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📦 Loader Instructions Saved")
      .setColor(0xaa00ff)
      .setDescription(list.map((p) => `• **${p}** — ${helps[p].title}`).join("\n"));

    await interaction.reply({ embeds: [embed] });
  }
});

// ─── USERNAME FILTER ────────────────────────────────────────────────────────────
discord.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (oldMember.nickname === newMember.nickname) return;
  if (newMember.user.bot) return;

  const nickname = newMember.nickname || newMember.user.username;
  if (hasInappropriateUsername(nickname)) {
    try {
      await newMember.setNickname(INAPPROPRIATE_USERNAME);
      console.log(`🚫 Renamed ${newMember.user.tag} to "${INAPPROPRIATE_USERNAME}"`);
    } catch (err) {
      console.error("Could not rename user:", err.message);
    }
  }
});

// ─── TICKET CLOSE → DM REVIEW ────────────────────────────────────────────────
discord.on("channelDelete", async (channel) => {
  try {
    if (!ticketOpeners.has(channel.id)) return;
    const { userId, channelName } = ticketOpeners.get(channel.id);
    ticketOpeners.delete(channel.id);

    const user = await discord.users.fetch(userId);
    await user.send(
      `👋 Hey! Your ticket **#${channelName}** has been closed.\n\nWe'd love your feedback! How would you rate the support you received?\n\nPlease reply with a number from **1 to 5** ⭐`
    );
    console.log(`📨 Review DM sent to ${user.tag}`);

    // Store pending review — waiting for rating first
    pendingReviews.set(userId, { channelName, timestamp: Date.now(), stage: "waiting_rating" });
  } catch (err) {
    console.error("Error sending review DM:", err.message);
  }
});

// Map to track pending reviews: userId -> { channelName, rating, timestamp, stage }
// stage: "waiting_rating" or "waiting_comment"
const pendingReviews = new Map();

// Listen for DM replies with rating
discord.on("messageCreate", async (message) => {
  if (!message.author.bot && message.channel.type === ChannelType.DM) {
    if (!pendingReviews.has(message.author.id)) return;

    const { channelName, awaitingComment, rating: savedRating } = pendingReviews.get(message.author.id);

    // Step 2: user is sending their comment
    if (awaitingComment) {
      const comment = message.content.trim().toLowerCase() === "skip" ? null : message.content.trim();
      pendingReviews.delete(message.author.id);

      const stars = "⭐".repeat(savedRating) + "✩".repeat(5 - savedRating);

      const embed = new EmbedBuilder()
        .setTitle("📝 New Support Review")
        .setColor(savedRating >= 4 ? 0x00ff88 : savedRating === 3 ? 0xffaa00 : 0xaa00ff)
        .addFields(
          { name: "User", value: `<@${message.author.id}>`, inline: true },
          { name: "Ticket", value: `#${channelName}`, inline: true },
          { name: "Rating", value: `${stars} (${savedRating}/5)`, inline: false }
        )
        .setTimestamp();

      if (comment) {
        embed.addFields({ name: "Comment", value: comment });
      }

      try {
        const reviewChannel = await discord.channels.fetch(REVIEW_CHANNEL_ID);
        await reviewChannel.send({ embeds: [embed] });
        await message.reply("Thanks for your feedback! 🙏");
        console.log(`⭐ Review received: ${savedRating}/5 from ${message.author.tag}`);
      } catch (err) {
        console.error("Could not send review embed:", err.message);
      }
      return;
    }

    // Step 1: user is sending their rating
    const rating = parseInt(message.content.trim());
    if (isNaN(rating) || rating < 1 || rating > 5) {
      await message.reply("Please reply with a number between **1 and 5** ⭐");
      return;
    }

    // Save rating and ask for comment
    pendingReviews.set(message.author.id, { channelName, rating, awaitingComment: true, timestamp: Date.now() });
    await message.reply("Got it! Would you like to leave a comment? Type it below or reply with **skip** to finish. 💬");
  }

  // HONEYPOT: Kick anyone who messages in the honeypot channel and DM them
  if (!message.author.bot && message.channelId === HONEYPOT_CHANNEL_ID) {
    try {
      const member = await message.guild.members.fetch(message.author.id);
      
      // Send DM first before kicking
      await message.author.send(
        `🪤 **Honeypot Alert!**\n\nYou've triggered our honeypot channel. This is a security measure to catch hacked or scam accounts.\n\nIf you believe this is a mistake, you can rejoin here: ${SERVER_INVITE}\n\nStay safe! 🛡️`
      );

      // Kick the user
      await member.kick("Honeypot triggered");
      console.log(`🪤 User ${message.author.tag} kicked from honeypot and DMed`);
    } catch (err) {
      console.error("Error handling honeypot:", err.message);
    }
  }
});

// ─── REGISTER COMMANDS ────────────────────────────────────────────────────────
discord.once("clientReady", async (client) => {
  console.log(`✅ Bot is online as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Check if bot is alive (admin only)"),

    new SlashCommandBuilder()
      .setName("guide")
      .setDescription("Get a setup guide for a product")
      .addStringOption((opt) =>
        opt.setName("product").setDescription("Which product?").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("guidecreate")
      .setDescription("Create or update a setup guide (admin only)")
      .addStringOption((opt) =>
        opt.setName("product").setDescription("Product name (e.g. exodus)").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("title").setDescription("Guide title").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("content").setDescription("Full guide content").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("color").setDescription("Embed color as hex (e.g. #00ffff)").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("guidelist")
      .setDescription("List all saved setup guides"),

    new SlashCommandBuilder()
      .setName("loader")
      .setDescription("Get loader instructions for a product")
      .addStringOption((opt) =>
        opt.setName("product").setDescription("Which product?").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("loadercreate")
      .setDescription("Create or update loader instructions (admin only)")
      .addStringOption((opt) =>
        opt.setName("product").setDescription("Product name (e.g. exodus)").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("title").setDescription("Help title").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("content").setDescription("Full help content").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("color").setDescription("Embed color as hex (e.g. #ff4444)").setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("loaderlist")
      .setDescription("List all saved loader instructions"),
  ];

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: commands.map((c) => c.toJSON()),
  });
  console.log("✅ Slash commands registered");
});

discord.login(DISCORD_TOKEN);
