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

fn push_table_header(ops: &mut Vec<Op>, headers: &[&str], cols: &[f32], y: f32, size: f32) {
    ops.push(Op::SaveGraphicsState);
    ops.push(Op::StartTextSection);
    for (i, header) in headers.iter().enumerate() {
        ops.push(Op::SetTextCursor {
            pos: Point::new(Mm(cols[i]), Mm(y)),
        });
        ops.push(Op::SetFont {
            font: PdfFontHandle::Builtin(BuiltinFont::HelveticaBold),
            size: Pt(size),
        });
        ops.push(Op::SetLineHeight { lh: Pt(size) });
        ops.push(Op::ShowText {
            items: vec![TextItem::Text(header.to_string())],
        });
    }
    ops.push(Op::EndTextSection);
    ops.push(Op::RestoreGraphicsState);
}

fn total_credited_hours(logs: &[AccreditationLog]) -> f64 {
    logs.iter().map(|l| l.credited_hours).sum()
}

fn truncate_chars(value: &str, max: usize) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() > max {
        format!("{}...", chars[..max].iter().collect::<String>())
    } else {
        value.to_string()
    }
}

fn push_accreditation_table_header(ops: &mut Vec<Op>, header_y: f32) {
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
    let cols = [14.0f32, 40.0, 66.0, 92.0, 118.0];
    push_accreditation_table_header(&mut ops, 242.0);

    // Table rows, spilling onto new pages instead of truncating the log.
    let mut pages: Vec<PdfPage> = Vec::new();
    let mut y = 236.0f32;
    let total = total_credited_hours(logs);
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
        y -= 5.0;
        if y < 24.0 {
            pages.push(PdfPage::new(Mm(210.0), Mm(297.0), ops));
            ops = Vec::new();
            push_accreditation_table_header(&mut ops, 268.0);
            y = 262.0;
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

    pages.push(PdfPage::new(Mm(210.0), Mm(297.0), ops));
    let mut doc = PdfDocument::new("Accreditation");
    doc.pages.extend(pages);
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
    push_table_header(&mut ops, headers, &cols, y, 8.0);
    y -= 6.0;
    let mut pages: Vec<PdfPage> = Vec::new();
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
        if y < 24.0 {
            pages.push(PdfPage::new(Mm(210.0), Mm(297.0), ops));
            ops = Vec::new();
            push_table_header(&mut ops, headers, &cols, 266.0, 8.0);
            y = 260.0;
        }
    }

    pages.push(PdfPage::new(Mm(210.0), Mm(297.0), ops));
    let mut doc = PdfDocument::new(title);
    doc.pages.extend(pages);
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
    push_table_header(&mut ops, &headers, &cols, header_y, 7.0);

    let mut y = header_y - 5.0;
    let mut pages: Vec<PdfPage> = Vec::new();
    for row in rows {
        let cells = [
            row.room.clone(),
            row.unit_code.clone(),
            row.condition.clone(),
            truncate_chars(&row.remarks, 20),
            row.photo_key.clone().unwrap_or_else(|| "—".to_string()),
            row.inspected_at.clone(),
            truncate_chars(&row.inspector, 14),
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
        if y < 24.0 {
            pages.push(PdfPage::new(Mm(210.0), Mm(297.0), ops));
            ops = Vec::new();
            push_table_header(&mut ops, &headers, &cols, header_y, 7.0);
            y = header_y - 5.0;
        }
    }

    pages.push(PdfPage::new(Mm(210.0), Mm(297.0), ops));
    let mut doc = PdfDocument::new("Inspection");
    doc.pages.extend(pages);
    let mut warnings = Vec::new();
    doc.save(&PdfSaveOptions::default(), &mut warnings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accreditation_pdf_spills_to_multiple_pages_and_sums_every_row() {
        let student = AccreditationStudent {
            full_name: "Test Student".into(),
            student_id_no: Some("2026-00001".into()),
            program: Some("BSIT".into()),
            section: Some("4A".into()),
            required_hours: 100.0,
        };
        let logs: Vec<AccreditationLog> = (0..60)
            .map(|i| AccreditationLog {
                shift_date: format!("2026-11-{:02}", i % 28 + 1),
                time_in: "08:00".into(),
                time_out: Some("17:00".into()),
                credited_hours: 1.0,
                is_irregular: false,
            })
            .collect();
        let pdf = generate_accreditation_pdf(&student, &logs);
        let text = String::from_utf8_lossy(&pdf);
        assert!(
            text.matches("/Type/Page").count() >= 2,
            "expected multiple pages"
        );
        assert_eq!(total_credited_hours(&logs), 60.0);
    }

    #[test]
    fn report_pdfs_spill_instead_of_dropping_rows() {
        let headers = ["A", "B", "C", "D", "E"];
        let rows: Vec<Vec<String>> = (0..200)
            .map(|i| {
                vec![
                    i.to_string(),
                    "x".into(),
                    "y".into(),
                    "z".into(),
                    "w".into(),
                ]
            })
            .collect();
        let operational_pdf = generate_operational_report_pdf("Report", &headers, &rows);
        let operational = String::from_utf8_lossy(&operational_pdf);
        assert!(
            operational.matches("/Type/Page").count() >= 4,
            "operational PDF must use several pages"
        );

        let inspection_rows: Vec<InspectionSummaryRow> = (0..200)
            .map(|i| InspectionSummaryRow {
                room: format!("Room {i}"),
                unit_code: format!("PC-{i}"),
                condition: "FUNCTIONING".into(),
                remarks: String::new(),
                photo_key: None,
                inspected_at: "2026-11-27 08:00".into(),
                inspector: "Tester".into(),
            })
            .collect();
        let inspection_pdf = generate_inspection_pdf(&inspection_rows);
        let inspection = String::from_utf8_lossy(&inspection_pdf);
        assert!(
            inspection.matches("/Type/Page").count() >= 4,
            "inspection PDF must use several pages"
        );
    }

    #[test]
    fn inspection_pdf_truncates_multibyte_text_without_panicking() {
        let remark = "Maayos — ✅".repeat(10);
        let rows = vec![InspectionSummaryRow {
            room: "Lab 1".into(),
            unit_code: "PC-1".into(),
            condition: "FUNCTIONING".into(),
            remarks: remark.clone(),
            photo_key: None,
            inspected_at: "2026-11-27 08:00".into(),
            inspector: "Engr. — ✅Reviewer".into(),
        }];
        let pdf = generate_inspection_pdf(&rows);
        assert!(!pdf.is_empty());
        assert_ne!(truncate_chars(&remark, 20), remark);
        assert!(truncate_chars("Maayos — ✅", 20).chars().count() <= 20);
    }
}
