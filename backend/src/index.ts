import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { prisma } from './lib/prisma';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Route Imports
import siteSettingRoutes from './routes/siteSetting.routes';
import authRoutes from './routes/auth.routes';
import masterRoutes from './routes/master.routes';
import transactionRoutes from './routes/transaction.routes';
import financeRoutes from './routes/finance.routes';
import backupRoutes from './routes/backup.routes';
import clinicalRoutes from './routes/clinical.routes';
import publicRoutes from './routes/public.routes';
import pharmacyRoutes from './routes/pharmacy.routes';
import inventoryRoutes from './routes/inventory.routes';
import accountingRoutes from './routes/accounting.routes'
import inventoryLedgerRoutes from './routes/inventoryLedger.routes';
import dashboardRoutes from './routes/dashboard.routes';
import systemRoutes from './routes/system.routes';
import labRoutes from './routes/lab.routes';
import reportRoutes from './routes/report.routes';
import directPurchaseRoutes from './routes/directPurchase.routes';

// Load environment variables
dotenv.config();

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Apache)
const PORT = process.env.PORT || 5000;
const httpServer = createServer(app);

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Adjust for production
    methods: ["GET", "POST"]
  }
});

// Make io accessible to routers/controllers
app.set('io', io);

// Socket Handlers
io.on('connection', (socket) => {
  console.log(`[Socket] User connected: ${socket.id}`);
  
  socket.on('join-clinic', (clinicId: string) => {
    if (clinicId) {
      socket.join(`clinic:${clinicId}`);
      console.log(`[Socket] User joined clinic room: clinic:${clinicId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] User disconnected: ${socket.id}`);
  });
});

// Middleware
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3004'
app.use(cors({
  origin: [FRONTEND_URL, 'https://yasfina-app.com', 'http://localhost:3000', 'http://127.0.0.1:3004'],
  credentials: true, // Required for cookies to be sent cross-origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-clinic-id'],
}));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[Response] ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`);
  });
  console.log(`[Request] ${req.method} ${req.url}`);
  next();
});

// Serve static files - Use process.cwd() to consistently find public folder from root
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

// Routes
app.use('/api/settings', siteSettingRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/clinical', clinicalRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/accounting', accountingRoutes)
app.use('/api/inventory-ledger', inventoryLedgerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/direct-purchases', directPurchaseRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running', socketConnected: io.sockets.adapter.rooms.size });
});

app.get('/api/test-route', (req, res) => {
  res.json({ message: 'Test route is working' });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Error]', err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ 
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : undefined
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});
