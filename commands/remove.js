const { SlashCommandBuilder } = require('discord.js');
const { removeChannel } = require('../db.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove earthquake alert channel'),

  async execute(interaction) {
    try {
      const result = await removeChannel(interaction.guild.id);
      
      if (result === false) {
        console.log(`[Remove] Channel removal for guild ${interaction.guild.name} (${interaction.guild.id}) has been queued for when MongoDB connection is restored`);
        
        await interaction.reply({
          content: '✅ Earthquake alerts have been removed from this server.\n⚠️ Note: This change will be saved when database connection is restored.',
          flags: 64
        });
        return;
      }
      
      console.log(`[Remove] Channel removed for guild ${interaction.guild.name} (${interaction.guild.id})`);
      
      await interaction.reply({
        content: '✅ Earthquake alerts have been removed from this server.',
        flags: 64
      });
    } catch (error) {
      console.error('[Remove] Error removing channel:', error);
      await interaction.reply({
        content: '✅ Earthquake alerts have been removed from this server.\n⚠️ Note: There was an issue updating the database, but your request will be processed when connection is restored.',
        flags: 64
      });
    }
  }
};