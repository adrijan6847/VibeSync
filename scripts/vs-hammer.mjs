import { io } from 'socket.io-client';

const CODE = process.argv[2] || 'RL9C';
const N_PROBES = 16;
const probes = [];

for (let i = 0; i < N_PROBES; i++) {
  const s = io('http://localhost:3000', { transports: ['websocket'] });
  await new Promise((r) => s.on('connect', r));
  const resp = await new Promise((r) => s.emit('session:join', { code: CODE }, r));
  if (!resp.ok) {
    console.error('join failed', resp);
    process.exit(1);
  }
  probes.push(s);
}
console.log('joined with', probes.length, 'probes');

// Listen to ticks on probe 0
probes[0].on('tick', (t) => {
  if (t.phase !== 'building') process.stdout.write(`\n[${t.phase}] energy=${t.energy.toFixed(1)}\n`);
});
probes[0].on('drop', (d) => {
  console.log('DROP event received at', d.dropAt);
});

// 60Hz pump
let n = 0;
const pump = setInterval(() => {
  for (const s of probes) s.emit('session:tap');
  n++;
  if (n % 30 === 0) process.stdout.write('.');
  if (n >= 600) {
    clearInterval(pump);
    console.log('\ndone, keeping sockets alive to observe drop cycle');
    setTimeout(() => {
      for (const s of probes) s.close();
      process.exit(0);
    }, 8000);
  }
}, 16);
