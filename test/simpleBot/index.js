const { isMaster } = require('cluster');
const { ShardManager, Util } = require('../../dist');
const { inspect } = require('util');

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
	sharder.on('statsUpdated', stats => console.log(inspect(stats, null, null)));
	sharder.on('clusterReady', cluster => console.log(`Cluster ${cluster.id} ready`));
	sharder.on('serviceReady', service => console.log(`Service ${service.name} ready`));
	sharder.on('allClustersReady', () => console.log('All clusters ready'));

	sharder.registerService(__dirname + '/apiService.js', { name: 'json-api' });

	setTimeout(async () => {
		try {
			console.log(await sharder.ipc.fetchGuild('360620343729061908'));
			console.log(await sharder.ipc.fetchChannel('374769149429284864'));
			console.log(await sharder.ipc.fetchUser('95286900801146880'));
			console.log(await sharder.ipc.fetchUsers(['95286900801146880', '191489507680452609']));
		} catch (error) {
			console.error(error);
		}
	}, 10e3);

	setTimeout(() => sharder.restartAll(), 30e3);
	setTimeout(() => sharder.services.get('json-api').respawn(), 45e3);
}

sharder.spawn();
