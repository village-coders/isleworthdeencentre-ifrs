const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const morgan = require("morgan")



// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routers/auth');
const userRoutes = require('./routers/users');
const claimRoutes = require('./routers/claims');
const reportRoutes = require('./routers/reports');

// Import middleware
const errorHandler = require('./middlewares/errorHandler');

// Initialize express app
const app = express();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Security middleware
app.use(helmet());
app.use(compression());

// Console logs
app.use(morgan("dev"))

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
};


app.use(cors({
  origin: "*"
}));

app.set('trust proxy', 1)


// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Database connection
mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_URI_PROD, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/reports', reportRoutes);

// Serve frontend HTML (for demo/testing)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>HFA UK Claims API</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: #003366; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .endpoint { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .method { display: inline-block; padding: 5px 10px; border-radius: 3px; color: white; margin-right: 10px; }
        .get { background: #61affe; }
        .post { background: #49cc90; }
        .put { background: #fca130; }
        .delete { background: #f93e3e; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>HFA UK Claims Management System API</h1>
        <p>Backend server is running. Use the endpoints below to interact with the system.</p>
      </div>
      
      <h2>API Endpoints</h2>
      
      <div class="endpoint">
        <span class="method post">POST</span>
        <strong>/api/auth/login</strong> - User authentication
      </div>
      
      <div class="endpoint">
        <span class="method post">POST</span>
        <strong>/api/auth/logout</strong> - User logout
      </div>
      
      <div class="endpoint">
        <span class="method post">POST</span>
        <strong>/api/auth/refresh</strong> - Refresh access token
      </div>
      
      <div class="endpoint">
        <span class="method get">GET</span>
        <strong>/api/users</strong> - Get all users (admin only)
      </div>
      
      <div class="endpoint">
        <span class="method get">GET</span>
        <strong>/api/claims</strong> - Get claims (filtered by role)
      </div>
      
      <div class="endpoint">
        <span class="method post">POST</span>
        <strong>/api/claims</strong> - Create new claim
      </div>
      
      <div class="endpoint">
        <span class="method get">GET</span>
        <strong>/api/reports/summary</strong> - Get system summary
      </div>
      
      <p>For detailed API documentation, check the routes files.</p>
    </body>
    </html>
  `);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.url}`
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

module.exports = app;