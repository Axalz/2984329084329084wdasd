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

// Your Discord bot token here:
const TOKEN = process.env.TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

// When bot is ready
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Send the embed with button once per server
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

    // Prevent duplicate message by checking last 10 messages
    const messages = await channel.messages.fetch({ limit: 10 });
    const alreadyPosted = messages.some(
      (m) => m.author.id === client.user.id && m.components.length > 0,
    );
    if (!alreadyPosted) {
      channel.send({ embeds: [embed], components: [row] });
    }
  });
});

// Handle button interaction
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "open_ticket") {
    try {
      const existing = interaction.guild.channels.cache.find(
        (ch) => ch.name === `ticket-${interaction.user.id}`,
      );
      if (existing) {
        await interaction.reply({
          content: "❗ You already have an open ticket.",
          ephemeral: true,
        });
        return;
      }

      // Create private ticket channel
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

      // Start conversation and ask for delivery service
      await ticketChannel.send(
        `<@${interaction.user.id}> Welcome! Would you like to order from **DoorDash**, **Grubhub/JustEat/Lieferando**, **UberEats**, or **Roblox**? For any other services, you must open a support ticket.`,
      );

      const filter = (m) => m.author.id === interaction.user.id;

      const serviceCollector = ticketChannel.createMessageCollector({
        filter,
        max: 1,
        time: 60000,
      });

      serviceCollector.on("collect", async (serviceMsg) => {
        try {
          const service = serviceMsg.content.trim();
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

          if (!allowedServices.includes(service.toLowerCase())) {
            await ticketChannel.send(
              "Please open a support ticket for other services. Closing this ticket.",
            );

            await new Promise((resolve) => setTimeout(resolve, 3000));

            await ticketChannel.delete();
            return;
          }

          const foodCollector = ticketChannel.createMessageCollector({
            filter,
            max: 1,
            time: 120000,
          });

          foodCollector.on("collect", async (foodMsg) => {
            try {
              const foodItems = foodMsg.content.trim();

              await ticketChannel.send(
                `Thanks! You want: **${foodItems}**. Which Payment method would you like to use? We support Paypal (F&F), Bitcoin, XMR (Monero), Litecoin and other Cryptocurrencies on request (no shitcoins nigga)`,
              );

              const paymentCollector = ticketChannel.createMessageCollector({
                filter,
                max: 1,
                time: 60000,
              });

              paymentCollector.on("collect", async (paymentMsg) => {
                try {
                  const paymentMethod = paymentMsg.content.trim();

                  await ticketChannel.send(`Order summary:
- Service: **${service}**
- Food items: **${foodItems}**
- Payment method: **${paymentMethod}**

A staff member will be with you shortly to assist you further. Thanks for your order! <@&1388206255855632476>`);
                } catch (err) {
                  console.error("Error during payment collection:", err);
                }
              });

              paymentCollector.on("end", async (collected) => {
                if (collected.size === 0) {
                  await ticketChannel.send(
                    "You did not specify a payment method in time. Please try again later or open a new ticket.",
                  );
                }
              });
            } catch (err) {
              console.error("Error during food collection:", err);
            }
          });

          foodCollector.on("end", async (collected) => {
            if (collected.size === 0) {
              await ticketChannel.send(
                "You did not specify any food items in time. Please try again later or open a new ticket.",
              );
            }
          });
        } catch (err) {
          console.error("Error during service collection:", err);
        }
      });

      serviceCollector.on("end", async (collected) => {
        if (collected.size === 0) {
          await ticketChannel.send(
            "You did not specify a service in time. Please try again later or open a new ticket.",
          );
        }
      });
    } catch (error) {
      console.error("Error creating ticket or handling interaction:", error);
      await interaction.reply({
        content: "❌ Something went wrong. Please try again later.",
        ephemeral: true,
      });
    }
  }
});

// ** New part: Handle !close command **
client.on("messageCreate", async (message) => {
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  if (message.content.toLowerCase() === "!close") {
    // Check admin permission
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply("❌ You need admin permissions to close tickets.");
    }

    // Only allow closing channels named like ticket-USERID
    if (!message.channel.name.startsWith("ticket-")) {
      return message.reply(
        "❌ This command can only be used inside a ticket channel.",
      );
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

// Log in
client.login(TOKEN);
