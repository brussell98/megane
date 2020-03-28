const assert = require('assert').strict;
const { ShardManager, Util } = require('../../dist');

require('dotenv').config();

const sharder = new ShardManager({
	path: __dirname + '/bot.js',
	token: process.env.TOKEN,
	clientOptions: {
		disableEvents: {
			TYPING_START: true,
			VOICE_STATE_UPDATE: true
		},
		getAllUsers: true,
		messageLimit: 0,
		defaultImageFormat: 'png',
		defaultImageSize: '256'
	}
});

sharder.spawn();

sharder.on('error', error => console.error(error));
sharder.on('debug', message => console.log(message));
sharder.on('ready', async cluster => {
	console.log(`Cluster ${cluster.id} ready`);
});
