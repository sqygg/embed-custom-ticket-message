require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
} = require("discord.js");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const GUILD_ID = "1157594202700529698";            // Server lock
const TICKET_CHANNEL_PREFIX = "ticket-";
const TICKET_CATEGORY_NAME = "Resell Tickets";
const RESELLER_ROLE_ID = "1534960758260105256";    // Role gate
const SERVER_INVITE = "https://discord.gg/qlfmarket";

const PRICING = [
  "**20%** — No Deposit",
  "**30%** — 50€ Deposit",
  "**35%** — 100€ Deposit",
  "**40%** — 200€ Deposit",
  "**50%** — 350€ Deposit",
].join("\n");

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
  if (channel.guild.id !== GUILD_ID) return false;
  if (!channel.name.startsWith(TICKET_CHANNEL_PREFIX)) return false;
  if (
    !channel.parent ||
    channel.parent.name.toLowerCase() !== TICKET_CATEGORY_NAME.toLowerCase()
  )
    return false;
  return true;
}

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

// ─── TICKET WELCOME ───────────────────────────────────────────────────────────
discord.on("channelCreate", async (channel) => {
  try {
    if (!isTicketChannel(channel)) return;
    console.log(`🎫 New ticket: #${channel.name}`);

    await new Promise((r) => setTimeout(r, 2000));

    // Find the ticket opener from the first mention in recent messages
    let opener = null;
    try {
      const messages = await channel.messages.fetch({ limit: 10 });
      for (const msg of messages.values()) {
        if (msg.mentions.users.size > 0) {
          const u = msg.mentions.users.find((x) => !x.bot);
          if (u) {
            opener = u;
            console.log(`👤 Ticket opener: ${u.tag} for #${channel.name}`);
            break;
          }
        }
      }
    } catch (err) {
      console.error("Could not fetch opener:", err.message);
    }

    // Role gate: does the opener have the reseller role?
    let hasRole = false;
    if (opener) {
      try {
        const member = await channel.guild.members.fetch(opener.id);
        hasRole = member.roles.cache.has(RESELLER_ROLE_ID);
      } catch (err) {
        console.error("Could not fetch member roles:", err.message);
      }
    }

    const online = isOwnerOnline();

    if (hasRole) {
      // ── Reseller: time-based availability embed ──
      const embed = new EmbedBuilder()
        .setTitle("🎫 Support Ticket")
        .setColor(online ? 0x00ff88 : 0xaa00ff)
        .setDescription(
          online
            ? "The owners are **online** and will respond as soon as possible. 🟢"
            : "It's currently **off hours** right now. Please be patient and we'll get back to you as soon as possible. 🌙"
        );

      await channel.send({ embeds: [embed] });
    } else {
      // ── Non-reseller: welcome + pricing embed ──
      const embed = new EmbedBuilder()
        .setTitle("👋 Welcome")
        .setColor(online ? 0x00ff88 : 0xaa00ff)
        .setDescription(
          online
            ? "The owners are currently **online**. 🟢"
            : "The owners are currently **offline**. 🌙"
        )
        .addFields({ name: "💰 Reselling Pricing", value: PRICING })
        .setFooter({ text: SERVER_INVITE.replace("https://", "") });

      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Error handling ticket channel:", err);
  }
});

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
discord.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    if (!isAdmin(interaction.member)) {
      await interaction.reply({
        content: "❌ You don't have permission to use this command.",
      });
      return;
    }
    await interaction.reply({ content: "Pong! 🏓" });
  }

  if (interaction.commandName === "resellpricing") {
    const embed = new EmbedBuilder()
      .setTitle("💰 Reselling Pricing")
      .setColor(0x00ff88)
      .setDescription(PRICING);

    await interaction.reply({ embeds: [embed] });
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
      .setName("resellpricing")
      .setDescription("Show the reselling pricing"),
  ];

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: commands.map((c) => c.toJSON()),
  });
  console.log("✅ Slash commands registered");
});

discord.login(DISCORD_TOKEN);
