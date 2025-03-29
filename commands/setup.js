import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set earthquake alert channel')
    .addStringOption(option =>
      option.setName('channel')
        .setDescription('Text channel name for earthquake alerts')
        .setRequired(true)),

  async execute(interaction) {
    const channelName = interaction.options.getString('channel');
    let channel = interaction.guild.channels.cache.find(
      ch => ch.name === channelName && ch.isTextBased()
    );
    
    // If channel doesn't exist, create it
    if (!channel) {
      try {
        await interaction.deferReply({ flags: 64 }); // 64 is ephemeral flag
        
        channel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              allow: [PermissionFlagsBits.ViewChannel],
            },
          ],
          reason: 'Created for earthquake alert notifications'
        });
        
        await interaction.editReply({
          content: `✅ Channel #${channelName} didn't exist, so I created it for you!`,
          flags: 64
        });
      } catch (error) {
        console.error('Error creating channel:', error);
        return interaction.editReply({
          content: `❌ Failed to create channel #${channelName}. Please check my permissions and try again.`,
          flags: 64
        });
      }
    }

    const dbPath = path.join(path.dirname(__dirname), 'channels.json');
    let channels = {};

    try {
      const data = fs.readFileSync(dbPath, 'utf8');
      channels = JSON.parse(data);
    } catch (err) {
      // File doesn't exist yet
    }

    channels[interaction.guild.id] = channel.id;
    fs.writeFileSync(dbPath, JSON.stringify(channels, null, 2));

    const response = channel.id !== interaction.channelId
      ? `✅ Earthquake alerts will be sent to <#${channel.id}>!`
      : `✅ Earthquake alerts will be sent to this channel!`;
      
    if (interaction.deferred) {
      await interaction.followUp({
        content: response,
        flags: 64
      });
    } else {
      await interaction.reply({
        content: response,
        flags: 64
      });
    }
  }
};