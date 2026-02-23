import { Request, Response } from 'express';
import { FacultyAppraisal } from '../models/detailedAppraisal';
import { User } from '../models/user';
import { sendSuccess, sendError, HttpStatus } from '../utils/response';
import { AppraisalStatus } from '../constant';

/**
 * Create a new appraisal
 */
export const createAppraisal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;

    if (!userId) {
      sendError(res, 'userId is required', HttpStatus.BAD_REQUEST);
      return;
    }

    // Check if user exists
    const user = await User.findOne({ userId, status: 'active' });
    if (!user) {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

    // Check if appraisal already exists for this user
    const existingAppraisal = await FacultyAppraisal.findOne({ userId });
    if (existingAppraisal) {
      sendError(res, 'Appraisal already exists for this user', HttpStatus.CONFLICT);
      return;
    }

    // Create new appraisal with faculty info pre-filled
    const newAppraisal = new FacultyAppraisal({
      userId,
      status: 'DRAFT',
    });

    await newAppraisal.save();

    sendSuccess(res, newAppraisal, 'Appraisal created successfully', HttpStatus.CREATED);
  } catch (error) {
    console.error('Error creating appraisal:', error);
    sendError(res, 'Failed to create appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get appraisal by userId
 */
export const getAppraisalByUserId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const appraisal = await FacultyAppraisal.findOne({ userId });

    if (!appraisal) {
      sendError(res, 'Appraisal not found', HttpStatus.NOT_FOUND);
      return;
    }

    // Check authorization - users can only view their own appraisal unless admin/dean/hod
    const requestingUser = req.body;
    const isAuthorized =
      requestingUser?.userId === userId || ['admin', 'dean', 'hod'].includes(requestingUser?.role);
   
    if (!isAuthorized) {
      sendError(res, 'Unauthorized to view this appraisal', HttpStatus.FORBIDDEN);
      return;
    }

    sendSuccess(res, appraisal, 'Appraisal retrieved successfully');
  } catch (error) {
    console.error('Error retrieving appraisal:', error);
    sendError(res, 'Failed to retrieve appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Update appraisal
 */
export const updateAppraisal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    // Check authorization - users can only update their own appraisal
    const requestingUser = req.body;
    const isAuthorized = requestingUser?.userId === userId;

    if (!isAuthorized) {
      sendError(res, 'Unauthorized to update this appraisal', HttpStatus.FORBIDDEN);
      return;
    }

    const appraisal = await FacultyAppraisal.findOne({ userId });

    if (!appraisal) {
      sendError(res, 'Appraisal not found', HttpStatus.NOT_FOUND);
      return;
    }

    // Can't update if already approved
    if (appraisal.status === 'APPROVED') {
      sendError(res, 'Cannot update approved appraisal', HttpStatus.BAD_REQUEST);
      return;
    }

    // Update appraisal fields
    Object.assign(appraisal, updateData);
    await appraisal.save();

    sendSuccess(res, appraisal, 'Appraisal updated successfully');
  } catch (error) {
    console.error('Error updating appraisal:', error);
    sendError(res, 'Failed to update appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Submit appraisal for review
 */
export const submitAppraisal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    // Check authorization - users can only submit their own appraisal
    const requestingUser = req.body;
    if (requestingUser?.userId !== userId) {
      sendError(res, 'Unauthorized to submit this appraisal', HttpStatus.FORBIDDEN);
      return;
    }

    const appraisal = await FacultyAppraisal.findOne({ userId });

    if (!appraisal) {
      sendError(res, 'Appraisal not found', HttpStatus.NOT_FOUND);
      return;
    }

    // Can only submit from DRAFT status
    if (appraisal.status !== 'DRAFT') {
      sendError(res, `Cannot submit appraisal with status: ${appraisal.status}`, HttpStatus.BAD_REQUEST);
      return;
    }

    // Validate declaration
    if (!appraisal.declaration.isAgreed) {
      sendError(res, 'Declaration must be agreed before submission', HttpStatus.BAD_REQUEST);
      return;
    }

    appraisal.status = 'SUBMITTED';
    appraisal.declaration.signatureDate = new Date();
    await appraisal.save();

    sendSuccess(res, appraisal, 'Appraisal submitted successfully');
  } catch (error) {
    console.error('Error submitting appraisal:', error);
    sendError(res, 'Failed to submit appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Verify appraisal (by verification team - Dean/HOD)
 */
export const verifyAppraisal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { verificationData } = req.body; // Contains verified marks for Part B, C, etc.

    const appraisal = await FacultyAppraisal.findOne({ userId });

    if (!appraisal) {
      sendError(res, 'Appraisal not found', HttpStatus.NOT_FOUND);
      return;
    }

    // Can only verify submitted appraisals
    if (appraisal.status !== 'SUBMITTED') {
      sendError(res, `Cannot verify appraisal with status: ${appraisal.status}`, HttpStatus.BAD_REQUEST);
      return;
    }

    // Update verified marks
    if (verificationData) {
      Object.assign(appraisal, verificationData);
    }

    appraisal.status = 'VERIFIED';
    await appraisal.save();

    sendSuccess(res, appraisal, 'Appraisal verified successfully');
  } catch (error) {
    console.error('Error verifying appraisal:', error);
    sendError(res, 'Failed to verify appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Approve appraisal (by Director/Dean)
 */
export const approveAppraisal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { adminWeightage } = req.body;

    const appraisal = await FacultyAppraisal.findOne({ userId });

    if (!appraisal) {
      sendError(res, 'Appraisal not found', HttpStatus.NOT_FOUND);
      return;
    }

    // Can only approve verified appraisals
    if (appraisal.status !== 'VERIFIED') {
      sendError(res, `Cannot approve appraisal with status: ${appraisal.status}`, HttpStatus.BAD_REQUEST);
      return;
    }

    // Update admin weightage if provided
    if (adminWeightage !== undefined) {
      appraisal.summary.adminWeightage = adminWeightage;
    }

    appraisal.status = 'APPROVED';
    await appraisal.save();

    sendSuccess(res, appraisal, 'Appraisal approved successfully');
  } catch (error) {
    console.error('Error approving appraisal:', error);
    sendError(res, 'Failed to approve appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Delete appraisal (only drafts)
 */
export const deleteAppraisal = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    // Check authorization - users can only delete their own appraisal
    const requestingUser = req.body;
    if (requestingUser?.userId !== userId) {
      sendError(res, 'Unauthorized to delete this appraisal', HttpStatus.FORBIDDEN);
      return;
    }

    const appraisal = await FacultyAppraisal.findOne({ userId });

    if (!appraisal) {
      sendError(res, 'Appraisal not found', HttpStatus.NOT_FOUND);
      return;
    }

    // Can only delete drafts
    if (appraisal.status !== 'DRAFT') {
      sendError(res, 'Can only delete draft appraisals', HttpStatus.BAD_REQUEST);
      return;
    }

    await FacultyAppraisal.deleteOne({ userId });

    sendSuccess(res, null, 'Appraisal deleted successfully');
  } catch (error) {
    console.error('Error deleting appraisal:', error);
    sendError(res, 'Failed to delete appraisal', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get all appraisals (Admin/Director/Dean/HOD)
 */
export const getAllAppraisals = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, department } = req.query;

    const filter: any = {};

    if (status) {
      filter.status = status;
    }

    if (department) {
      filter['facultyInfo.department'] = department;
    }

    const appraisals = await FacultyAppraisal.find(filter)
      .select('userId status facultyInfo summary createdAt updatedAt')
      .sort({ updatedAt: -1 });

    sendSuccess(res, appraisals, 'Appraisals retrieved successfully');
  } catch (error) {
    console.error('Error retrieving appraisals:', error);
    sendError(res, 'Failed to retrieve appraisals', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Get appraisals by department (Dean/HOD)
 */
export const getAppraisalsByDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { department } = req.params;
    const { status } = req.query;

    const filter: any = { 'facultyInfo.department': department };

    if (status) {
      filter.status = status;
    }

    const appraisals = await FacultyAppraisal.find(filter)
      .select('userId status facultyInfo summary createdAt updatedAt')
      .sort({ updatedAt: -1 });

    sendSuccess(res, appraisals, 'Appraisals retrieved successfully');
  } catch (error) {
    console.error('Error retrieving appraisals by department:', error);
    sendError(res, 'Failed to retrieve appraisals', HttpStatus.INTERNAL_SERVER_ERROR);
  }
};
