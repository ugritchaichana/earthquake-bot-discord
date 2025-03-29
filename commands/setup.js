import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { setChannel } from '../db.js';

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
        await interaction.deferReply({ flags: 64 });
        
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
        if (interaction.deferred) {
          await interaction.editReply({
            content: `❌ Failed to create channel #${channelName}. Please check my permissions and try again.`,
            flags: 64
          });
        } else {
          await interaction.reply({
            content: `❌ Failed to create channel #${channelName}. Please check my permissions and try again.`,
            flags: 64
          });
        }
        return;
      }
    }

    // Save channel to MongoDB
    try {
      await setChannel(
        interaction.guild.id,
        channel.id,
        channel.name,
        interaction.guild.name
      );
      console.log(`[Setup] Channel ${channel.name} (${channel.id}) set for guild ${interaction.guild.name} (${interaction.guild.id})`);
    } catch (error) {
      console.error('[Setup] Error saving channel to database:', error);
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ Failed to save channel configuration. Please try again.',
          flags: 64
        });
      } else {
        await interaction.reply({
          content: '❌ Failed to save channel configuration. Please try again.',
          flags: 64
        });
      }
      return;
    }

    const response = channel.id !== interaction.channelId
      ? `✅ Earthquake alerts will be sent to <#${channel.id}>!`
      : `✅ Earthquake alerts will be sent to this channel!`;
      
    if (interaction.deferred) {
      await interaction.editReply({
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