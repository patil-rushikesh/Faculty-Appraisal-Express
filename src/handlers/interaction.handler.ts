import { Request, Response } from 'express';
import { User } from '../models/user';
import InteractionDean from '../models/interactionDean';
import InteractionEvaluation from '../models/interactionEvaluation';
import { FacultyAppraisal } from '../models/detailedAppraisal';
import { APPRAISAL_STATUS } from '../constant';
import { hashPassword } from '../utils/password';

interface ExternalFacultyInput {
  full_name: string;
  mail: string;
  mob: string;
  desg?: string;
  specialization?: string;
  organization?: string;
  address?: string;
  assignedDean?: string;
  assignedFaculties?: string[];
}

/**
 * Get faculty members in a department whose appraisal status is "Interaction Pending"
 * GET /api/interaction/:department/interaction-pending-faculty
 * When called by director, returns HODs/Deans college-wide instead.
 */
export const getInteractionPendingFaculty = async (req: Request, res: Response) => {
  try {
    const { department } = req.params;
    const isDirector = req.user?.role === 'director';

    // Director sees HOD/Dean college-wide; HOD sees faculty in their department
    const userQuery: any = {
      status: 'active',
      designation: { $in: ['Professor', 'Associate Professor', 'Assistant Professor'] },
    };

    if (isDirector) {
      userQuery.role = { $in: ['hod', 'dean'] };
      // no department filter — college-wide
    } else {
      // userQuery.department = department;
      userQuery.role = { $in: ['faculty', 'hod'] };
    }

    const users = await User.find(userQuery).select('userId name email designation role department');
    const userIds = users.map((u) => u.userId);

    // Find which of these have "Interaction Pending" appraisal status
    const pendingAppraisals = await FacultyAppraisal.find({
      userId: { $in: userIds },
      status: APPRAISAL_STATUS.INTERACTION_PENDING,
    }).select('userId');

    const pendingUserIds = new Set(pendingAppraisals.map((a) => a.userId));

    const result = users
      .filter((u) => pendingUserIds.has(u.userId))
      .map((u) => ({
        userId: u.userId,
        name: u.name,
        email: u.email,
        designation: u.designation,
        role: (u as any).role,
        department: (u as any).department,
      }));

    return res.status(200).json({
      success: true,
      message: 'Interaction-pending faculty retrieved successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('Error fetching interaction-pending faculty:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Create external faculty for a department
 * POST /api/hod/:department/create-external
 */
export const createExternal = async (req: Request, res: Response) => {
  try {
    const { department } = req.params;
    const { full_name, mail, mob, desg, specialization, organization, address, assignedDean, assignedFaculties }: ExternalFacultyInput = req.body;

    // Validate required fields
    if (!full_name || !mail || !mob || !specialization || !organization || !address) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
      });
    }

    // Validate mobile number have 10 digits
    if (mob.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number must have 10 digits',
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: mail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    // Generate userId for external faculty using EXT + last 4 digits of mobile
    const last4Digits = mob.slice(-4);
    const userId = `EXT${last4Digits}`;

    // Hash the userId to use as password
    const hashedPassword = await hashPassword(userId);

    // Create new external faculty user (password is same as userId)
    const externalFaculty = new User({
      userId,
      name: full_name,
      email: mail,
      mobile: mob,
      role: 'external',
      status: 'active',
      password: hashedPassword,
      department: department,
      specialization: specialization || '',
      organization: organization || '',
      address: address || '',
      externalDesignation: desg || '',
      assignedDean: assignedDean || '',
      assignedFaculties: assignedFaculties || [],
    });

    await externalFaculty.save();

    return res.status(201).json({
      success: true,
      message: 'External faculty added successfully',
      data: {
        userId: externalFaculty.userId,
        full_name: externalFaculty.name,
        mail: externalFaculty.email,
        mob: externalFaculty.mobile,
        desg: externalFaculty.externalDesignation,
        specialization: externalFaculty.specialization,
        organization: externalFaculty.organization,
        address: externalFaculty.address,
        assignedDean: externalFaculty.assignedDean,
        assignedFaculties: externalFaculty.assignedFaculties,
      },
    });
  } catch (error: any) {
    console.error('Error creating external faculty:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Get all external faculty for a department
 * GET /api/hod/:department/get-externals
 */
export const getExternals = async (req: Request, res: Response) => {
  try {
    const { department } = req.params;

    // Build query — filter by role and visibility rules
    const query: any = {
      role: 'external',
      status: 'active',
      department: department,
    };

    if (req.user?.role === 'director') {
      // Director only sees externals in the "pccoe" department (director-added)
      query.department = 'pccoe';
    } else if (req.user?.role === 'dean') {
      // Dean can be assigned to externals across any department, so remove dept filter
      delete query.department;
      query.assignedDean = req.user.userId;
    } else if (req.user?.role === 'external') {
      query.userId = req.user.userId;
    } else if (req.user?.role === 'hod') {
      // HOD should NOT see director-added "pccoe" externals
      // Only show externals from the requested department (which is the HOD's own dept)
    }

    // Find all external faculty for this department
    const externals = await User.find(query).select('userId name email mobile externalDesignation specialization organization address assignedDean assignedFaculties');

    // Format response to match frontend expectations and populate assigned faculties/dean
    const formattedExternals = await Promise.all(externals.map(async (ext) => {
      const extAny = ext as any;

      // Populate assigned faculties with their details
      let populatedFaculties: Array<{ _id: string; name: string; desg: string }> = [];
      if (extAny.assignedFaculties && extAny.assignedFaculties.length > 0) {
        const faculties = await User.find({
          userId: { $in: extAny.assignedFaculties },
          status: 'active'
        }).select('userId name designation');

        populatedFaculties = faculties.map(f => ({
          _id: f.userId,
          name: f.name,
          desg: f.designation || ''
        }));
      }

      return {
        userId: ext.userId,
        full_name: ext.name,
        mail: ext.email,
        mob: ext.mobile,
        desg: extAny.externalDesignation || '',
        specialization: ext.specialization || '',
        organization: ext.organization || '',
        address: ext.address || '',
        assignedDean: extAny.assignedDean || '',
        assignedFaculties: populatedFaculties,
      };
    }));

    return res.status(200).json({
      success: true,
      message: 'External faculty retrieved successfully',
      data: formattedExternals,
    });
  } catch (error: any) {
    console.error('Error fetching external faculty:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Delete external faculty
 * DELETE /api/interaction/:department/external/:userId
 */
export const deleteExternal = async (req: Request, res: Response) => {
  try {
    const { department, userId } = req.params;

    // Find and delete the external faculty
    const External = await User.findOne({
      userId: userId,
      role: 'external',
      status: 'active',
      department: department
    });

    if (!External) {
      return res.status(404).json({
        success: false,
        message: 'External faculty not found',
      });
    }
    External.status = 'inactive'; // Soft delete by marking as inactive
    await External.save();
    return res.status(200).json({
      success: true,
      message: 'External faculty removed successfully',
      data: {
        userId: External.userId,
        name: External.name,
      },
    });
  } catch (error: any) {
    console.error('Error deleting external faculty:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Assign dean to external faculty
 * PUT /api/interaction/:department/external/:userId/assign-dean
 */
export const assignDeanToExternal = async (req: Request, res: Response) => {
  try {
    const { department, userId } = req.params;
    const { deanUserId } = req.body;
    // console.log(department, userId, deanUserId);  
    // Find external faculty first
    const external = await User.findOne({
      userId: userId,
      role: 'external',
      status: 'active',
      department: department
    });

    if (!external) {
      return res.status(404).json({
        success: false,
        message: 'External faculty not found',
      });
    }

    // If deanUserId is empty/null, remove the dean assignment
    if (!deanUserId) {
      external.assignedDean = '';
      await external.save();

      return res.status(200).json({
        success: true,
        message: 'Dean assignment removed successfully',
        data: {
          userId: external.userId,
          name: external.name,
          assignedDean: '',
        },
      });
    }

    // Check if dean exists in interaction deans collection
    const interactionDeanRecord = await InteractionDean.findOne({
      department: department,
      deanIds: deanUserId
    });

    if (!interactionDeanRecord) {
      return res.status(404).json({
        success: false,
        message: 'Dean not found in interaction deans for this department',
      });
    }

    // Verify dean exists, has dean role, and is active
    const dean = await User.findOne({
      userId: deanUserId,
      role: 'dean',
      status: 'active',
    });

    if (!dean) {
      return res.status(404).json({
        success: false,
        message: 'Dean not found or inactive in this department',
      });
    }

    external.assignedDean = deanUserId;
    await external.save();

    return res.status(200).json({
      success: true,
      message: 'Dean assigned successfully',
      data: {
        userId: external.userId,
        name: external.name,
        assignedDean: external.assignedDean,
      },
    });
  } catch (error: any) {
    console.error('Error assigning dean to external faculty:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Assign faculties to external faculty
 * PUT /api/interaction/:department/external/:userId/assign-faculties
 */
export const assignFacultiesToExternal = async (req: Request, res: Response) => {
  try {
    const { department, userId } = req.params;
    const { facultyUserIds } = req.body;

    if (!facultyUserIds || !Array.isArray(facultyUserIds)) {
      return res.status(400).json({
        success: false,
        message: 'Faculty userIds array is required',
      });
    }

    // Verify all assignees exist — when director assigns, they assign HOD/Dean (not faculty)
    const assigneeRoles = req.user?.role === 'director'
      ? ['hod', 'dean']   // Director assigns HOD/Dean to externals
      : ['faculty'];       // HOD assigns faculty to externals

    const assigneeQuery: any = {
      userId: { $in: facultyUserIds },
      role: { $in: assigneeRoles },
      status: 'active',
    };

    // HOD scopes to their department; director is college-wide
    if (req.user?.role !== 'director') {
      assigneeQuery.department = department;
    }

    const faculties = await User.find(assigneeQuery);

    if (faculties.length !== facultyUserIds.length) {
      return res.status(404).json({
        success: false,
        message: req.user?.role === 'director'
          ? 'Some HODs/Deans not found'
          : 'Some faculties not found in this department',
      });
    }

    // Find and update external faculty
    const external = await User.findOne({
      userId: userId,
      role: 'external',
      status: 'active',
      department: department
    });

    if (!external) {
      return res.status(404).json({
        success: false,
        message: 'External faculty not found',
      });
    }

    external.assignedFaculties = facultyUserIds;
    await external.save();

    return res.status(200).json({
      success: true,
      message: 'Faculties assigned successfully',
      data: {
        userId: external.userId,
        name: external.name,
        assignedFaculties: external.assignedFaculties,
      },
    });
  } catch (error: any) {
    console.error('Error assigning faculties to external faculty:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Get all interaction deans for a department
 * GET /api/interaction/:department/interaction-deans
 */
export const getInteractionDeans = async (req: Request, res: Response) => {
  try {
    const { department } = req.params;
    console.log(department)
    // Find interaction deans record for this department
    const interactionDeanRecord = await InteractionDean.findOne({
      department: department
    });

    if (!interactionDeanRecord || !interactionDeanRecord.deanIds.length) {
      return res.status(200).json({
        success: true,
        message: 'No interaction deans found for this department',
        data: [],
      });
    }

    // Get details of all interaction deans
    const interactionDeans = await User.find({
      userId: { $in: interactionDeanRecord.deanIds },
      role: 'dean',
      status: 'active',
    }).select('userId name email department');

    const formattedDeans = interactionDeans.map((dean) => ({
      userId: dean.userId,
      name: dean.name,
      email: dean.email,
      department: dean.department,
    }));

    return res.status(200).json({
      success: true,
      message: 'Interaction deans retrieved successfully',
      data: formattedDeans,
    });
  } catch (error: any) {
    console.error('Error fetching interaction deans:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Submit interaction evaluation marks
 * POST /api/interaction/:department/evaluate/:evaluatorRole/:externalId/:facultyId
 * evaluatorRole: 'hod' | 'dean' | 'external'
 */
export const submitInteractionEvaluation = async (req: Request, res: Response) => {
  try {
    const { department, evaluatorRole, externalId, facultyId } = req.params;
    const {
      knowledge,
      skills,
      attributes,
      outcomesInitiatives,
      selfBranching,
      teamPerformance,
      comments,
      evaluatorId,
      evaluatorName,
    } = req.body;

    // Validate evaluator role
    if (!['hod', 'dean', 'external', 'director'].includes(evaluatorRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid evaluator role. Must be hod, dean, external, or director',
      });
    }

    // Validate required fields
    if (
      knowledge === undefined ||
      skills === undefined ||
      attributes === undefined ||
      outcomesInitiatives === undefined ||
      selfBranching === undefined ||
      teamPerformance === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: 'All evaluation criteria are required',
      });
    }

    // Validate marks ranges
    if (
      knowledge < 0 || knowledge > 20 ||
      skills < 0 || skills > 20 ||
      attributes < 0 || attributes > 10 ||
      outcomesInitiatives < 0 || outcomesInitiatives > 20 ||
      selfBranching < 0 || selfBranching > 10 ||
      teamPerformance < 0 || teamPerformance > 20
    ) {
      return res.status(400).json({
        success: false,
        message: 'Marks exceed allowed limits',
      });
    }

    // Verify faculty exists
    // For 'pccoe' department (director-managed HOD/Dean interactions),
    // skip department check since HODs/Deans have their own real departments.
    const facultyQuery: any = {
      userId: facultyId,
      status: 'active',
    };
    if (department !== 'pccoe') {
      // facultyQuery.department = department;
    }

    const faculty = await User.findOne(facultyQuery);

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: 'Faculty not found',
      });
    }

    // Verify external exists
    const external = await User.findOne({
      userId: externalId,
      role: 'external',
      status: 'active',
    });

    if (!external) {
      return res.status(404).json({
        success: false,
        message: 'External evaluator not found',
      });
    }

    // Calculate total marks
    const totalMarks = knowledge + skills + attributes + outcomesInitiatives + selfBranching + teamPerformance;

    // Find or create interaction evaluation record
    let evaluation = await InteractionEvaluation.findOne({
      facultyId,
      externalId,
      // department,
    });

    if (!evaluation) {
      // Create new evaluation record
      evaluation = new InteractionEvaluation({
        facultyId,
        facultyName: faculty.name,
        externalId,
        externalName: external.name,
        department,
      });
    }

    // Block re-submission if this role already evaluated
    const fieldName = `${evaluatorRole}Evaluation`;
    if ((evaluation as any)[fieldName]?.evaluatorId) {
      return res.status(400).json({
        success: false,
        message: `${evaluatorRole} evaluation has already been submitted and cannot be changed`,
      });
    }

    // Use req.user as fallback for evaluator info
    const finalEvaluatorId = evaluatorId || req.user?.userId || '';
    const finalEvaluatorName = evaluatorName || '';

    // Update the appropriate evaluation based on role
    (evaluation as any)[fieldName] = {
      evaluatorId: finalEvaluatorId,
      evaluatorName: finalEvaluatorName,
      knowledge,
      skills,
      attributes,
      outcomesInitiatives,
      selfBranching,
      teamPerformance,
      comments: comments || '',
      totalMarks,
      evaluatedAt: new Date(),
    };

    // Recalculate summary
    (evaluation as any).recalculateSummary();

    await evaluation.save();

    // When all three evaluations are done, mark the faculty's appraisal as Completed
    if (evaluation.isCompleted) {
      await FacultyAppraisal.findOneAndUpdate(
        { userId: facultyId, status: APPRAISAL_STATUS.INTERACTION_PENDING },
        { status: APPRAISAL_STATUS.COMPLETED }
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Evaluation submitted successfully',
      data: {
        facultyId: evaluation.facultyId,
        facultyName: evaluation.facultyName,
        evaluatorRole,
        totalMarks,
        evaluationsCompleted: evaluation.evaluationsCompleted,
        averageMarks: evaluation.averageMarks,
        isCompleted: evaluation.isCompleted,
      },
    });
  } catch (error: any) {
    console.error('Error submitting interaction evaluation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

/**
 * Get interaction evaluation for a faculty-external pair
 * GET /api/interaction/:department/evaluation/:externalId/:facultyId
 */
export const getInteractionEvaluation = async (req: Request, res: Response) => {
  try {
    const { department, externalId, facultyId } = req.params;

    const evaluation = await InteractionEvaluation.findOne({
      facultyId,
      externalId,
      // department,
    });

    if (!evaluation) {
      return res.status(404).json({
        success: false,
        message: 'Evaluation not found',
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Evaluation retrieved successfully',
      data: evaluation,
    });
  } catch (error: any) {
    console.error('Error fetching interaction evaluation:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};


