const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/user');
const auth = require('../middlewares/auth');

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { username, password } = req.body;
    
    // SPECIAL HANDLING FOR ADMIN LOGIN
    // If username is 'admin' and password is 'Admin@123'
    if (username.toLowerCase() === 'admin' && password === 'Admin@123') {
      // Find or create admin user
      let adminUser = await User.findOne({ email: 'admin@hfa-uk.com' });
      
      if (!adminUser) {
        // Create admin user if doesn't exist
        const adminPassword = await bcrypt.hash('Admin@123', 10);
        adminUser = new User({
          employee_id: 'HFA-ADMIN-001',
          name: 'Administrator',
          email: 'admin@hfa-uk.com',
          password: adminPassword,
          role: 'admin',
          department: 'Administration',
          phone: '07123 456789',
          status: 'active'
        });
        await adminUser.save();
      }
      
      // Check password
      const isPasswordValid = await adminUser.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      
      // Update last login
      adminUser.last_login = new Date();
      await adminUser.save();
      
      // Generate tokens
      const token = jwt.sign(
        {
          userId: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          employee_id: adminUser.employee_id
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '24h' }
      );
      
      const refreshToken = jwt.sign(
        { userId: adminUser._id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
      );
      
      // Log activity
      await auth.logActivity(req, 'login', 'user', adminUser._id.toString(), 'Admin logged in');
      
      return res.json({
        success: true,
        data: {
          user: {
            id: adminUser._id,
            name: adminUser.name,
            email: adminUser.email,
            role: adminUser.role,
            employee_id: adminUser.employee_id,
            department: adminUser.department,
            phone: adminUser.phone
          },
          token,
          refresh_token: refreshToken
        }
      });
    }
    
    // REGULAR USER LOGIN (existing code)
    // Find user by email or employee_id
    const user = await User.findOne({
      $or: [
        { email: username.toLowerCase() },
        { employee_id: username.toUpperCase() }
      ]
    });



    
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active. Please contact administrator.'
      });
    }
    
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect Password credentials'
      });
    }
    
    // Update last login
    user.last_login = new Date();
    await user.save();
    
    // Generate tokens
    const token = jwt.sign(
      {
        userId: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employee_id: user.employee_id
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );
    
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
    );
    
    // Log activity
    await auth.logActivity(req, 'login', 'user', user._id.toString(), 'User logged in');
    
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          employee_id: user.employee_id,
          department: user.department,
          phone: user.phone
        },
        token,
        refresh_token: refreshToken
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public (with refresh token)
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    
    // Find user
    const user = await User.findById(decoded.userId);
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }
    
    // Generate new access token
    const token = jwt.sign(
      {
        userId: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employee_id: user.employee_id
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );
    
    res.json({
      success: true,
      data: {
        token
      }
    });
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', auth.verifyToken, async (req, res) => {
  try {
    // Log activity
    await auth.logActivity(req, 'logout', 'user', req.user.userId, 'User logged out');
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', auth.verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: user
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/auth/change-password
// @desc    Change user password
// @access  Private
router.post('/change-password', auth.verifyToken, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.userId);
    
    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    // Log activity
    await auth.logActivity(req, 'update', 'user', user._id.toString(), 'Password changed');
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;