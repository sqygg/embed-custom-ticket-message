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

// Map to track who opened each ticket: channelId -> { userId, channelName }
const ticketOpeners = new Map();
const GUIDES_FILE = path.join(__dirname, "guides.json");
const HELP_FILE = path.join(__dirname, "help.json");

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

// ─── TICKET WELCOME ───────────────────────────────────────────────────────────
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
    const helps = loadFile(HELP_FILE);
    const allProducts = [...new Set([...Object.keys(guides), ...Object.keys(helps)])];
    const productList = allProducts.length > 0
      ? allProducts.map((p) => `• **${p}**`).join("\n")
      : "• Exodus\n• Crusader\n• Vega";

    const embed = new EmbedBuilder()
      .setTitle("👋 Welcome to Support")
      .setColor(online ? 0x00ff88 : 0xff4444)
      .setDescription(
        online
          ? "The owner is **online** and will assist you shortly.\n\nIn the meantime, feel free to ping a **moderator** or use the commands below."
          : "The owner is currently **offline**. Please ping a **moderator** or use the commands below while you wait."
      )
      .addFields(
        {
          name: "📚 Guide Commands",
          value: `Use \`/guide <product>\` for setup guides:\n${productList}`,
        },
        {
          name: "🆘 Help Commands",
          value: `Use \`/help <product>\` for troubleshooting:\n${productList}`,
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
      await interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: "Pong! 🏓", ephemeral: true });
  }

  // ── GUIDE COMMANDS ──────────────────────────────────────────────────────────

  if (interaction.commandName === "guide") {
    const product = interaction.options.getString("product").toLowerCase();
    const guides = loadFile(GUIDES_FILE);

    if (!guides[product]) {
      await interaction.reply({ content: `❌ No guide found for **${product}**. An admin can create one with \`/guidecreate\`.`, ephemeral: true });
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
      await interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
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

    await interaction.reply({ embeds: [embed], ephemeral: true });
    console.log(`📝 Guide saved for: ${product}`);
  }

  if (interaction.commandName === "guidelist") {
    const guides = loadFile(GUIDES_FILE);
    const list = Object.keys(guides);

    if (list.length === 0) {
      await interaction.reply({ content: "No guides saved yet. Use `/guidecreate` to add one.", ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📚 Saved Guides")
      .setColor(0x00ffff)
      .setDescription(list.map((p) => `• **${p}** — ${guides[p].title}`).join("\n"));

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── HELP COMMANDS ───────────────────────────────────────────────────────────

  if (interaction.commandName === "help") {
    const product = interaction.options.getString("product").toLowerCase();
    const helps = loadFile(HELP_FILE);

    if (!helps[product]) {
      await interaction.reply({ content: `❌ No help found for **${product}**. An admin can create one with \`/helpcreate\`.`, ephemeral: true });
      return;
    }

    const h = helps[product];
    const embed = new EmbedBuilder()
      .setTitle(h.title || `🆘 ${product} — Troubleshooting`)
      .setColor(h.color || 0xff4444)
      .setDescription(h.content)
      .setFooter({ text: "If your issue persists, ping a moderator." });

    await interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "helpcreate") {
    if (!isAdmin(interaction.member)) {
      await interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
      return;
    }

    const product = interaction.options.getString("product").toLowerCase();
    const title = interaction.options.getString("title");
    const content = interaction.options.getString("content");
    const colorHex = interaction.options.getString("color") || "#ff4444";
    const color = parseInt(colorHex.replace("#", ""), 16) || 0xff4444;

    const helps = loadFile(HELP_FILE);
    helps[product] = { title, content, color };
    saveFile(HELP_FILE, helps);

    const embed = new EmbedBuilder()
      .setTitle(`✅ Help saved for **${product}**`)
      .setColor(0x00ff88)
      .addFields(
        { name: "Product", value: product },
        { name: "Title", value: title },
        { name: "Content Preview", value: content.slice(0, 200) + (content.length > 200 ? "..." : "") }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
    console.log(`🆘 Help saved for: ${product}`);
  }

  if (interaction.commandName === "helplist") {
    const helps = loadFile(HELP_FILE);
    const list = Object.keys(helps);

    if (list.length === 0) {
      await interaction.reply({ content: "No help entries saved yet. Use `/helpcreate` to add one.", ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🆘 Saved Help Entries")
      .setColor(0xff4444)
      .setDescription(list.map((p) => `• **${p}** — ${helps[p].title}`).join("\n"));

    await interaction.reply({ embeds: [embed], ephemeral: true });
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
        .setColor(savedRating >= 4 ? 0x00ff88 : savedRating === 3 ? 0xffaa00 : 0xff4444)
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
      .setName("help")
      .setDescription("Get a troubleshooting guide for a product")
      .addStringOption((opt) =>
        opt.setName("product").setDescription("Which product?").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("helpcreate")
      .setDescription("Create or update a troubleshooting guide (admin only)")
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
      .setName("helplist")
      .setDescription("List all saved troubleshooting guides"),
  ];

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: commands.map((c) => c.toJSON()),
  });
  console.log("✅ Slash commands registered");
});

discord.login(DISCORD_TOKEN);
