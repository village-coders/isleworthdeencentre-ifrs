const express = require("express")
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const errorHandler = require("./middlewares/errorHandler");
const claimRouter = require("./routers/claimRouters");
const authRouter = require("./routers/authRouters");
require('dotenv').config();


const app = express()

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.set('trust proxy', 1)


// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

app.use(express.json())
app.use(express.urlencoded({ extended: true}))


app.use(morgan('dev'));

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT

app.listen(PORT, ()=> {
    console.log(`Server running on port ${PORT} `);
})

app.use("/api/auth", authRouter)
app.use("/api/claim", claimRouter)
app.use(errorHandler)




