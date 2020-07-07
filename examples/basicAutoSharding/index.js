const assert = require('assert').strict;
const { ShardManager, Util } = require('../../dist');

require('dotenv').config();

const sharder = new ShardManager({
	path: __dirname + '/worker.js',
	token: process.env.TOKEN
});

sharder.spawn();

sharder.on('error', error => console.error(error));
sharder.on('debug', message => console.log(message));
sharder.on('clusterReady', async cluster => {
	console.log(`Cluster ${cluster.id} ready`);

	runTests();
});

// TODO: Service tests (command from cluster and master, getting ready, running eval)

let once = false;
async function runTests() {
	if (once)
		return;

	once = true;

	try {
		await Util.sleep(2000);
		await testMasterEval();
		await Util.sleep(2000);
		await testRespawn();
	} catch (error) {
		console.error(error);
	}
}

async function testMasterEval() {
	console.log('Testing eval on cluster from master');
	const result = await sharder.ipc.sendEval('this.id', 0);
	console.log('> Result of eval(this.id) on cluster 0:', result);
	assert.equal(result, 0);
	return;
}

async function testRespawn() {
	console.log('Testing respawnAll');
	await sharder.restartAll();
	assert.equal(sharder.clusters.get(0).ready, true);
	assert.equal(sharder.clusters.get(0).worker.id, 2);
	return;
}
