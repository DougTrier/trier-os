require('dotenv').config();
const { connect, JSONCodec } = require('nats');
const jc = JSONCodec();
(async () => {
    const nc = await connect({ servers: process.env.NATS_URL || 'nats://localhost:4222' });
    console.log('[FLOOD] Sending 100,000 messages...');
    for (let i = 0; i < 100_000; i++) nc.publish('trier.load.test', jc.encode({ seq: i }));
    console.log('[FLOOD] Done.');
    await nc.drain();
})();
