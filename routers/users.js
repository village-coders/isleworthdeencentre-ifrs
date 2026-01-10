const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/user');
const auth = require('../middlewares/auth');

// @route   GET /api/users
// @desc    Get all users
// @access  Private (Admin only)
router.get('/', auth.verifyToken, auth.checkRole('admin'), async (req, res) => {
  try {
    const { role, department, status, page = 1, limit = 20 } = req.query;
    
    // Build query
    const query = {};
    if (role) query.role = role;
    if (department) query.department = department;
    if (status) query.status = status;
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(query)
      .select('-password')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    // Log activity
    await auth.logActivity(req, 'view', 'user', 'all', 'Viewed all users');
    
    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get single user
// @access  Private (Admin or self)
router.get('/:id', auth.verifyToken, async (req, res) => {
  try {
    // Check if user is requesting their own data or is admin
    if (req.user.role !== 'admin' && req.user.userId !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const user = await User.findById(req.params.id).select('-password');
    
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

// @route   POST /api/users
// @desc    Create new user
// @access  Private (Admin only)
router.post('/', 
  auth.verifyToken,
  auth.checkRole('admin'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['admin', 'worker', 'manager', 'approver']).withMessage('Invalid role'),
    body('department').trim().notEmpty().withMessage('Department is required'),
    body('phone').optional().trim(),
    body('employee_id').optional().trim()
  ],
  async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    // Check if email already exists
    const existingEmail = await User.findOne({ email: req.body.email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    // Generate employee ID if not provided
    if (!req.body.employee_id) {
      req.body.employee_id = await User.generateEmployeeId();
    } else {
      // Check if employee ID already exists
      const existingId = await User.findOne({ employee_id: req.body.employee_id.toUpperCase() });
      if (existingId) {
        return res.status(400).json({
          success: false,
          message: 'Employee ID already exists'
        });
      }
    }
    
    // Create user
    const userData = {
      name: req.body.name,
      email: req.body.email.toLowerCase(),
      password: req.body.password,
      role: req.body.role,
      department: req.body.department,
      employee_id: req.body.employee_id.toUpperCase(),
      phone: req.body.phone,
      status: req.body.status || 'active'
    };
    
    const user = new User(userData);
    await user.save();
    
    // Remove password from response
    const userResponse = user.toJSON();
    
    // Log activity
    await auth.logActivity(req, 'create', 'user', user._id.toString(), 
      `Created user ${user.employee_id} with role ${user.role}`);
    
    res.status(201).json({
      success: true,
      data: userResponse,
      message: 'User created successfully'
    });
    
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private (Admin only or self for profile)
router.put('/:id', 
  auth.verifyToken,
  [
    body('name').optional().trim(),
    body('email').optional().isEmail(),
    body('phone').optional().trim(),
    body('department').optional().trim(),
    body('role').optional().isIn(['admin', 'worker', 'manager', 'approver']),
    body('status').optional().isIn(['active', 'inactive', 'suspended'])
  ],
  async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check permissions
    const isSelf = req.user.userId === req.params.id;
    const isAdmin = req.user.role === 'admin';
    
    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Regular users can only update their own profile fields
    if (!isAdmin) {
      // Filter out admin-only fields
      delete req.body.role;
      delete req.body.status;
      delete req.body.employee_id;
    }
    
    // Check if new email already exists
    if (req.body.email && req.body.email !== user.email) {
      const existingEmail = await User.findOne({ 
        email: req.body.email.toLowerCase(),
        _id: { $ne: user._id }
      });
      
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        });
      }
      user.email = req.body.email.toLowerCase();
    }
    
    // Update allowed fields
    if (req.body.name) user.name = req.body.name;
    if (req.body.phone !== undefined) user.phone = req.body.phone;
    if (req.body.department) user.department = req.body.department;
    if (req.body.role && isAdmin) user.role = req.body.role;
    if (req.body.status && isAdmin) user.status = req.body.status;
    
    await user.save();
    
    // Remove password from response
    const userResponse = user.toJSON();
    
    // Log activity
    const action = isSelf ? 'update' : 'admin_update';
    await auth.logActivity(req, action, 'user', user._id.toString(), 
      `Updated user ${user.employee_id}`);
    
    res.json({
      success: true,
      data: userResponse,
      message: 'User updated successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   put /api/users/:id/deactivate
// @desc    update user (soft delete by changing status)
// @access  Private (Admin only)
router.put('/:id/status', auth.verifyToken, auth.checkRole('admin'), async (req, res) => {
  const { status } = req.body;
  try {

    if(!status){
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Prevent deleting own account
    if (user._id.toString() === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }
    
    // Soft deactivate by changing status
    

    user.status = status;
    await user.save();
    
    // Log activity
    await auth.logActivity(req, 'delete', 'user', user._id.toString(), 
      `Deactivated user ${user.employee_id}`);
    
    res.json({
      success: true,
      message: `User status updated to ${status} successfully`
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});


// @route   DELETE /api/users/:id/delete
// @desc    Delete user (Delete permanently)
// @access  Private (Admin only)
router.delete('/:id/delete', auth.verifyToken, auth.checkRole('admin'), async (req, res) => {
  try {

    const user = await User.findById(req.params.id);
    

    // Prevent deleting own account
    if (user._id.toString() === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const deleteUser = await User.findByIdAndDelete(req.params.id);
    
    if (!deleteUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    
    
    
    // Log activity
    await auth.logActivity(req, 'delete', 'user', user._id.toString(), 
      `Deleted user ${user.employee_id}`);
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;