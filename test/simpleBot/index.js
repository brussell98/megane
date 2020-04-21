const { isMaster } = require('cluster');
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

if (isMaster) {
	// Create event listeners first, otherwise some events might be missed
	sharder.on('error', error => console.error(error));
	sharder.on('debug', message => console.log(message));
	sharder.on('clusterReady', cluster => console.log(`Cluster ${cluster.id} ready`));
	sharder.on('serviceReady', service => console.log(`Service ${service.name} ready`));

	sharder.registerService(__dirname + '/apiService.js', { name: 'json-api' });
}

sharder.spawn();
