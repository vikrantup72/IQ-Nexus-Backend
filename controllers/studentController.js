import { STUDENT_LATEST, getStudentsByFilters } from "../models/newStudentModel.model.js";
import { fetchDataByMobile, fetchKgDataByMobile } from "../services/studentService.js";
import { School } from "../models/schoolModel.js";
import { StudyMaterial } from "../services/studyMaterialService.js";
import { TeacherIncharge } from "../models/TeacherInchanrgeModel.js";

const studentCache = {};
const examNameMapping = {
  IQMO: 'IMO',
  IQSO: 'ITST',
  IQEO: 'IENGO',
  IQRO: 'IAO',
  IQGKO: 'IGKO'
};

export const getStudentByMobile = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(400).json({ error: "Mobile number is required" });
  }

  const mobNo = authHeader.split("Bearer ")[1];
  if (studentCache[mobNo]) {
    return res.status(200).json({ studentData: studentCache[mobNo], mobile: mobNo });
  }

  try {
    let studentData = await fetchDataByMobile(mobNo);
    if (!studentData || !studentData[0]["Mob No"]) {
      studentData = await fetchKgDataByMobile(mobNo);
    }

    if (studentData && studentData[0]["Mob No"]) {
      // studentCache[mobNo] = studentData;
      return res.status(200).json({ studentData, mobile: studentData[0]["Mob No"] });
    }

    return res.status(404).json({ error: "No student found with this mobile number" });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch student data", details: error });
  }
};

export const getStudents = async (req, res) => {
  try {
    const { schoolCode, className, rollNo, section, studentName, subject,examLevel } = req.body;
    const { page = 1, limit = 10 } = req.query;

    const schoolCodeNumber = schoolCode ? parseInt(schoolCode) : undefined;
    if (schoolCode && isNaN(schoolCodeNumber)) {
      return res.status(400).json({ error: "Invalid school code: must be a number" });
    }

    const students = await getStudentsByFilters(
      schoolCodeNumber, className, rollNo, section, studentName, subject,examLevel,
      Number(page), Number(limit)
    );

    if (students.data.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No students found matching the criteria",
        data: [], totalPages: 0, currentPage: Number(page), totalStudents: 0,
      });
    }

    return res.status(200).json({
      success: true,
      data: students.data,
      totalPages: students.totalPages,
      currentPage: Number(page),
      totalStudents: students.totalStudents,
    });
  } catch (error) {
    console.error("❌ Error in route:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getStudentsWithoutPagination = async (req, res) => {
  try {
    const { schoolCode, className, rollNo, section, studentName, subject } = req.body;
    let query = {};

    if (schoolCode) query.schoolCode = Number(schoolCode);
    if (className?.length > 0) query.class = { $in: className };
    if (rollNo) query.rollNo = rollNo;
    if (section?.length > 0) query.section = { $in: section };
    if (studentName) query.studentName = { $regex: studentName, $options: "i" };
    if (subject) query[subject] = "1";

    const data = await STUDENT_LATEST.find(query);
    const totalStudents = data.length;

    return res.status(200).json({ success: true, data, totalStudents });
  } catch (error) {
    console.error("❌ Error fetching students:", error);
    res.status(500).json({ message: "Error fetching students", error });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const { rollNo, _id, ...updateFields } = req.body;

    if (!_id && !rollNo) return res.status(400).json({ message: "Either _id or rollNo is required" });

    if (updateFields.Duplicates !== undefined) {
      updateFields.Duplicates = ["1", "true", true].includes(updateFields.Duplicates);
    }

    let updatedStudent;
    if (_id) {
      updatedStudent = await STUDENT_LATEST.findByIdAndUpdate(_id, { $set: updateFields }, { new: true, runValidators: true });
    } else {
      updatedStudent = await STUDENT_LATEST.findOneAndUpdate({ rollNo }, { $set: updateFields }, { new: true, runValidators: true });
    }

    if (!updatedStudent) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (updateFields.rollNo && updateFields.rollNo !== rollNo) {
      const existingStudent = await STUDENT_LATEST.findOne({
        rollNo: updateFields.rollNo,
        _id: { $ne: updatedStudent._id },
      });
      if (existingStudent) {
        return res.status(400).json({ message: "rollNo must be unique" });
      }
    }

    res.json({ message: "Student updated successfully", updatedStudent });
  } catch (error) {
    console.error("Error updating student:", error);
    if (error.name === "CastError") {
      res.status(400).json({ message: `Invalid value for ${error.path}: ${error.value}` });
    } else if (error.code === 11000) {
      res.status(400).json({ message: "rollNo must be unique" });
    } else {
      res.status(500).json({ message: "Error updating student", error: error.message || error });
    }
  }
};

export const addStudent = async (req, res) => {
  try {
    const newStudent = new STUDENT_LATEST(req.body);
    const savedStudent = await newStudent.save();

    res.status(201).json({
      message: "Student added successfully",
      collection: savedStudent.constructor.collection.name,
      documentId: savedStudent._id,
    });
  } catch (error) {
    console.error("❌ Error adding student:", error);
    res.status(500).json({ message: "Error adding student", error });
  }
};

export const getDashboardAnalytics = async (req, res) => {
  try {
    // const allStudents = await STUDENT_LATEST.countDocuments();
    const allStudents = await STUDENT_LATEST.countDocuments();
    const allSchools = await School.countDocuments();
    const allStudyMaterials = await StudyMaterial.countDocuments();

       return res
      .status(200)
      .json({ allStudents, allSchools, allStudyMaterials, success: true });
  } catch (error) {
    console.error("❌ Error fetching analytics:", error);
    res.status(500).json({ message: "Error fetching dashboard analytics", error });
  }
};

export const getAllStudents = async (req, res) => {
   try {
    const { page, limit } = req.query;
    const allStudents = await STUDENT_LATEST.find()
      .skip((page - 1) * limit)
      .limit(limit);
    const totalPages = Math.ceil(
      (await STUDENT_LATEST.countDocuments()) / limit
    );
    const totalStudents = await STUDENT_LATEST.countDocuments();
    return res
      .status(200)
      .json({ allStudents, totalPages, totalStudents, success: true });
  } catch (error) {
    console.error("❌ Error fetching all students:", error);
    res.status(500).json({ message: "Error fetching all students", error });
  }
};

export const getAttendanceStudents = async (req, res) => {
   const { schoolCode, classes, sections, exam } = req.body;
  
    // Validate required fields
    if (!schoolCode || !exam) {
      return res.status(400).json({ message: 'School code and exam are required' });
    }
    // Parse exam name and level
    const levelMatch = exam.match(/(L1|L2)$/);
    const examName = exam.replace(/(L1|L2)$/, '');
  
    if (!levelMatch || !examNameMapping[examName]) {
      return res.status(400).json({ message: 'Invalid exam format or exam name. Expected format: IQEOL1, IQMOL2, etc.' });
    }
  
    const examLevel = levelMatch[0]; // L1 or L2
  
    try {
      // Find school
      const school = await TeacherIncharge.findOne({ schoolCode }) || {};
      
      // Build query
      const query = { schoolCode };
  
      // Add class filter if provided
      if (classes && classes.length > 0) {
        query.class = { $in: classes };
      }
  
      // Add section filter if provided
      if (sections && sections.length > 0) {
        query.section = { $in: sections };
      }
  
      // Map new exam name to old exam name and append level
      const oldExamName = examNameMapping[examName];
      const examField = `${oldExamName}${examLevel}`;
  
      // Add exam filter (value must be "1")
      query[examField] = "1";
  
      // Fetch students
      const students = await STUDENT_LATEST.find(query);
      console.log("Fetched students:", students);
      return res.status(200).json({ student: students, school });
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
};
