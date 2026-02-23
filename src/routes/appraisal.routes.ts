import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  createAppraisal,
  getAppraisalByUserId,
  updateAppraisal,
  submitAppraisal,
  verifyAppraisal,
  approveAppraisal,
  deleteAppraisal,
  getAllAppraisals,
  getAppraisalsByDepartment,
} from '../handlers/appraisal.handler';

const router = Router();

// All routes require authentication
router.use(authMiddleware());

// GET /appraisal - Get all appraisals (Admin/Director/Dean/HOD)
router.get('/', authMiddleware('admin', 'dean', 'hod') , getAllAppraisals);

// GET /appraisal/department/:department - Get appraisals by department (Dean/HOD)
router.get('/department/:department', getAppraisalsByDepartment);


// POST /appraisal - Create new appraisal
router.post('/', createAppraisal);;


// PATCH /appraisal/:userId/submit - Submit for review (Faculty)
router.patch('/:userId/submit', submitAppraisal);

// PATCH /appraisal/:userId/verify - Verify appraisal (Dean/HOD)
router.patch('/:userId/verify', verifyAppraisal);

// PATCH /appraisal/:userId/approve - Approve appraisal (Director/Dean)
router.patch('/:userId/approve', approveAppraisal);

// GET /appraisal/:userId - Get appraisal by userId (Faculty can view own, Admin/Dean/HOD can view all)
router.get('/:userId', getAppraisalByUserId);

// PUT /appraisal/:userId - Update appraisal (Faculty)
router.put('/:userId', updateAppraisal);

// DELETE /appraisal/:userId - Delete appraisal (Faculty, draft only)
router.delete('/:userId', deleteAppraisal);

export default router;
