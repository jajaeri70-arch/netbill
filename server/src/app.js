import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { authenticate, canFinance } from './middleware/auth.js';

import authRoutes from './routes/auth.js';
import portalRoutes from './routes/portal.js';
import dashboardRoutes from './routes/dashboard.js';
import customerRoutes from './routes/customers.js';
import packageRoutes from './routes/packages.js';
import invoiceRoutes from './routes/invoices.js';
import paymentRoutes from './routes/payments.js';
import transactionRoutes from './routes/transactions.js';
import categoryRoutes from './routes/categories.js';
import reportRoutes from './routes/reports.js';
import userRoutes from './routes/users.js';
import routerRoutes from './routes/routers.js';
import monitoringRoutes from './routes/monitoring.js';
import deviceRoutes from './routes/devices.js';
import ticketRoutes from './routes/tickets.js';
import activityRoutes from './routes/activity.js';
import notificationRoutes from './routes/notifications.js';
import settingRoutes from './routes/settings.js';
import uploadRoutes from './routes/uploads.js';
import wilayahRoutes from './routes/wilayah.js';
import areaRoutes from './routes/areas.js';
import bankRoutes from './routes/banks.js';
import mappingRoutes from './routes/mapping.js';
import mobileRoutes from './routes/mobile.js';
import messageRoutes from './routes/messages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(config.uploadDir));

// Rute publik
app.use('/api/auth', authRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/mobile/v1', mobileRoutes);
// Rute terproteksi
app.use('/api', authenticate);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', canFinance, paymentRoutes);
app.use('/api/transactions', canFinance, transactionRoutes);
app.use('/api/transaction-categories', canFinance, categoryRoutes);
app.use('/api/reports', canFinance, reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/routers', routerRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/wilayah', wilayahRoutes);
app.use('/api/areas', areaRoutes);
app.use('/api/banks', canFinance, bankRoutes);
app.use('/api/mapping', mappingRoutes);
app.use('/api/messages', messageRoutes);

// 404 API
app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint tidak ditemukan' }));

// Serve frontend hasil build React (mode produksi)
const dist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({ message: err.message || 'Kesalahan server internal' });
});

export default app;
