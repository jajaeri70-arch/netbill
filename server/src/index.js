import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import config from './config.js';
import * as monitoring from './services/monitoring.js';
import { startScheduler } from './jobs/scheduler.js';
import bus from './utils/events.js';

const server = http.createServer(app);
const io = new Server(server, {
  // origin: true mencerminkan origin peminta — mendukung dev (:5173 via proxy),
  // produksi (:3020), dan akses hostname LAN (mis. http://billing.test)
  cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
});

// Realtime: notifikasi baru dikirim ke semua klien
bus.on('notification:new', (notification) => {
  io.emit('notification:new', notification);
});
bus.on('customers:changed', () => io.emit('customers:changed'));

io.on('connection', async (socket) => {
  try {
    socket.emit('monitoring:update', await monitoring.getSnapshot());
  } catch {
    /* abaikan */
  }
});

server.listen(config.port, () => {
  // Hanya jalankan tugas berkala setelah port berhasil dibuka.
  let ticking = false;
  setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await monitoring.tick();
      io.emit('monitoring:update', await monitoring.getSnapshot());
    } catch (err) {
      console.error('[socket] broadcast gagal:', err.message);
    } finally {
      ticking = false;
    }
  }, 5000);
  startScheduler();

  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  NetBill API siap di http://localhost:${config.port}  ║`);
  console.log(`╚══════════════════════════════════════════╝`);
});
