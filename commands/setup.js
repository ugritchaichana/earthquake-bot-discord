const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { setChannel } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set earthquake alert channel')
    .addStringOption(option =>
      option.setName('channel')
        .setDescription('Text channel name for earthquake alerts')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Region to focus for earthquake alerts')
        .setRequired(false)
        .addChoices(
          { name: 'Global', value: 'global' },
          { name: 'Thailand Region', value: 'thailand' },
          { name: 'Southeast Asia', value: 'sea' },
          { name: 'Asia', value: 'asia' }
        )),

  async execute(interaction) {
    const channelName = interaction.options.getString('channel');
    const focusRegion = interaction.options.getString('region') || 'global'; // ดึงค่า region ที่เลือก หรือใช้ค่าเริ่มต้นเป็น global
    
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
      const result = await setChannel(
        interaction.guild.id,
        channel.id,
        channel.name,
        interaction.guild.name,
        focusRegion
      );
      
      if (result === false) {
        console.log(`[Setup] Channel ${channel.name} (${channel.id}) data has been stored for future saving when MongoDB connection is restored`);
        
        if (interaction.deferred) {
          await interaction.editReply({
            content: `✅ Earthquake alerts will be sent to <#${channel.id}>!\nFocus region: **${focusRegion.charAt(0).toUpperCase() + focusRegion.slice(1)}**\n⚠️ Note: Your configuration will be stored when database connection is restored.`,
            flags: 64
          });
        } else {
          await interaction.reply({
            content: `✅ Earthquake alerts will be sent to <#${channel.id}>!\nFocus region: **${focusRegion.charAt(0).toUpperCase() + focusRegion.slice(1)}**\n⚠️ Note: Your configuration will be stored when database connection is restored.`,
            flags: 64
          });
        }
        return;
      }
      
      console.log(`[Setup] Channel ${channel.name} (${channel.id}) set for guild ${interaction.guild.name} (${interaction.guild.id}) with focus region: ${focusRegion}`);
    } catch (error) {
      console.error('[Setup] Error saving channel to database:', error);
      if (interaction.deferred) {
        await interaction.editReply({
          content: `✅ Earthquake alerts will be sent to <#${channel.id}>!\n⚠️ Note: There was an issue saving to the database, but your configuration will be stored when connection is restored.`,
          flags: 64
        });
      } else {
        await interaction.reply({
          content: `✅ Earthquake alerts will be sent to <#${channel.id}>!\n⚠️ Note: There was an issue saving to the database, but your configuration will be stored when connection is restored.`,
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