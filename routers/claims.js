const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { body, query, validationResult } = require('express-validator');
const Claim = require('../models/claim');
const User = require('../models/user');
const auth = require('../middlewares/auth');
const uploadReceipt = require('../utils/uploadReceipt');

// Configure multer for file upload
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'), false);
  }
};


const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  },
  fileFilter
});


// @route   GET /api/claims
// @desc    Get all claims (with filters)
// @access  Private
router.get('/', auth.verifyToken, async (req, res) => {
  try {
    const { 
      status, 
      category, 
      startDate, 
      endDate, 
      user_id, 
      page = 1, 
      limit = 20 
    } = req.query;
    
    // Build query
    const query = {};
    
    // Role-based filtering
    if (user_id) {
      query.user_id = user_id;
    }
    
    // Status filter
    if (status) {
      query.status = status.split(',');
    }
    
    // Category filter
    if (category) {
      query.category = category.split(',');
    }
    
    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get claims
    const claims = await Claim.find(query)
      .sort({ date: -1, created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user_id', 'name email employee_id department');
    
    // Get total count for pagination
    const total = await Claim.countDocuments(query);
    
    // Log activity for admin viewing all claims
    if (req.user.role === 'admin') {
      await auth.logActivity(req, 'view', 'claim', 'all', 'Viewed all claims');
    }
    
    res.json({
      success: true,
      data: claims,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Get claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/claims/:id
// @desc    Get single claim
// @access  Private
router.get('/:id', auth.verifyToken, async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.id)
      .populate('user_id', 'name email employee_id department')
      .populate('approved_by', 'name employee_id')
      .populate('rejected_by', 'name employee_id')
      .populate('paid_by', 'name employee_id');
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    
    // Check ownership
    if (req.user.role !== 'admin' && claim.user_id._id.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      data: claim
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/claims
// @desc    Create new claim
// @access  Private (Worker only)
router.post('/', 
  auth.verifyToken,
  auth.checkRole('worker', 'admin'),
  upload.single('image'),
  [
    body('date').isISO8601().withMessage('Valid date is required'),
    body('claim_id').trim().optional(),
    body('expense_description').trim().optional(),
    body('category').trim().optional(),
    body('currency').trim().notEmpty().withMessage('Currency is required'),
    body('company_name').trim().notEmpty().withMessage('Company Name is required'),
    body('bank_transfer_amount').isFloat({ min: 0 }).optional(),
    body('vat_amount').optional(),
    body('cash_amount').optional(),
    body('contact_person').trim().notEmpty().withMessage('Contact Person is required'),
    body('contact_email').isEmail().withMessage('Valid email is required'),
    body('amount').isFloat({ min: 0 }),
    body('reason').optional().trim(),
    body('notes').optional().trim(),
    body('image').optional()
  ],
  async (req, res) => {
  try {
    // Check validation errors

    // Add receipt if uploaded

    
    
    
    const errors = validationResult(req);
    console.log(errors.array())


    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array().forEach(error => error.msg + "in" + error.path)
      });
    }

    
    // Get user details
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Create claim
    const claimData = {
      ...req.body,
      user_id: req.user.userId,
      user_name: user.name,
      employee_id: user.employee_id,
      claim_type: req.body.category,
    };
    
    
    // console.log(claimData)
    
    
    // Add receipt if uploaded
    if (req.file) {
      const receipt = await uploadReceipt(req.file, req.user.userId);

      claimData.receipt_filename = receipt.filename;
      claimData.receipt_url = receipt.publicUrl;
    }

    
    // Set initial status
    claimData.status = 'new';
    
    const claim = new Claim(claimData);
    await claim.save();
    
    // Log activity
    await auth.logActivity(req, 'create', 'claim', claim._id.toString(), 
      `Created claim ${claim.claim_id} for ${claim.amount} ${claim.currency}`);
    
    res.status(201).json({
      success: true,
      data: claim,
      message: 'Claim submitted successfully'
    });
    
  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/claims/:id
// @desc    Update claim
// @access  Private
router.put('/:id', auth.verifyToken, upload.single('image'), async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.id);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    
    // Check ownership and status
    if (req.user.role !== 'admin' || claim.user_id.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Only allow updates for new or pending claims
    if (!['new', 'pending', 'verified'].includes(claim.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update claim in current status'
      });
    }
    
    // Update fields
    if (req.body.description) claim.description = req.body.description;
    if (req.body.category) claim.category = req.body.category;
    if (req.body.amount) claim.amount = req.body.amount;
    if (req.body.notes !== undefined) claim.notes = req.body.notes;
    
    // Update receipt if uploaded
    if (req.file) {
      const receipt = await uploadReceipt(req.file, req.user.userId);

      claim.receipt_filename = receipt.filename;
      claim.receipt_url = receipt.publicUrl;
    }

    
    // Reset status if amount changed significantly
    if (req.body.amount && req.body.amount > 1000 && claim.status === 'new') {
      claim.status = 'pending';
    }
    
    await claim.save();
    
    // Log activity
    await auth.logActivity(req, 'update', 'claim', claim._id.toString(), 
      `Updated claim ${claim.claim_id}`);
    
    res.json({
      success: true,
      data: claim,
      message: 'Claim updated successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/claims/:id/status
// @desc    Change claim status
// @access  Private (Admin)
router.put('/:id/status', 
  auth.verifyToken,
  auth.checkRole('admin', 'financial officer', 'accountant', 'administrator'),
  [
    body('notes').optional().trim(),
    body('status').isIn(['approved', 'rejected', 'paid', 'pending']).withMessage('Invalid status')
  ],
  async (req, res) => {

    const { status, notes } = req.body;
  try {

    const claim = await Claim.findById(req.params.id);

    console.log(status)
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    if (claim.status.toLocaleLowerCase() === status.toLocaleLowerCase()) {
      return res.status(400).json({
        success: false,
        message: `Claim is already ${status}`
      });
    }             

        
    
    
    // Update claim
    claim.status = status;
    claim.approved_by = req.user.userId;
    claim.approved_at = new Date();
    if (req.body.notes) claim.notesByAdmin = notes;
    
    await claim.save();
    
    // Log activity
    await auth.logActivity(req, 'approve', 'claim', claim._id.toString(), 
      `Approved claim ${claim.claim_id} for ${claim.amount} ${claim.currency}`);
    
    res.json({
      success: true,
      data: claim,
      message: `Claim successfully changed to ${status.toUpperCase()}`
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
    console.log(error)
  }
});

// @route   PUT /api/claims/:id/reject
// @desc    Reject a claim
// @access  Private (Admin/Approver only)
// router.put('/:id/reject', 
//   auth.verifyToken,
//   auth.checkRole('admin', 'approver'),
//   [
//     body('reason').trim().notEmpty().withMessage('Rejection reason is required')
//   ],
//   async (req, res) => {
//   try {
//     // Check validation errors
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({
//         success: false,
//         errors: errors.array()
//       });
//     }
    
//     const claim = await Claim.findById(req.params.id);
    
//     if (!claim) {
//       return res.status(404).json({
//         success: false,
//         message: 'Claim not found'
//       });
//     }
    
//     // Check if claim can be rejected
//     if (!['new', 'pending', 'recommendation'].includes(claim.status)) {
//       return res.status(400).json({
//         success: false,
//         message: `Claim cannot be rejected in ${claim.status} status`
//       });
//     }
    
//     // Update claim
//     claim.status = 'rejected';
//     claim.rejected_by = req.user.userId;
//     claim.rejected_at = new Date();
//     claim.rejection_reason = req.body.reason;
    
//     await claim.save();
    
//     // Log activity
//     await auth.logActivity(req, 'reject', 'claim', claim._id.toString(), 
//       `Rejected claim ${claim.claim_id}: ${req.body.reason}`);
    
//     res.json({
//       success: true,
//       data: claim,
//       message: 'Claim rejected successfully'
//     });
    
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// });

// @route   PUT /api/claims/:id/recommend
// @desc    Add recommendation to a claim
// @access  Private (Admin/Approver only)
// router.put('/:id/recommend', 
//   auth.verifyToken,
//   auth.checkRole('admin', 'approver'),
//   [
//     body('recommendation').trim().notEmpty().withMessage('Recommendation is required')
//   ],
//   async (req, res) => {
//   try {
//     // Check validation errors
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({
//         success: false,
//         errors: errors.array()
//       });
//     }
    
//     const claim = await Claim.findById(req.params.id);
    
//     if (!claim) {
//       return res.status(404).json({
//         success: false,
//         message: 'Claim not found'
//       });
//     }
    
//     // Update claim
//     claim.status = 'recommendation';
//     claim.recommendation = req.body.recommendation;
//     claim.recommendation_by = req.user.userId;
//     claim.recommendation_at = new Date();
    
//     await claim.save();
    
//     // Log activity
//     await auth.logActivity(req, 'update', 'claim', claim._id.toString(), 
//       `Added recommendation to claim ${claim.claim_id}`);
    
//     res.json({
//       success: true,
//       data: claim,
//       message: 'Recommendation added successfully'
//     });
    
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// });



// @route   DELETE /api/claims/:id
// @desc    Delete a claim
// @access  Private


router.delete('/:id/delete', auth.verifyToken, async (req, res) => {
  try {
    const claim = await Claim.findById(req.params.id);
    
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    
    // Check ownership
    if (claim.user_id.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    console.log(claim.status)
    // Only allow deletion for new claims
    if (claim.status !== 'new' && 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only new claims can be deleted'
      });
    }
    
    await claim.deleteOne();
    
    // Log activity
    await auth.logActivity(req, 'delete', 'claim', claim._id.toString(), 
      `Deleted claim ${claim.claim_id}`);
    
    res.json({
      success: true,
      message: 'Claim deleted successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/claims/stats
// @desc    Get claim statistics
// @access  Private
router.get('/stats', auth.verifyToken, async (req, res) => {
  try {
    let matchQuery = {};
    
    // Role-based filtering
    if (req.user.role !== 'admin') {
      matchQuery.user_id = req.user.userId;
    }
    
    // Date range (last 30 days by default)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    matchQuery.created_at = { $gte: thirtyDaysAgo };
    
    const stats = await Claim.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          total_amount: { $sum: '$amount' },
          new: {
            $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] }
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          approved: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
          },
          rejected: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
          },
          paid: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
          },
          recommendation: {
            $sum: { $cond: [{ $eq: ['$status', 'recommendation'] }, 1, 0] }
          }
        }
      }
    ]);
    
    // Format response
    const result = stats[0] || {
      total: 0,
      total_amount: 0,
      new: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      paid: 0,
      recommendation: 0
    };
    
    // Get top categories for admin
    let categories = [];
    if (req.user.role === 'admin') {
      categories = await Claim.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            amount: { $sum: '$amount' }
          }
        },
        { $sort: { amount: -1 } },
        { $limit: 5 }
      ]);
    }
    
    res.json({
      success: true,
      data: {
        ...result,
        categories
      }
    });
    
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;