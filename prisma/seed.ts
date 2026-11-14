import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Minimal 1x1 valid PNG buffer for seeded sample photo keys
const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function ensureSamplePhoto(key: string) {
  const fullPath = path.resolve(process.cwd(), ".storage", key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, Buffer.from(SAMPLE_PNG_BASE64, "base64"));
}

async function main() {
  const demoPassHash = await bcrypt.hash("TechTrack@2026", 10);

  await ensureSamplePhoto("attendance/seed-timein.png");
  await ensureSamplePhoto("tasks/seed-cabling.png");
  await ensureSamplePhoto("inspections/seed-defect.png");

  await prisma.systemConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      requiredPreOjtHours: 100,
      taskCategories: [
        "PC Assembly",
        "OS Configuration",
        "Network Cabling",
        "Hardware Diagnostics",
        "Lab Maintenance",
      ],
      creditRoundingRule: "EXACT_MINUTES",
      allowSelfRegistration: true,
    },
  });

  const superadmin = await prisma.user.upsert({
    where: { email: "superadmin@aclc-mandaue.edu.ph" },
    update: {},
    create: {
      email: "superadmin@aclc-mandaue.edu.ph",
      passwordHash: demoPassHash,
      fullName: "Engr. Roy Imperial",
      role: "SUPERADMIN",
      status: "ACTIVE",
      program: "BSIT",
      phone: "0917-000-0001",
    },
  });

  const admin1 = await prisma.user.upsert({
    where: { email: "coordinator@aclc-mandaue.edu.ph" },
    update: {},
    create: {
      email: "coordinator@aclc-mandaue.edu.ph",
      passwordHash: demoPassHash,
      fullName: "Donald Francisco",
      role: "ADMIN",
      status: "ACTIVE",
      program: "BSIT",
      phone: "0917-000-0002",
    },
  });

  const admin2 = await prisma.user.upsert({
    where: { email: "techstaff@aclc-mandaue.edu.ph" },
    update: {},
    create: {
      email: "techstaff@aclc-mandaue.edu.ph",
      passwordHash: demoPassHash,
      fullName: "Elena Labra",
      role: "ADMIN",
      status: "ACTIVE",
      program: "BSIT",
      phone: "0917-000-0003",
    },
  });

  const batchA = await prisma.batch.upsert({
    where: { name: "BSIT-4A Batch 2026-1" },
    update: {},
    create: {
      name: "BSIT-4A Batch 2026-1",
      section: "BSIT-4A",
      academicYear: "2026-2027",
      isActive: true,
      coordinatorId: admin1.id,
    },
  });

  const batchB = await prisma.batch.upsert({
    where: { name: "BSIT-4B Batch 2026-1" },
    update: {},
    create: {
      name: "BSIT-4B Batch 2026-1",
      section: "BSIT-4B",
      academicYear: "2026-2027",
      isActive: true,
      coordinatorId: admin2.id,
    },
  });

  const existingSched = await prisma.schedule.findFirst({ where: { batchId: batchA.id } });
  const schedMorning =
    existingSched ??
    (await prisma.schedule.create({
      data: {
        batchId: batchA.id,
        label: "Morning Technical Duty (08:00–12:00)",
        startTime: "08:00",
        endTime: "12:00",
        graceMinutes: 15,
      },
    }));

  const schedAfternoon =
    (await prisma.schedule.findFirst({ where: { batchId: batchA.id, label: { contains: "Afternoon" } } })) ??
    (await prisma.schedule.create({
      data: {
        batchId: batchA.id,
        label: "Afternoon Lab Shift (13:00–17:00)",
        startTime: "13:00",
        endTime: "17:00",
        graceMinutes: 15,
      },
    }));

  const student1 = await prisma.user.upsert({
    where: { email: "edrich.bardilas@student.aclc.edu.ph" },
    update: {},
    create: {
      email: "edrich.bardilas@student.aclc.edu.ph",
      passwordHash: demoPassHash,
      fullName: "Edrich B. Bardilas",
      role: "STUDENT",
      status: "ACTIVE",
      studentIdNo: "2023-00101",
      program: "BSIT",
      section: "BSIT-4A",
      phone: "0917-555-0101",
      batchId: batchA.id,
      requiredHours: 100,
    },
  });

  const student2 = await prisma.user.upsert({
    where: { email: "michelle.estoy@student.aclc.edu.ph" },
    update: {},
    create: {
      email: "michelle.estoy@student.aclc.edu.ph",
      passwordHash: demoPassHash,
      fullName: "Michelle P. Estoy",
      role: "STUDENT",
      status: "ACTIVE",
      studentIdNo: "2023-00102",
      program: "BSIT",
      section: "BSIT-4A",
      phone: "0917-555-0102",
      batchId: batchA.id,
      requiredHours: 100,
    },
  });

  const student3 = await prisma.user.upsert({
    where: { email: "joan.inting@student.aclc.edu.ph" },
    update: {},
    create: {
      email: "joan.inting@student.aclc.edu.ph",
      passwordHash: demoPassHash,
      fullName: "Joan Marie E. Inting",
      role: "STUDENT",
      status: "ACTIVE",
      studentIdNo: "2023-00103",
      program: "BSIT",
      section: "BSIT-4B",
      batchId: batchB.id,
      requiredHours: 100,
    },
  });

  await prisma.user.upsert({
    where: { email: "pending.applicant@student.aclc.edu.ph" },
    update: {},
    create: {
      email: "pending.applicant@student.aclc.edu.ph",
      passwordHash: demoPassHash,
      fullName: "Marco Villanueva",
      role: "STUDENT",
      status: "PENDING_VERIFICATION",
      studentIdNo: "2023-00199",
      program: "BSIT",
      section: "BSIT-4A",
      verificationToken: "seed-verify-token-001",
      verificationSentAt: new Date(),
    },
  });

  // Attendance logs for student1 (96 credited + 4 pending = ready to hit 100h upon approval!)
  const existingAttCount = await prisma.attendanceLog.count({ where: { studentId: student1.id } });
  if (existingAttCount === 0) {
    const baseDate = new Date("2026-11-01T08:00:00");
    for (let i = 0; i < 12; i++) {
      const day = new Date(baseDate.getTime() + i * 86400000);
      const tIn = new Date(day);
      const tOut = new Date(day.getTime() + 8 * 3600000);
      await prisma.attendanceLog.create({
        data: {
          studentId: student1.id,
          batchId: batchA.id,
          scheduleId: schedMorning.id,
          shiftDate: day,
          timeIn: tIn,
          timeOut: tOut,
          photoInKey: "attendance/seed-timein.png",
          photoOutKey: "attendance/seed-timein.png",
          status: "APPROVED",
          recordedHours: 8,
          creditedHours: 8,
          reviewerId: admin1.id,
          reviewerRemarks: "Verified lab shift attendance",
          reviewedAt: tOut,
        },
      });
    }
    const pendingLog = await prisma.attendanceLog.create({
      data: {
        studentId: student1.id,
        batchId: batchA.id,
        scheduleId: schedAfternoon.id,
        shiftDate: new Date("2026-11-14T13:25:00"),
        timeIn: new Date("2026-11-14T13:25:00"),
        timeOut: new Date("2026-11-14T17:25:00"),
        photoInKey: "attendance/seed-timein.png",
        photoOutKey: "attendance/seed-timein.png",
        isIrregular: true,
        irregularReason: "Arrived 25 minutes after 13:00 shift start",
        status: "PENDING",
        recordedHours: 4,
        creditedHours: 0,
      },
    });

    await prisma.escalationCase.create({
      data: {
        sourceType: "ATTENDANCE",
        sourceId: pendingLog.id,
        raisedById: admin1.id,
        studentId: student1.id,
        summary: "Irregular afternoon shift grace-period exception review",
        policyDetails: "Student arrived 25m late while assisting faculty workstation imaging.",
        status: "OPEN",
      },
    });
  }

  // Labs & Workstations (sorted A-Z)
  const lab1 = await prisma.labRoom.upsert({
    where: { name: "Computer Lab 1" },
    update: {},
    create: {
      name: "Computer Lab 1",
      building: "IT Building 2F",
      capacity: 10,
      assignedAdminId: admin1.id,
      assignedStudentId: student1.id,
    },
  });
  const lab2 = await prisma.labRoom.upsert({
    where: { name: "Computer Lab 2" },
    update: {},
    create: {
      name: "Computer Lab 2",
      building: "IT Building 2F",
      capacity: 10,
      assignedAdminId: admin1.id,
      assignedStudentId: student2.id,
    },
  });
  await prisma.labRoom.upsert({
    where: { name: "Network & Hardware Lab 3" },
    update: {},
    create: {
      name: "Network & Hardware Lab 3",
      building: "IT Building 3F",
      capacity: 8,
      assignedAdminId: admin2.id,
      assignedStudentId: student3.id,
    },
  });

  for (const [room, count] of [
    [lab1, 10],
    [lab2, 8],
  ] as const) {
    for (let idx = 1; idx <= count; idx++) {
      const code = `PC-${String(idx).padStart(2, "0")}`;
      await prisma.computerUnit.upsert({
        where: { roomId_unitCode: { roomId: room.id, unitCode: code } },
        update: {},
        create: {
          roomId: room.id,
          unitCode: code,
          specs: "Intel Core i5-12400 / 16GB RAM / 512GB NVMe",
          condition:
            room.id === lab1.id && idx === 4
              ? "NEEDS_MAINTENANCE"
              : room.id === lab1.id && idx === 7
                ? "NEEDS_REPAIR"
                : "FUNCTIONING",
        },
      });
    }
  }

  // Tasks + Assignments
  const taskCount = await prisma.task.count();
  if (taskCount === 0) {
    const task1 = await prisma.task.create({
      data: {
        title: "Lab 1 Cat6 Patch Panel Termination & Testing",
        instructions:
          "Re-terminate loose Cat6 drops on Rack B, test continuity across PC-01 to PC-10, and attach photo proof.",
        category: "Network Cabling",
        targetLab: "Computer Lab 1",
        targetUnits: "PC-01 to PC-10",
        deadline: new Date("2026-11-22T17:00:00"),
        batchId: batchA.id,
        createdById: admin1.id,
      },
    });

    const a1 = await prisma.taskAssignment.create({
      data: {
        taskId: task1.id,
        studentId: student1.id,
        status: "RETURNED",
        startedAt: new Date("2026-11-10T09:00:00"),
      },
    });

    await prisma.taskSubmission.create({
      data: {
        assignmentId: a1.id,
        version: 1,
        summary: "Tested ports 1-8; replaced RJ45 keystones on ports 4 and 7.",
        attachmentKeys: [
          { key: "tasks/seed-cabling.png", name: "rack-b-test.png", mime: "image/png", size: 96 },
        ],
      },
    });

    await prisma.taskRemark.createMany({
      data: [
        {
          assignmentId: a1.id,
          authorId: admin1.id,
          visibility: "STUDENT_VISIBLE",
          body: "Please include cable tester verification results for ports 9 and 10 and upload a clearer photo.",
        },
        {
          assignmentId: a1.id,
          authorId: admin1.id,
          visibility: "INTERNAL_STAFF_ONLY",
          body: "Internal note: Check whether port 9 switch module needs replacement next semester.",
        },
      ],
    });

    const task2 = await prisma.task.create({
      data: {
        title: "Ubuntu 24.04 Workstation Dual-Boot Imaging",
        instructions: "Verify BIOS secure boot configuration and deploy golden image on PC-01 to PC-05.",
        category: "OS Configuration",
        targetLab: "Computer Lab 2",
        targetUnits: "PC-01 to PC-05",
        deadline: new Date("2026-11-25T17:00:00"),
        batchId: batchA.id,
        createdById: admin1.id,
      },
    });

    await prisma.taskAssignment.create({
      data: {
        taskId: task2.id,
        studentId: student1.id,
        status: "ASSIGNED",
      },
    });

    await prisma.taskAssignment.create({
      data: {
        taskId: task1.id,
        studentId: student2.id,
        status: "ACCEPTED",
        startedAt: new Date("2026-11-09T09:00:00"),
        acceptedAt: new Date("2026-11-11T15:30:00"),
      },
    });
  }

  // Sample conversation (Student <-> Admin; SuperAdmin never included)
  const convCount = await prisma.conversation.count();
  if (convCount === 0) {
    const conv = await prisma.conversation.create({
      data: {
        title: "BSIT-4A Shift & Task Coordination",
        type: "DIRECT",
        batchId: batchA.id,
        members: {
          create: [{ userId: admin1.id }, { userId: student1.id }],
        },
        messages: {
          create: [
            {
              senderId: admin1.id,
              body: "Welcome to BSIT-4A Pre-OJT monitoring. Remember to submit your afternoon photo logs within the 15-minute grace window.",
            },
            {
              senderId: student1.id,
              body: "Noted Sir! I will upload the updated port 9-10 cable test photos this afternoon.",
            },
          ],
        },
      },
    });

    await prisma.notification.createMany({
      data: [
        {
          userId: student1.id,
          type: "TASK_REVIEW",
          title: "Task report returned for revision",
          body: "Lab 1 Cat6 Patch Panel Termination & Testing requires ports 9-10 photo proof.",
          link: "/tasks",
        },
        {
          userId: admin1.id,
          type: "ATTENDANCE",
          title: "Irregular attendance punch flagged",
          body: "Edrich B. Bardilas logged an off-schedule afternoon punch requiring review.",
          link: "/admin/attendance",
        },
        {
          userId: superadmin.id,
          type: "SYSTEM_ALERT",
          title: "Escalation case awaiting SuperAdmin ruling",
          body: "Coordinator Donald Francisco escalated an irregular shift case for policy review.",
          link: "/superadmin",
        },
      ],
    });

    await prisma.auditLog.create({
      data: {
        actorId: superadmin.id,
        action: "SYSTEM_SEED_INITIALIZED",
        entityType: "SystemConfig",
        entityId: "singleton",
        details: { conversationId: conv.id },
      },
    });
  }

  console.log("Seed completed successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
