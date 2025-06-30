const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
} = require("discord.js");
const express = require("express");
const app = express();

// For Replit uptime pings
app.get("/", (req, res) => {
  res.send("Bot is running!");
});
app.listen(3000, () => {
  console.log("✅ Express keep-alive server running");
});

// Your Discord bot token here, set via environment variable TOKEN
const TOKEN = process.env.TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.guilds.cache.forEach(async (guild) => {
    const channel = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildText &&
        ch.name.toLowerCase().includes("order"),
    );

    if (!channel)
      return console.log(`❌ No order channel found in ${guild.name}`);

    const embed = {
      title: "🍟 Start Your Order",
      description: "Click the button below to open a private ticket.",
      color: 0x57f287,
    };

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Open Ticket")
        .setStyle(ButtonStyle.Success)
        .setCustomId("open_ticket"),
    );

    const messages = await channel.messages.fetch({ limit: 10 });
    const alreadyPosted = messages.some(
      (m) => m.author.id === client.user.id && m.components.length > 0,
    );
    if (!alreadyPosted) {
      channel.send({ embeds: [embed], components: [row] });
    }
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "open_ticket") {
    try {
      const existing = interaction.guild.channels.cache.find(
        (ch) => ch.name === `ticket-${interaction.user.id}`
      );
      if (existing) {
        await interaction.reply({
          content: "❗ You already have an open ticket.",
          ephemeral: true,
        });
        return;
      }

      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.id}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
            ],
          },
          {
            id: client.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
            ],
          },
        ],
      });

      await interaction.reply({
        content: `✅ Ticket created: ${ticketChannel}`,
        ephemeral: true,
      });

      // Allow permissions to sync properly
      await new Promise((r) => setTimeout(r, 1500));

      const filter = (m) =>
        m.author.id === interaction.user.id && m.channel.id === ticketChannel.id;

      // 1. Ask service
      await ticketChannel.send(
        `<@${interaction.user.id}> Welcome! Would you like to order from **DoorDash**, **Grubhub/JustEat/Lieferando**, **UberEats**, or **Roblox**? For any other services, you must open a support ticket.`
      );
      const collectedService = await ticketChannel.awaitMessages({
        filter,
        max: 1,
        time: 60000,
        errors: ["time"],
      }).catch(() => null);

      if (!collectedService) {
        await ticketChannel.send(
          "You did not specify a service in time. Please try again later or open a new ticket."
        );
        return;
      }

      const service = collectedService.first().content.trim().toLowerCase();
      const allowedServices = [
        "doordash",
        "grubhub",
        "ubereats",
        "roblox",
        "lieferando",
        "amazon",
        "justeat",
        "just eat",
      ];

      if (!allowedServices.includes(service)) {
        await ticketChannel.send(
          "Please open a support ticket for other services. Closing this ticket."
        );
        await new Promise((r) => setTimeout(r, 3000));
        await ticketChannel.delete();
        return;
      }

      // 2. Ask food items
      await ticketChannel.send("Please specify the items you want to order: (in one message)");
      const collectedFood = await ticketChannel.awaitMessages({
        filter,
        max: 1,
        time: 120000,
        errors: ["time"],
      }).catch(() => null);

      if (!collectedFood) {
        await ticketChannel.send(
          "You did not specify any food items in time. Please try again later or open a new ticket."
        );
        return;
      }

      const foodItems = collectedFood.first().content.trim();

      // 3. Ask payment method
      await ticketChannel.send(
        `Thanks! You want: **${foodItems}**. Which Payment method would you like to use? We support Paypal (F&F), Bitcoin, XMR (Monero), Litecoin and other Cryptocurrencies on request (no shitcoins nigga)`
      );
      const collectedPayment = await ticketChannel.awaitMessages({
        filter,
        max: 1,
        time: 60000,
        errors: ["time"],
      }).catch(() => null);

      if (!collectedPayment) {
        await ticketChannel.send(
          "You did not specify a payment method in time. Please try again later or open a new ticket."
        );
        return;
      }

      const paymentMethod = collectedPayment.first().content.trim();

      // Final order summary
      await ticketChannel.send(`Order summary:
- Service: **${service}**
- Food items: **${foodItems}**
- Payment method: **${paymentMethod}**

A staff member will be with you shortly to assist you further. Thanks for your order! <@&1388206255855632476>`);
    } catch (error) {
      console.error("Error creating ticket or handling interaction:", error);
      await interaction.reply({
        content: "❌ Something went wrong. Please try again later.",
        ephemeral: true,
      });
    }
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content.toLowerCase() === "!close") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("❌ You need admin permissions to close tickets.");
    }

    if (!message.channel.name.startsWith("ticket-")) {
      return message.reply("❌ This command can only be used inside a ticket channel.");
    }

    try {
      await message.channel.send("✅ Closing ticket...");
      setTimeout(() => message.channel.delete(), 3000);
    } catch (error) {
      console.error("Error closing ticket channel:", error);
      message.reply("❌ Failed to close the ticket channel.");
    }
  }
});

client.login(TOKEN);
