use printpdf::*;

#[derive(Debug, Clone)]
pub struct AccreditationStudent {
    pub full_name: String,
    pub student_id_no: Option<String>,
    pub program: Option<String>,
    pub section: Option<String>,
    pub required_hours: f64,
}

#[derive(Debug, Clone)]
pub struct AccreditationLog {
    pub shift_date: String,
    pub time_in: String,
    pub time_out: Option<String>,
    pub credited_hours: f64,
    pub is_irregular: bool,
}

#[derive(Debug, Clone)]
pub struct InspectionSummaryRow {
    pub room: String,
    pub unit_code: String,
    pub condition: String,
    pub remarks: String,
    pub photo_key: Option<String>,
    pub inspected_at: String,
    pub inspector: String,
}

#[allow(clippy::vec_init_then_push)]
pub fn generate_accreditation_pdf(
    student: &AccreditationStudent,
    logs: &[AccreditationLog],
) -> Vec<u8> {
    let mut ops: Vec<Op> = Vec::new();
    // Title
    ops.push(Op::SaveGraphicsState);
    ops.push(Op::StartTextSection);
    ops.push(Op::SetTextCursor {
        pos: Point::new(Mm(14.0), Mm(278.0)),
    });
    ops.push(Op::SetFont {
        font: PdfFontHandle::Builtin(BuiltinFont::HelveticaBold),
        size: Pt(14.0),
    });
    ops.push(Op::SetLineHeight { lh: Pt(14.0) });
    ops.push(Op::ShowText {
        items: vec![TextItem::Text(
            "100-Hour Internal Duty Accreditation Summary Log".to_string(),
        )],
    });
    ops.push(Op::EndTextSection);
    ops.push(Op::RestoreGraphicsState);

    // Subtitle + student info
    let info_lines = [
        (
            14.0f32,
            271.0f32,
            9.0f32,
            "TechTracker - ACLC College of Mandaue".to_string(),
        ),
        (14.0, 265.0, 9.0, format!("Student: {}", student.full_name)),
        (
            14.0,
            260.0,
            9.0,
            format!(
                "Student ID: {}",
                student
                    .student_id_no
                    .clone()
                    .unwrap_or_else(|| "—".to_string())
            ),
        ),
        (
            14.0,
            255.0,
            9.0,
            format!(
                "Program / Section: {} / {}",
                student.program.clone().unwrap_or_else(|| "—".to_string()),
                student.section.clone().unwrap_or_else(|| "—".to_string())
            ),
        ),
        (
            14.0,
            250.0,
            9.0,
            format!("Required hours: {:.2}", student.required_hours),
        ),
    ];
    // render info lines
    ops.push(Op::SaveGraphicsState);
    ops.push(Op::StartTextSection);
    for (x, y, size, text) in &info_lines {
        ops.push(Op::SetTextCursor {
            pos: Point::new(Mm(*x), Mm(*y)),
        });
        ops.push(Op::SetFont {
            font: PdfFontHandle::Builtin(BuiltinFont::Helvetica),
            size: Pt(*size),
        });
        ops.push(Op::SetLineHeight { lh: Pt(*size) });
        ops.push(Op::ShowText {
            items: vec![TextItem::Text(text.clone())],
        });
    }
    ops.push(Op::EndTextSection);
    ops.push(Op::RestoreGraphicsState);

    // Table header
    let header_y = 242.0f32;
    let cols = [14.0f32, 40.0, 66.0, 92.0, 118.0];
    let headers = ["Date", "Time-In", "Time-Out", "Credited", "Status"];
    ops.push(Op::SaveGraphicsState);
    ops.push(Op::StartTextSection);
    for (i, h) in headers.iter().enumerate() {
        ops.push(Op::SetTextCursor {
            pos: Point::new(Mm(cols[i]), Mm(header_y)),
        });
        ops.push(Op::SetFont {
            font: PdfFontHandle::Builtin(BuiltinFont::HelveticaBold),
            size: Pt(8.0),
        });
        ops.push(Op::SetLineHeight { lh: Pt(8.0) });
        ops.push(Op::ShowText {
            items: vec![TextItem::Text(h.to_string())],
        });
    }
    ops.push(Op::EndTextSection);
    ops.push(Op::RestoreGraphicsState);

    // Table rows
    let mut y = header_y - 6.0;
    let mut total = 0.0f64;
    for log in logs {
        let row = [
            log.shift_date.clone(),
            log.time_in.clone(),
            log.time_out.clone().unwrap_or_else(|| "—".to_string()),
            format!("{:.2}", log.credited_hours),
            if log.is_irregular {
                "Irregular".to_string()
            } else {
                "Approved".to_string()
            },
        ];
        ops.push(Op::SaveGraphicsState);
        ops.push(Op::StartTextSection);
        for (i, cell) in row.iter().enumerate() {
            ops.push(Op::SetTextCursor {
                pos: Point::new(Mm(cols[i]), Mm(y)),
            });
            ops.push(Op::SetFont {
                font: PdfFontHandle::Builtin(BuiltinFont::Helvetica),
                size: Pt(8.0),
            });
            ops.push(Op::SetLineHeight { lh: Pt(8.0) });
            ops.push(Op::ShowText {
                items: vec![TextItem::Text(cell.clone())],
            });
        }
        ops.push(Op::EndTextSection);
        ops.push(Op::RestoreGraphicsState);
        total += log.credited_hours;
        y -= 5.0;
        if y < 20.0 {
            break;
        }
    }

    // Total line
    let final_y = y - 4.0;
    ops.push(Op::SaveGraphicsState);
    ops.push(Op::StartTextSection);
    ops.push(Op::SetTextCursor {
        pos: Point::new(Mm(14.0), Mm(final_y)),
    });
    ops.push(Op::SetFont {
        font: PdfFontHandle::Builtin(BuiltinFont::HelveticaBold),
        size: Pt(10.0),
    });
    ops.push(Op::SetLineHeight { lh: Pt(10.0) });
    ops.push(Op::ShowText {
        items: vec![TextItem::Text(format!(
            "Total credited hours: {:.2}",
            total
        ))],
    });
    ops.push(Op::EndTextSection);
    ops.push(Op::RestoreGraphicsState);

    let page = PdfPage::new(Mm(210.0), Mm(297.0), ops);
    let mut doc = PdfDocument::new("Accreditation");
    doc.pages.push(page);
    let mut warnings = Vec::new();
    doc.save(&PdfSaveOptions::default(), &mut warnings)
}

#[allow(clippy::vec_init_then_push)]
pub fn generate_operational_report_pdf(
    title: &str,
    headers: &[&str],
    rows: &[Vec<String>],
) -> Vec<u8> {
    let mut ops: Vec<Op> = Vec::new();
    ops.push(Op::SaveGraphicsState);
    ops.push(Op::StartTextSection);
    ops.push(Op::SetTextCursor {
        pos: Point::new(Mm(14.0), Mm(278.0)),
    });
    ops.push(Op::SetFont {
        font: PdfFontHandle::Builtin(BuiltinFont::HelveticaBold),
        size: Pt(12.0),
    });
    ops.push(Op::SetLineHeight { lh: Pt(12.0) });
    ops.push(Op::ShowText {
        items: vec![TextItem::Text(title.to_string())],
    });
    ops.push(Op::EndTextSection);
    ops.push(Op::RestoreGraphicsState);

    let cols = [14.0f32, 54.0, 94.0, 134.0, 174.0];
    let mut y = 266.0f32;
    ops.push(Op::SaveGraphicsState);
    ops.push(Op::StartTextSection);
    for (i, h) in headers.iter().enumerate() {
        ops.push(Op::SetTextCursor {
            pos: Point::new(Mm(cols[i]), Mm(y)),
        });
        ops.push(Op::SetFont {
            font: PdfFontHandle::Builtin(BuiltinFont::HelveticaBold),
            size: Pt(8.0),
        });
        ops.push(Op::SetLineHeight { lh: Pt(8.0) });
        ops.push(Op::ShowText {
            items: vec![TextItem::Text(h.to_string())],
        });
    }
    ops.push(Op::EndTextSection);
    ops.push(Op::RestoreGraphicsState);

    y -= 6.0;
    for row in rows {
        ops.push(Op::SaveGraphicsState);
        ops.push(Op::StartTextSection);
        for (i, cell) in row.iter().enumerate().take(cols.len()) {
            ops.push(Op::SetTextCursor {
                pos: Point::new(Mm(cols[i]), Mm(y)),
            });
            ops.push(Op::SetFont {
                font: PdfFontHandle::Builtin(BuiltinFont::Helvetica),
                size: Pt(8.0),
            });
            ops.push(Op::SetLineHeight { lh: Pt(8.0) });
            ops.push(Op::ShowText {
                items: vec![TextItem::Text(cell.clone())],
            });
        }
        ops.push(Op::EndTextSection);
        ops.push(Op::RestoreGraphicsState);
        y -= 5.0;
        if y < 20.0 {
            break;
        }
    }

    let page = PdfPage::new(Mm(210.0), Mm(297.0), ops);
    let mut doc = PdfDocument::new(title);
    doc.pages.push(page);
    let mut warnings = Vec::new();
    doc.save(&PdfSaveOptions::default(), &mut warnings)
}

#[allow(clippy::vec_init_then_push)]
pub fn generate_inspection_pdf(rows: &[InspectionSummaryRow]) -> Vec<u8> {
    let mut ops: Vec<Op> = Vec::new();
    ops.push(Op::SaveGraphicsState);
    ops.push(Op::StartTextSection);
    ops.push(Op::SetTextCursor {
        pos: Point::new(Mm(14.0), Mm(278.0)),
    });
    ops.push(Op::SetFont {
        font: PdfFontHandle::Builtin(BuiltinFont::HelveticaBold),
        size: Pt(12.0),
    });
    ops.push(Op::SetLineHeight { lh: Pt(12.0) });
    ops.push(Op::ShowText {
        items: vec![TextItem::Text(
            "Lab Condition Summary Report — Room/Unit Inspection".to_string(),
        )],
    });
    ops.push(Op::EndTextSection);
    ops.push(Op::RestoreGraphicsState);

    let header_y = 268.0f32;
    let cols = [14.0f32, 34.0, 54.0, 74.0, 94.0, 114.0, 134.0];
    let headers = [
        "Room",
        "Unit",
        "Condition",
        "Remarks",
        "Photo",
        "Inspected",
        "Inspector",
    ];
    ops.push(Op::SaveGraphicsState);
    ops.push(Op::StartTextSection);
    for (i, h) in headers.iter().enumerate() {
        ops.push(Op::SetTextCursor {
            pos: Point::new(Mm(cols[i]), Mm(header_y)),
        });
        ops.push(Op::SetFont {
            font: PdfFontHandle::Builtin(BuiltinFont::HelveticaBold),
            size: Pt(7.0),
        });
        ops.push(Op::SetLineHeight { lh: Pt(7.0) });
        ops.push(Op::ShowText {
            items: vec![TextItem::Text(h.to_string())],
        });
    }
    ops.push(Op::EndTextSection);
    ops.push(Op::RestoreGraphicsState);

    let mut y = header_y - 5.0;
    for row in rows {
        let cells = [
            row.room.clone(),
            row.unit_code.clone(),
            row.condition.clone(),
            if row.remarks.len() > 20 {
                format!("{}...", &row.remarks[..20])
            } else {
                row.remarks.clone()
            },
            row.photo_key.clone().unwrap_or_else(|| "—".to_string()),
            row.inspected_at.clone(),
            if row.inspector.len() > 14 {
                format!("{}...", &row.inspector[..14])
            } else {
                row.inspector.clone()
            },
        ];
        ops.push(Op::SaveGraphicsState);
        ops.push(Op::StartTextSection);
        for (i, cell) in cells.iter().enumerate() {
            ops.push(Op::SetTextCursor {
                pos: Point::new(Mm(cols[i]), Mm(y)),
            });
            ops.push(Op::SetFont {
                font: PdfFontHandle::Builtin(BuiltinFont::Helvetica),
                size: Pt(7.0),
            });
            ops.push(Op::SetLineHeight { lh: Pt(7.0) });
            ops.push(Op::ShowText {
                items: vec![TextItem::Text(cell.clone())],
            });
        }
        ops.push(Op::EndTextSection);
        ops.push(Op::RestoreGraphicsState);
        y -= 4.0;
        if y < 20.0 {
            break;
        }
    }

    let page = PdfPage::new(Mm(210.0), Mm(297.0), ops);
    let mut doc = PdfDocument::new("Inspection");
    doc.pages.push(page);
    let mut warnings = Vec::new();
    doc.save(&PdfSaveOptions::default(), &mut warnings)
}
