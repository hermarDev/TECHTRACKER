import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:3219";
const SCREENSHOT_DIR = "/tmp/techtracker_screenshots";
const PDF_OUTPUT = "/home/hrmr/Documents/CAPSTONE_TEACHTRACKER/TechTracker_System_Pages_Horizontal.pdf";

const PASSWORD = "TechTrack@2026";
const STUDENT_EMAIL = "edrich.bardilas@student.aclc.edu.ph";
const COMPLETED_STUDENT_EMAIL = "joan.inting@student.aclc.edu.ph";
const ADMIN_EMAIL = "coordinator@aclc-mandaue.edu.ph";
const SUPERADMIN_EMAIL = "superadmin@aclc-mandaue.edu.ph";

interface ShotItem {
  id: string;
  category: string;
  title: string;
  route: string;
  role: string;
  description: string;
  imageFile: string;
}

const catalog: ShotItem[] = [];

async function capture(
  page: Page,
  id: string,
  category: string,
  title: string,
  route: string,
  role: string,
  description: string,
  delayMs = 600
) {
  const filename = `${id}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  if (delayMs > 0) {
    await page.waitForTimeout(delayMs);
  }
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`[Captured] ${id}: ${title}`);
  catalog.push({
    id,
    category,
    title,
    route,
    role,
    description,
    imageFile: filename,
  });
}

async function login(page: Page, email: string, destination: string) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email address").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(new RegExp(`${destination.replaceAll("/", "\\/")}$`), { timeout: 15000 });
  await page.waitForSelector("main", { state: "visible", timeout: 15000 });
  await page.waitForTimeout(800);
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(PDF_OUTPUT), { recursive: true });

  const browser = await chromium.launch({ headless: true });

  console.log("=== STEP 1: CAPTURING PUBLIC & AUTHENTICATION VIEWS ===");
  {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    // 1. Landing Top
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await capture(
      page,
      "01-public-landing-top",
      "Public & Authentication",
      "Landing Page — 100-Hour Pre-OJT Hero & Portal Navigation",
      "/",
      "Public Visitor",
      "Official institutional portal hero section with authentication triggers and core system premise."
    );

    // 2. Landing Features
    await page.evaluate(() => window.scrollTo({ top: 920, behavior: "instant" }));
    await capture(
      page,
      "02-public-landing-features",
      "Public & Authentication",
      "Landing Page — Institutional Architecture & Functional Pillars",
      "/",
      "Public Visitor",
      "Breakdown of duty timekeeping, technical task dispatch, lab room inspections, and role-based access."
    );

    // 3. Landing Workflow & Footer
    await page.evaluate(() => window.scrollTo({ top: 1950, behavior: "instant" }));
    await capture(
      page,
      "03-public-landing-workflow",
      "Public & Authentication",
      "Landing Page — Pre-OJT Workflow & Compliance Standards",
      "/",
      "Public Visitor",
      "Step-by-step accreditation cycle, 100-hour requirement rules, and institutional institutional footer."
    );

    // 4. Sign-in
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await capture(
      page,
      "04-public-login",
      "Public & Authentication",
      "Unified Sign In — Secure Authentication Portal",
      "/login",
      "Unauthenticated User",
      "Role-aware single entry login supporting Student, Coordinator, and SuperAdmin credentials."
    );

    // 5. Register
    await page.goto(`${BASE_URL}/register`, { waitUntil: "networkidle" });
    await capture(
      page,
      "05-public-register",
      "Public & Authentication",
      "Student Self-Registration — Enrollment & Account Request",
      "/register",
      "Unregistered Student",
      "Student registration form with real-time field validation, institutional email validation, and student ID verification."
    );

    // 6. Forgot Password
    await page.goto(`${BASE_URL}/forgot-password`, { waitUntil: "networkidle" });
    await capture(
      page,
      "06-public-forgot-password",
      "Public & Authentication",
      "Password Recovery Request — Self-Service Credential Reset",
      "/forgot-password",
      "Unauthenticated User",
      "Self-service password recovery flow dispatching verified reset tokens to the outbox."
    );

    // 7. Reset Password
    await page.goto(`${BASE_URL}/reset-password`, { waitUntil: "networkidle" });
    await capture(
      page,
      "07-public-reset-password",
      "Public & Authentication",
      "Credential Reset Form — Password Update",
      "/reset-password",
      "Unauthenticated User",
      "Secure credential update form with password complexity validation rules."
    );

    // 8. Dev Outbox
    await page.goto(`${BASE_URL}/dev/outbox`, { waitUntil: "networkidle" });
    await capture(
      page,
      "08-public-dev-outbox",
      "Public & Authentication",
      "Developer Outbox — Verification & System Email Queue",
      "/dev/outbox",
      "System Administrator / Developer",
      "Simulated transactional email outbox displaying account activation links and system notifications."
    );

    await context.close();
  }

  console.log("=== STEP 2: CAPTURING ACTIVE STUDENT EXPERIENCE ===");
  {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await login(page, STUDENT_EMAIL, "/student");

    // 9. Student Dashboard Top
    await capture(
      page,
      "09-student-dashboard-top",
      "Student Experience",
      "Student Dashboard — Progress Metrics & Active Shift Status",
      "/student",
      "Active Student (Edrich B. Bardilas)",
      "Real-time hours rendered tracker, credited hours, pending review tallies, and current shift status."
    );

    // 10. Student Dashboard Ledger
    await page.evaluate(() => window.scrollTo({ top: 550, behavior: "instant" }));
    await capture(
      page,
      "10-student-dashboard-ledger",
      "Student Experience",
      "Student Dashboard — 100-Hour Pre-OJT Duty Ledger",
      "/student",
      "Active Student (Edrich B. Bardilas)",
      "Audit-ready chronological duty ledger listing time-in, time-out, verified duration, and remarks."
    );

    // 11. Attendance Punch Form
    await page.goto(`${BASE_URL}/attendance`, { waitUntil: "networkidle" });
    await capture(
      page,
      "11-student-attendance-punch",
      "Student Experience",
      "Attendance Management — Duty Punch & Photo Verification",
      "/attendance",
      "Active Student (Edrich B. Bardilas)",
      "Shift selection dropdown, live duty status, and photo capture/upload verification interface."
    );

    // 12. Attendance Duty History Table
    await page.evaluate(() => window.scrollTo({ top: 480, behavior: "instant" }));
    await capture(
      page,
      "12-student-attendance-history",
      "Student Experience",
      "Attendance Records — Historical Punch Log & Accreditation Status",
      "/attendance",
      "Active Student (Edrich B. Bardilas)",
      "Granular punch records showing coordinator approval state, flagged timestamps, and PDF certificate status."
    );

    // 13. Tasks List
    await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle" });
    await capture(
      page,
      "13-student-tasks-list",
      "Student Experience",
      "Tasks Catalog — Technical Duty Assignments",
      "/tasks",
      "Active Student (Edrich B. Bardilas)",
      "Overview of assigned laboratory tasks categorized by technical domain with real-time status badges."
    );

    // 14. Task Detail Returned
    await page.goto(`${BASE_URL}/tasks/3590873a-9894-4562-a7d8-8b69c292fcc7`, { waitUntil: "networkidle" });
    await capture(
      page,
      "14-student-task-returned-detail",
      "Student Experience",
      "Task Detail — Returned Report with Coordinator Feedback",
      "/tasks/3590873a-9894-4562-a7d8-8b69c292fcc7",
      "Active Student (Edrich B. Bardilas)",
      "Cat6 Patch Panel task detailing return-for-revision status, revision upload form, and supervisor feedback history."
    );

    // 15. Task Detail Assigned
    await page.goto(`${BASE_URL}/tasks/ab458f1c-e0ef-46da-aea2-4c45b1e1cb7c`, { waitUntil: "networkidle" });
    await capture(
      page,
      "15-student-task-assigned-detail",
      "Student Experience",
      "Task Detail — Assigned OS Imaging Workstation Brief",
      "/tasks/ab458f1c-e0ef-46da-aea2-4c45b1e1cb7c",
      "Active Student (Edrich B. Bardilas)",
      "Dual-boot configuration task specifications, target units PC-01 to PC-05, and submission requirements."
    );

    // 16. Inspections Catalog
    await page.goto(`${BASE_URL}/inspections`, { waitUntil: "networkidle" });
    await capture(
      page,
      "16-student-inspections-list",
      "Student Experience",
      "Lab Inspections — Facility Selection & Duty Schedule",
      "/inspections",
      "Active Student (Edrich B. Bardilas)",
      "Laboratory room directory displaying unit health indicators and open unit checklists for assigned rooms."
    );

    // 17. Inspection Checklist Form
    await page.goto(`${BASE_URL}/inspections/011e5385-834b-4c51-939d-ce15a6c8a998`, { waitUntil: "networkidle" });
    await capture(
      page,
      "17-student-inspection-room-form",
      "Student Experience",
      "Lab Room Inspection Checklist — Computer Lab 1 Workstations Audit",
      "/inspections/011e5385-834b-4c51-939d-ce15a6c8a998",
      "Active Student (Edrich B. Bardilas)",
      "Multi-workstation hardware inspection checklist (PC-01 to PC-10) with condition selectors and defect remarks."
    );

    // 18. Messages
    await page.goto(`${BASE_URL}/messages`, { waitUntil: "networkidle" });
    await capture(
      page,
      "18-student-messages",
      "Student Experience",
      "Direct Messaging — Student & Coordinator Channel",
      "/messages",
      "Active Student (Edrich B. Bardilas)",
      "Integrated communication thread between assigned student and pre-OJT coordinator for real-time duty alignment."
    );

    // 19. Notifications
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: "networkidle" });
    await capture(
      page,
      "19-student-notifications",
      "Student Experience",
      "Notifications & System Alerts — Duty & Review Feedback",
      "/notifications",
      "Active Student (Edrich B. Bardilas)",
      "Chronological notification feed alerting students of task review decisions, schedule reminders, and announcements."
    );

    // 20. Profile
    await page.goto(`${BASE_URL}/profile`, { waitUntil: "networkidle" });
    await capture(
      page,
      "20-student-profile",
      "Student Experience",
      "Account Settings — Student Profile & Security Management",
      "/profile",
      "Active Student (Edrich B. Bardilas)",
      "Student information, program/batch assignment, contact number, and password update panel."
    );

    await context.close();
  }

  console.log("=== STEP 3: CAPTURING COMPLETED STUDENT EXPERIENCE ===");
  {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await login(page, COMPLETED_STUDENT_EMAIL, "/student");

    // 21. Completed Student Dashboard
    await capture(
      page,
      "21-completed-student-dashboard",
      "Completed Student",
      "Student Dashboard — 100-Hour Completion Milestone",
      "/student",
      "Completed Student (Joan P. Inting)",
      "Displaying 100% completed pre-OJT hours, official completion badge, and accredited student standing."
    );

    // 22. Unlocked Accreditation Log PDF
    await page.goto(`${BASE_URL}/attendance`, { waitUntil: "networkidle" });
    await capture(
      page,
      "22-completed-student-attendance-unlocked",
      "Completed Student",
      "Attendance Management — Accreditation Certificate Unlocked",
      "/attendance",
      "Completed Student (Joan P. Inting)",
      "Accreditation certificate download button fully unlocked and available for formal submission."
    );

    await context.close();
  }

  console.log("=== STEP 4: CAPTURING PRE-OJT COORDINATOR / ADMIN EXPERIENCE ===");
  {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await login(page, ADMIN_EMAIL, "/admin");

    // 23. Admin Dashboard
    await capture(
      page,
      "23-admin-dashboard",
      "Coordinator / Admin",
      "Coordinator Dashboard — Pre-OJT Operational Overview",
      "/admin",
      "Pre-OJT Coordinator (Donald Francisco)",
      "Executive metrics showing cohort attendance rates, pending punch reviews, active tasks, and flagged anomalies."
    );

    // 24. Admin Attendance Roster
    await page.goto(`${BASE_URL}/admin/attendance`, { waitUntil: "networkidle" });
    await capture(
      page,
      "24-admin-attendance-roster",
      "Coordinator / Admin",
      "Attendance Management — Review Queue & Roster Filtering",
      "/admin/attendance",
      "Pre-OJT Coordinator (Donald Francisco)",
      "Comprehensive attendance roster featuring multi-parameter filters (status, batch, search), pagination, and review actions."
    );

    // 25. Admin Attendance Review Dialog
    const reviewBtn = page.getByRole("button", { name: "Review" }).first();
    if (await reviewBtn.isVisible()) {
      await reviewBtn.click();
      await page.waitForTimeout(500);
      await capture(
        page,
        "25-admin-attendance-review-dialog",
        "Coordinator / Admin",
        "Attendance Review — Student Duty Photo Evidence & Time Audit",
        "/admin/attendance",
        "Pre-OJT Coordinator (Donald Francisco)",
        "Modal dialog showing student uploaded photo verification, punch timestamp, location metadata, and approve/reject actions."
      );
      // Close modal
      const closeBtn = page.locator('[role="dialog"] button:has-text("Close"), [role="dialog"] button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    // 26. Admin Attendance Correct Dialog
    const moreActionsBtn = page.locator('button[aria-label="More actions"]').first();
    if (await moreActionsBtn.isVisible()) {
      await moreActionsBtn.click();
      await page.waitForTimeout(300);
      const correctOption = page.getByRole("menuitem", { name: /Correct/i }).first();
      if (await correctOption.isVisible()) {
        await correctOption.click();
        await page.waitForTimeout(500);
        await capture(
          page,
          "26-admin-attendance-correct-dialog",
          "Coordinator / Admin",
          "Attendance Correction — Timestamp Adjustment with Mandatory Reason",
          "/admin/attendance",
          "Pre-OJT Coordinator (Donald Francisco)",
          "Administrative adjustment dialog requiring explicit audit justifications before overriding punch records."
        );
        const cancelBtn = page.locator('[role="dialog"] button:has-text("Cancel")').first();
        if (await cancelBtn.isVisible()) await cancelBtn.click();
        else await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
      }
    }

    // 27. Admin Tasks Roster
    await page.goto(`${BASE_URL}/admin/tasks`, { waitUntil: "networkidle" });
    await capture(
      page,
      "27-admin-tasks-roster",
      "Coordinator / Admin",
      "Task Assignment & Review — Active Tasks Roster",
      "/admin/tasks",
      "Pre-OJT Coordinator (Donald Francisco)",
      "Technical duty management catalog tracking assignment distributions, deadlines, and completion statuses across batches."
    );

    // 28. Admin Task Assign Dialog
    const assignBtn = page.getByRole("button", { name: /Assign New Task/i });
    if (await assignBtn.isVisible()) {
      await assignBtn.click();
      await page.waitForTimeout(500);
      await capture(
        page,
        "28-admin-task-assign-dialog",
        "Coordinator / Admin",
        "Assign New Task — Technical Work Dispatch Form",
        "/admin/tasks",
        "Pre-OJT Coordinator (Donald Francisco)",
        "Task configuration modal allowing title, instructions, category, target lab, target units, and student multi-selection."
      );
      const cancelBtn = page.locator('[role="dialog"] button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible()) await cancelBtn.click();
      else await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    // 29. Admin Task Review Detail
    await page.goto(`${BASE_URL}/admin/tasks/3590873a-9894-4562-a7d8-8b69c292fcc7`, { waitUntil: "networkidle" });
    await capture(
      page,
      "29-admin-task-review-detail",
      "Coordinator / Admin",
      "Task Evaluation — Submissions & Remarks Management",
      "/admin/tasks/3590873a-9894-4562-a7d8-8b69c292fcc7",
      "Pre-OJT Coordinator (Donald Francisco)",
      "Detailed submission assessment view displaying student-submitted proof, remark threads, and return-for-revision controls."
    );

    // 30. Admin Students Roster
    await page.goto(`${BASE_URL}/admin/students`, { waitUntil: "networkidle" });
    await capture(
      page,
      "30-admin-students-roster",
      "Coordinator / Admin",
      "Student Directory & Verification — Cohort Hours Tracking",
      "/admin/students",
      "Pre-OJT Coordinator (Donald Francisco)",
      "Student master roster listing student ID numbers, verified email status, total hours rendered, and cohort assignments."
    );

    // 31. Admin Students Import Wizard
    const importBtn = page.getByRole("button", { name: /Import Roster/i });
    if (await importBtn.isVisible()) {
      await importBtn.click();
      await page.waitForTimeout(500);
      await capture(
        page,
        "31-admin-students-import-wizard",
        "Coordinator / Admin",
        "Student Roster Import Wizard — 4-Step Batch Ingestion",
        "/admin/students",
        "Pre-OJT Coordinator (Donald Francisco)",
        "Multi-step spreadsheet ingestion wizard (Step 1: CSV/XLSX Upload, column mapping, preview, confirmation)."
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    // 32. Admin Batches
    await page.goto(`${BASE_URL}/admin/batches`, { waitUntil: "networkidle" });
    await capture(
      page,
      "32-admin-batches-schedules",
      "Coordinator / Admin",
      "Cohorts & Shift Schedules — Batch Configuration",
      "/admin/batches",
      "Pre-OJT Coordinator (Donald Francisco)",
      "Management interface for academic cohorts, assigned coordinators, shift time slots, and grace period rules."
    );

    // 33. Admin Reports Attendance
    await page.goto(`${BASE_URL}/admin/reports`, { waitUntil: "networkidle" });
    await capture(
      page,
      "33-admin-reports-attendance",
      "Coordinator / Admin",
      "Reports & Accreditation — Attendance Summary Report",
      "/admin/reports",
      "Pre-OJT Coordinator (Donald Francisco)",
      "Comprehensive attendance export engine featuring date range pickers, batch filtering, and instant CSV/PDF generation."
    );

    // 34. Admin Reports Tasks
    const reportTypeTrigger = page.locator("#report-type");
    if (await reportTypeTrigger.isVisible()) {
      await reportTypeTrigger.click();
      await page.waitForTimeout(300);
      const taskProgressOption = page
        .locator('[data-slot="select-content"] [data-slot="select-item"]')
        .filter({ hasText: "Task progress" })
        .first();
      if (await taskProgressOption.isVisible()) {
        await taskProgressOption.click();
      }
      const generateBtn = page.getByRole("button", { name: "Generate report" });
      if (await generateBtn.isVisible()) {
        await generateBtn.click();
      }
      await page.waitForTimeout(800);
      await capture(
        page,
        "34-admin-reports-tasks",
        "Coordinator / Admin",
        "Reports & Accreditation — Task Completion Report",
        "/admin/reports",
        "Pre-OJT Coordinator (Donald Francisco)",
        "Task progress analytics displaying assignment distribution, completion statuses, and student workload summaries."
      );
    }

    // 35. Admin Messages
    await page.goto(`${BASE_URL}/messages`, { waitUntil: "networkidle" });
    await capture(
      page,
      "35-admin-messages",
      "Coordinator / Admin",
      "Coordinator Communication Center — Active Student Threads",
      "/messages",
      "Pre-OJT Coordinator (Donald Francisco)",
      "Unified messaging interface allowing coordinators to interact with multiple student batches and field questions."
    );

    // 36. Admin Notifications
    await page.goto(`${BASE_URL}/notifications`, { waitUntil: "networkidle" });
    await capture(
      page,
      "36-admin-notifications",
      "Coordinator / Admin",
      "Coordinator Notifications — System Alerts & Flagged Punches",
      "/notifications",
      "Pre-OJT Coordinator (Donald Francisco)",
      "Centralized alert feed flagging off-schedule student punches, revision resubmissions, and administrative notices."
    );

    // 37. Admin Profile
    await page.goto(`${BASE_URL}/profile`, { waitUntil: "networkidle" });
    await capture(
      page,
      "37-admin-profile",
      "Coordinator / Admin",
      "Coordinator Account Settings — Identity & Security",
      "/profile",
      "Pre-OJT Coordinator (Donald Francisco)",
      "Coordinator profile management, program affiliation, and administrative security credential controls."
    );

    await context.close();
  }

  console.log("=== STEP 5: CAPTURING SUPERADMIN CONSOLE TABS ===");
  {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await login(page, SUPERADMIN_EMAIL, "/superadmin");

    // 38. SuperAdmin Overview
    await capture(
      page,
      "38-superadmin-overview",
      "SuperAdmin Console",
      "SuperAdmin Console — Overview & Operational Telemetry",
      "/superadmin",
      "SuperAdmin (Engr. Roy Imperial)",
      "System telemetry workspace tracking student counts, coordinator quotas, audit volume, and uptime."
    );

    // 39. SuperAdmin Admins Tab
    await page.getByRole("tab", { name: /Admins/i }).click();
    await page.waitForTimeout(500);
    await capture(
      page,
      "39-superadmin-admins",
      "SuperAdmin Console",
      "SuperAdmin Console — Coordinator Accounts Management",
      "/superadmin?tab=admins",
      "SuperAdmin (Engr. Roy Imperial)",
      "Governance tab managing Pre-OJT coordinator accounts, program assignments, and activation toggles."
    );

    // 40. SuperAdmin Create Admin Dialog
    const newAdminBtn = page.getByRole("button", { name: /New Admin/i });
    if (await newAdminBtn.isVisible()) {
      await newAdminBtn.click();
      await page.waitForTimeout(500);
      await capture(
        page,
        "40-superadmin-create-admin-dialog",
        "SuperAdmin Console",
        "SuperAdmin Console — Create Coordinator Account Dialog",
        "/superadmin?tab=admins",
        "SuperAdmin (Engr. Roy Imperial)",
        "Administrative account provisioning modal setting coordinator full name, institutional email, and program roles."
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    // 41. SuperAdmin 100-Hr Config Tab
    await page.getByRole("tab", { name: /100-Hr Config/i }).click();
    await page.waitForTimeout(500);
    await capture(
      page,
      "41-superadmin-config",
      "SuperAdmin Console",
      "SuperAdmin Console — 100-Hour Policy & Task Categories",
      "/superadmin?tab=config",
      "SuperAdmin (Engr. Roy Imperial)",
      "Institution-wide parameter configuration defining required hours, time rounding algorithms, and allowed task categories."
    );

    // 42. SuperAdmin Batches Tab
    await page.getByRole("tab", { name: /Batches/i }).click();
    await page.waitForTimeout(500);
    await capture(
      page,
      "42-superadmin-batches",
      "SuperAdmin Console",
      "SuperAdmin Console — Master Cohort Oversight",
      "/superadmin?tab=batches",
      "SuperAdmin (Engr. Roy Imperial)",
      "Master directory of all student cohorts across academic years with direct coordinator assignments."
    );

    // 43. SuperAdmin Rulings Tab
    await page.getByRole("tab", { name: /Rulings/i }).click();
    await page.waitForTimeout(500);
    await capture(
      page,
      "43-superadmin-rulings",
      "SuperAdmin Console",
      "SuperAdmin Console — Escalations Queue & Final Rulings",
      "/superadmin?tab=rulings",
      "SuperAdmin (Engr. Roy Imperial)",
      "Final arbitration queue for disputed punches and irregular shift escalations requiring institutional rulings."
    );

    // 44. SuperAdmin Audit Tab
    await page.getByRole("tab", { name: /Audit Log/i }).click();
    await page.waitForTimeout(500);
    await capture(
      page,
      "44-superadmin-audit",
      "SuperAdmin Console",
      "SuperAdmin Console — Tamper-Evident System Audit Trail",
      "/superadmin?tab=audit",
      "SuperAdmin (Engr. Roy Imperial)",
      "Comprehensive immutable audit log capturing actor IDs, security actions, entity changes, and timestamps."
    );

    // 45. SuperAdmin Lab Rooms Tab
    await page.getByRole("tab", { name: /Lab Rooms/i }).click();
    await page.waitForTimeout(500);
    await capture(
      page,
      "45-superadmin-rooms",
      "SuperAdmin Console",
      "SuperAdmin Console — Laboratory Facilities & Workstations",
      "/superadmin?tab=rooms",
      "SuperAdmin (Engr. Roy Imperial)",
      "Facility registry managing computer laboratories, terminal counts, and designated equipment units."
    );

    // 46. SuperAdmin Create Room Dialog
    const newRoomBtn = page.getByRole("button", { name: /New Room/i });
    if (await newRoomBtn.isVisible()) {
      await newRoomBtn.click();
      await page.waitForTimeout(500);
      await capture(
        page,
        "46-superadmin-rooms-dialog",
        "SuperAdmin Console",
        "SuperAdmin Console — Create Lab Room Facility Dialog",
        "/superadmin?tab=rooms",
        "SuperAdmin (Engr. Roy Imperial)",
        "Facility provisioning dialog setting room name, building location, and total workstation units."
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    // 47. SuperAdmin Alerts Tab
    await page.getByRole("tab", { name: /Alerts/i }).click();
    await page.waitForTimeout(500);
    await capture(
      page,
      "47-superadmin-alerts",
      "SuperAdmin Console",
      "SuperAdmin Console — System Broadcasts & Global Alerts",
      "/superadmin?tab=alerts",
      "SuperAdmin (Engr. Roy Imperial)",
      "Institutional announcement engine broadcasting maintenance schedules, deadline reminders, and policy advisories."
    );

    // 48. SuperAdmin Chat Policy Enforced
    await page.goto(`${BASE_URL}/messages`, { waitUntil: "networkidle" });
    await capture(
      page,
      "48-superadmin-messages-policy",
      "SuperAdmin Console",
      "SuperAdmin Access Policy — Enforced Chat Restriction",
      "/messages",
      "SuperAdmin (Engr. Roy Imperial)",
      "Demonstrating strict RBAC security enforcement: 'Alerts Only — No Chat Access' restriction on SuperAdmin accounts."
    );

    await context.close();
  }

  console.log("=== STEP 6: CAPTURING THEME SYSTEM ===");
  {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await login(page, STUDENT_EMAIL, "/student");

    // Toggle to dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      localStorage.setItem("techtracker_theme", "dark");
    });
    await page.waitForTimeout(500);

    // 49. Student Dashboard Dark Mode
    await capture(
      page,
      "49-student-dashboard-dark-theme",
      "Theme & Ergonomics",
      "Theme System — Student Dashboard in Dark Mode",
      "/student",
      "Active Student (Edrich B. Bardilas)",
      "Fully responsive dark color palette with WCAG AAA contrast compliance for lab environments."
    );

    await context.close();
  }

  await browser.close();

  console.log(`\nAll ${catalog.length} screenshots captured successfully!`);
  console.log("=== STEP 7: COMPILING HIGH-RESOLUTION HORIZONTAL PDF ===");

  // Write catalog metadata JSON
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, "catalog.json"),
    JSON.stringify(catalog, null, 2),
    "utf8"
  );

  // Generate HTML for the PDF document
  const htmlDoc = generateHtmlSlides(catalog);
  const htmlPath = path.join(SCREENSHOT_DIR, "presentation.html");
  fs.writeFileSync(htmlPath, htmlDoc, "utf8");
  console.log(`Generated HTML slides presentation at: ${htmlPath}`);

  // Launch browser and render PDF
  const pdfBrowser = await chromium.launch({ headless: true });
  const pdfPage = await pdfBrowser.newPage();
  await pdfPage.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
  await pdfPage.waitForTimeout(1000);

  await pdfPage.pdf({
    path: PDF_OUTPUT,
    width: "1920px",
    height: "1080px",
    printBackground: true,
    margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
  });

  await pdfBrowser.close();
  console.log(`\n======================================================`);
  console.log(`SUCCESS! Complete horizontal PDF exported to:`);
  console.log(PDF_OUTPUT);
  console.log(`======================================================`);
}

function generateHtmlSlides(items: ShotItem[]): string {
  const totalSlides = items.length + 1; // +1 for cover

  const coverSlide = `
    <section class="slide cover-slide">
      <div class="cover-glow"></div>
      <div class="cover-content">
        <div class="institution-badge">ACLC COLLEGE OF MANDAUE • PRE-OJT TECHNICAL MONITORING</div>
        <h1 class="cover-title">TechTracker System</h1>
        <p class="cover-subtitle">Complete Architecture, Interface & Role-Based Views Walkthrough</p>
        
        <div class="cover-meta-grid">
          <div class="meta-card">
            <span class="meta-label">Total Documented Views</span>
            <span class="meta-val">${items.length} Views</span>
          </div>
          <div class="meta-card">
            <span class="meta-label">Page Orientation</span>
            <span class="meta-val">Horizontal / Landscape (16:9)</span>
          </div>
          <div class="meta-card">
            <span class="meta-label">Resolution</span>
            <span class="meta-val">1920 × 1080 Full HD</span>
          </div>
          <div class="meta-card">
            <span class="meta-label">Roles Covered</span>
            <span class="meta-val">Public • Student • Coordinator • SuperAdmin</span>
          </div>
        </div>

        <div class="cover-toc">
          <div class="toc-col">
            <div class="toc-header">1. Public & Authentication (8 Views)</div>
            <div class="toc-sub">Landing hero, features, workflow, login, registration, password recovery, dev outbox.</div>
          </div>
          <div class="toc-col">
            <div class="toc-header">2. Student Experience (12 Views)</div>
            <div class="toc-sub">Dashboard, 100-hr ledger, duty punch, task reports, lab inspections, messaging, profile.</div>
          </div>
          <div class="toc-col">
            <div class="toc-header">3. Completed Student (2 Views)</div>
            <div class="toc-sub">100% completion milestone, unlocked accreditation log PDF certificate.</div>
          </div>
          <div class="toc-col">
            <div class="toc-header">4. Coordinator / Admin (15 Views)</div>
            <div class="toc-sub">Analytics, attendance audit dialogs, task reviews, import wizard, reports, batches.</div>
          </div>
          <div class="toc-col">
            <div class="toc-header">5. SuperAdmin Console (11 Views)</div>
            <div class="toc-sub">Telemetry, admin creation, 100-hr config, audit log, lab rooms, escalation rulings.</div>
          </div>
          <div class="toc-col">
            <div class="toc-header">6. Theme & Ergonomics (1 View)</div>
            <div class="toc-sub">WCAG AAA dark theme variant for lab conditions.</div>
          </div>
        </div>

        <div class="cover-footer">
          <span>Capstone Project Documentation</span>
          <span>•</span>
          <span>TechTracker v1.0.0</span>
          <span>•</span>
          <span>Generated: November 24, 2026</span>
        </div>
      </div>
    </section>
  `;

  const contentSlides = items.map((item, index) => {
    const slideNumber = index + 2;
    const imgDataUri = `data:image/png;base64,${fs.readFileSync(path.join(SCREENSHOT_DIR, item.imageFile)).toString("base64")}`;

    return `
      <section class="slide">
        <!-- Slide Header -->
        <header class="slide-header">
          <div class="header-left">
            <span class="category-badge">${escapeHtml(item.category)}</span>
            <h2 class="slide-title">${escapeHtml(item.title)}</h2>
          </div>
          <div class="header-right">
            <div class="badge-role">${escapeHtml(item.role)}</div>
            <div class="badge-route"><code>${escapeHtml(item.route)}</code></div>
            <div class="slide-number">Page ${slideNumber} / ${totalSlides}</div>
          </div>
        </header>

        <!-- Slide Body (Screenshot Frame) -->
        <main class="slide-body">
          <div class="screenshot-frame">
            <img class="screenshot-img" src="${imgDataUri}" alt="${escapeHtml(item.title)}" />
          </div>
        </main>

        <!-- Slide Footer -->
        <footer class="slide-footer">
          <div class="footer-desc">
            <span class="desc-bullet">•</span>
            <span>${escapeHtml(item.description)}</span>
          </div>
          <div class="footer-system">TechTracker 100-Hour Pre-OJT Monitoring System</div>
        </footer>
      </section>
    `;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TechTracker — All Views Horizontal Walkthrough</title>
  <style>
    @page {
      size: 1920px 1080px;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background: #090d16;
      font-family: "Plus Jakarta Sans", sans-serif;
      color: #f1f5f9;
      -webkit-font-smoothing: antialiased;
    }
    .slide {
      width: 1920px;
      height: 1080px;
      page-break-after: always;
      page-break-inside: avoid;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #090d16;
    }
    
    /* Cover Slide */
    .cover-slide {
      justify-content: center;
      align-items: center;
      padding: 60px 100px;
      background: radial-gradient(circle at 50% 30%, #1e293b 0%, #090d16 80%);
    }
    .cover-glow {
      position: absolute;
      top: -150px;
      left: 50%;
      transform: translateX(-50%);
      width: 1200px;
      height: 400px;
      background: radial-gradient(circle, rgba(14, 165, 233, 0.25) 0%, rgba(14, 165, 233, 0) 70%);
      pointer-events: none;
    }
    .cover-content {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 1680px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .institution-badge {
      display: inline-block;
      padding: 8px 20px;
      background: rgba(14, 165, 233, 0.15);
      border: 1px solid rgba(14, 165, 233, 0.4);
      color: #38bdf8;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.12em;
      margin-bottom: 24px;
    }
    .cover-title {
      font-size: 72px;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: #ffffff;
      margin-bottom: 16px;
      text-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    .cover-subtitle {
      font-size: 26px;
      color: #94a3b8;
      font-weight: 400;
      max-width: 900px;
      margin-bottom: 48px;
    }
    .cover-meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      width: 100%;
      margin-bottom: 40px;
    }
    .meta-card {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      backdrop-filter: blur(8px);
    }
    .meta-label {
      font-size: 13px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 600;
    }
    .meta-val {
      font-size: 20px;
      color: #f8fafc;
      font-weight: 700;
    }
    .cover-toc {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      width: 100%;
      text-align: left;
      margin-bottom: 40px;
    }
    .toc-col {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 10px;
      padding: 16px 20px;
    }
    .toc-header {
      font-size: 15px;
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 6px;
    }
    .toc-sub {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.4;
    }
    .cover-footer {
      display: flex;
      gap: 14px;
      font-size: 14px;
      color: #64748b;
      font-weight: 500;
    }

    /* Content Slides */
    .slide-header {
      height: 64px;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 36px;
      flex-shrink: 0;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .category-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: #1e293b;
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .slide-title {
      font-size: 20px;
      font-weight: 700;
      color: #f8fafc;
      letter-spacing: -0.01em;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .badge-role {
      font-size: 13px;
      font-weight: 600;
      color: #a5b4fc;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      padding: 4px 12px;
      border-radius: 6px;
    }
    .badge-route code {
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      color: #6ee7b7;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 4px 10px;
      border-radius: 6px;
    }
    .slide-number {
      font-size: 13px;
      font-weight: 700;
      color: #94a3b8;
      background: #1e293b;
      padding: 4px 12px;
      border-radius: 6px;
    }

    .slide-body {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 16px 36px;
      overflow: hidden;
      background: #020617;
    }
    .screenshot-frame {
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #0b1120;
      border-radius: 10px;
      border: 1px solid #1e293b;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      overflow: hidden;
    }
    .screenshot-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }

    .slide-footer {
      height: 44px;
      background: #0f172a;
      border-top: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 36px;
      flex-shrink: 0;
      font-size: 13px;
      color: #94a3b8;
    }
    .footer-desc {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .desc-bullet {
      color: #38bdf8;
      font-size: 16px;
    }
    .footer-system {
      color: #64748b;
      font-weight: 500;
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  ${coverSlide}
  ${contentSlides}
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

main().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
