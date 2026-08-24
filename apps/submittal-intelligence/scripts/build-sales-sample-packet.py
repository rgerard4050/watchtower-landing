from pathlib import Path
import shutil

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / "output" / "pdf" / "morrow-sample-correction-packet.pdf"
DEPLOY_COPY = ROOT / "apps" / "submittal-intelligence" / "morrow-sample-correction-packet.pdf"

INK = colors.HexColor("#102019")
GREEN = colors.HexColor("#118755")
DARK_GREEN = colors.HexColor("#063F2A")
PALE_GREEN = colors.HexColor("#EAF7F0")
PALE_AMBER = colors.HexColor("#FFF3D8")
AMBER = colors.HexColor("#B76B00")
PALE_RED = colors.HexColor("#FDEBEC")
RED = colors.HexColor("#A72D38")
MUTED = colors.HexColor("#5D6D64")
LINE = colors.HexColor("#CFDDD5")
WHITE = colors.white


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=28, leading=31, textColor=DARK_GREEN, alignment=TA_LEFT,
            spaceAfter=10,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle", parent=base["BodyText"], fontName="Helvetica",
            fontSize=11, leading=16, textColor=MUTED, spaceAfter=12,
        ),
        "eyebrow": ParagraphStyle(
            "Eyebrow", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=7.5, leading=10, textColor=GREEN, spaceAfter=6,
        ),
        "h1": ParagraphStyle(
            "H1", parent=base["Heading1"], fontName="Helvetica-Bold",
            fontSize=18, leading=22, textColor=DARK_GREEN, spaceBefore=4, spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "H2", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=12, leading=15, textColor=INK, spaceBefore=8, spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["BodyText"], fontName="Helvetica",
            fontSize=9, leading=13, textColor=INK, spaceAfter=6,
        ),
        "small": ParagraphStyle(
            "Small", parent=base["BodyText"], fontName="Helvetica",
            fontSize=7.5, leading=10.5, textColor=MUTED,
        ),
        "small_bold": ParagraphStyle(
            "SmallBold", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=7.5, leading=10.5, textColor=INK,
        ),
        "metric": ParagraphStyle(
            "Metric", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=20, leading=22, textColor=DARK_GREEN, alignment=TA_CENTER,
        ),
        "metric_label": ParagraphStyle(
            "MetricLabel", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=6.5, leading=8, textColor=MUTED, alignment=TA_CENTER,
        ),
        "decision": ParagraphStyle(
            "Decision", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=16, leading=19, textColor=AMBER, alignment=TA_CENTER,
        ),
        "table_head": ParagraphStyle(
            "TableHead", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=6.5, leading=8, textColor=WHITE,
        ),
        "table": ParagraphStyle(
            "Table", parent=base["BodyText"], fontName="Helvetica",
            fontSize=6.5, leading=8.5, textColor=INK,
        ),
        "table_bold": ParagraphStyle(
            "TableBold", parent=base["BodyText"], fontName="Helvetica-Bold",
            fontSize=6.5, leading=8.5, textColor=INK,
        ),
        "draft": ParagraphStyle(
            "Draft", parent=base["BodyText"], fontName="Courier",
            fontSize=8.2, leading=12, textColor=INK,
        ),
    }


S = styles()


def p(text, style="body"):
    return Paragraph(text, S[style])


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = letter
    canvas.setFillColor(DARK_GREEN)
    canvas.rect(0, height - 0.45 * inch, width, 0.45 * inch, stroke=0, fill=1)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(0.55 * inch, height - 0.29 * inch, "WATCHTOWER  |  MORROW")
    canvas.setFont("Helvetica", 7)
    canvas.drawRightString(width - 0.55 * inch, height - 0.29 * inch, "SYNTHETIC SALES SAMPLE - NO CUSTOMER DATA")
    canvas.setStrokeColor(LINE)
    canvas.line(0.55 * inch, 0.52 * inch, width - 0.55 * inch, 0.52 * inch)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 6.7)
    canvas.drawString(0.55 * inch, 0.32 * inch, "AI-assisted preflight only. Contractor and design professionals retain final review and approval authority.")
    canvas.drawRightString(width - 0.55 * inch, 0.32 * inch, f"Page {doc.page}")
    canvas.restoreState()


def callout(title, body, fill=PALE_GREEN, border=GREEN):
    table = Table([[p(title, "small_bold"), p(body, "small")]], colWidths=[1.35 * inch, 5.55 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("BOX", (0, 0), (-1, -1), 0.7, border),
        ("LINEAFTER", (0, 0), (0, -1), 0.5, border),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def build_story():
    story = []
    story += [
        Spacer(1, 0.10 * inch),
        p("CONTRACTOR SUBMITTAL PREFLIGHT", "eyebrow"),
        p("Morrow Correction Packet", "title"),
        p("A source-cited, contractor-ready example showing what to correct before a formal GC or design-professional review.", "subtitle"),
    ]

    project = Table([
        [p("PROJECT", "small_bold"), p("Pine Street Community Center (synthetic)", "small"),
         p("TRADE", "small_bold"), p("HVAC equipment", "small")],
        [p("INPUT 1", "small_bold"), p("Governing specification", "small"),
         p("INPUT 2", "small_bold"), p("Contractor product submittal", "small")],
    ], colWidths=[0.80 * inch, 2.20 * inch, 0.80 * inch, 3.10 * inch])
    project.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F5F8F6")),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story += [project, Spacer(1, 0.16 * inch)]

    decision = Table([[p("PREFLIGHT DECISION", "metric_label")], [p("REVISE BEFORE REVIEW", "decision")]], colWidths=[6.9 * inch])
    decision.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE_AMBER),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#E4B24B")),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 10),
    ]))
    story += [decision, Spacer(1, 0.18 * inch)]

    metrics = Table([
        [p("6", "metric"), p("5", "metric"), p("3", "metric"), p("3", "metric")],
        [p("REQUIREMENTS", "metric_label"), p("CONFLICTS", "metric_label"), p("MISSING DOCUMENTS", "metric_label"), p("PRIORITY RISKS", "metric_label")],
    ], colWidths=[1.725 * inch] * 4)
    metrics.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE_GREEN),
        ("BOX", (0, 0), (-1, -1), 0.7, GREEN),
        ("INNERGRID", (0, 0), (-1, -1), 0.45, LINE),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 3),
        ("TOPPADDING", (0, 1), (-1, 1), 2),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
    ]))
    story += [metrics, Spacer(1, 0.16 * inch)]

    story += [
        p("Executive summary", "h1"),
        p("The proposed 3.5-ton R-410A system does not match the 3-ton R-32 basis of design. It also misses minimum efficiency, sound, electrical, accessory, certification, and warranty requirements. The package should be corrected or submitted with a clearly identified deviation request before formal review."),
        callout("WHY THIS MATTERS", "This example turns a likely rejection into a specific worklist. Morrow does not approve products or replace professional judgment; it makes the contractor's next action visible."),
        Spacer(1, 0.12 * inch),
        p("Priority risks", "h1"),
    ]

    risks = [
        [p("SEVERITY", "table_head"), p("FINDING", "table_head"), p("CONTRACTOR ACTION", "table_head")],
        [p("HIGH", "table_bold"), p("Proposed system is not a compliant equivalent.", "table"), p("Select a compliant matched system or submit a design-change request with calculations.", "table")],
        [p("HIGH", "table_bold"), p("Electrical values exceed the specified MCA and MOCP limits.", "table"), p("Recheck feeder and disconnect coordination before submission.", "table")],
        [p("MEDIUM", "table_bold"), p("Required point-by-point deviation comparison is absent.", "table"), p("List every exception and cite the corresponding specification requirement.", "table")],
    ]
    risk_table = Table(risks, colWidths=[0.7 * inch, 2.45 * inch, 3.75 * inch], repeatRows=1)
    risk_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK_GREEN),
        ("BACKGROUND", (0, 1), (0, 2), PALE_RED),
        ("TEXTCOLOR", (0, 1), (0, 2), RED),
        ("BACKGROUND", (0, 3), (0, 3), PALE_AMBER),
        ("TEXTCOLOR", (0, 3), (0, 3), AMBER),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story += [risk_table, PageBreak()]

    story += [p("SOURCE-CITED COMPARISON", "eyebrow"), p("Requirement Matrix", "h1"), p("Each row pairs the governing requirement with submitted evidence and a contractor-ready fix.", "subtitle")]

    requirements = [
        ("R-1", "CONFLICT", "3 tons; at least 34,000 Btu/h", "3.5 tons; 40,200 Btu/h", "Select the specified capacity or document an approved design change.", "Spec p.1 - Performance"),
        ("R-2", "CONFLICT", "Minimum 15.0 SEER2 / 8.0 HSPF2", "14.3 SEER2 / 7.5 HSPF2", "Provide certified data for a matched system meeting both ratings.", "Spec p.1 - Performance"),
        ("R-3", "CONFLICT", "Factory-charged R-32 refrigerant", "R-410A", "Replace with an R-32 system; do not treat an adapter as equivalency.", "Spec p.1 - Performance"),
        ("R-4", "CONFLICT", "Outdoor sound not greater than 72 dBA", "74 dBA", "Select quieter equipment or submit a written deviation request.", "Spec p.1 - Performance"),
        ("R-5", "CONFLICT", "MCA not greater than 24 A; MOCP 35 A max", "MCA 26 A; MOCP 40 A", "Coordinate feeder and disconnect; submit compliant nameplate data.", "Spec p.1 - Electrical"),
        ("R-6", "MISSING", "Low ambient, coastal coating, BACnet, warranty", "Required options not identified", "Add option codes, accessory schedule, and written warranty.", "Spec p.2 - Quality"),
    ]
    rows = [[p("ID / STATUS", "table_head"), p("SPECIFICATION REQUIREMENT", "table_head"), p("SUBMITTED EVIDENCE", "table_head"), p("RECOMMENDED FIX", "table_head"), p("SOURCE", "table_head")]]
    for rid, status, req, evidence, fix, source in requirements:
        rows.append([
            p(f"{rid}<br/>{status}", "table_bold"),
            p(req, "table"),
            p(evidence, "table"),
            p(fix, "table"),
            p(source, "table"),
        ])
    req_table = Table(rows, colWidths=[0.72 * inch, 1.55 * inch, 1.35 * inch, 2.15 * inch, 1.13 * inch], repeatRows=1)
    req_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK_GREEN),
        ("BACKGROUND", (0, 1), (0, -1), PALE_RED),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story += [req_table, Spacer(1, 0.14 * inch)]
    story += [
        callout("EVIDENCE RULE", "Every finding cites the supplied specification or contractor package. If evidence is insufficient, the report says so instead of inventing a requirement."),
        Spacer(1, 0.10 * inch),
        p("Missing-document checklist", "h1"),
    ]

    missing = [
        [p("DOCUMENT", "table_head"), p("WHY NEEDED", "table_head"), p("SOURCE", "table_head")],
        [p("AHRI certificate for exact matched system", "table_bold"), p("Confirms the indoor/outdoor pairing and certified efficiency.", "table"), p("Spec p.2 - Quality", "table")],
        [p("Dimensional drawing and accessory schedule", "table_bold"), p("Supports field coordination and confirms required options.", "table"), p("Spec p.1 - Submittals", "table")],
        [p("Written compressor and parts warranty", "table_bold"), p("Confirms the specified 10-year / 5-year coverage.", "table"), p("Spec p.2 - Quality", "table")],
    ]
    miss_table = Table(missing, colWidths=[2.35 * inch, 3.2 * inch, 1.35 * inch], repeatRows=1)
    miss_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK_GREEN),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story += [miss_table, PageBreak()]

    story += [
        p("CONTRACTOR-READY DELIVERABLE", "eyebrow"),
        p("Correction Action Plan", "h1"),
        p("Use this page as the package worklist before forwarding the revised documents for formal review.", "subtitle"),
    ]
    actions = [
        ("1", "Correct product selection", "Choose a 3-ton R-32 matched system meeting capacity, efficiency, sound, MCA, and MOCP limits."),
        ("2", "Assemble evidence", "Add the exact AHRI certificate, dimensional drawing, accessory schedule, option codes, and written warranty."),
        ("3", "Identify deviations", "If the specified basis cannot be provided, list each exception and request written design-professional direction."),
        ("4", "Quality-control the package", "Mark the selected model and options clearly; remove unselected product variations that create ambiguity."),
        ("5", "Submit for human review", "Forward the corrected authentic documents. Do not alter manufacturer product data or represent this preflight as approval."),
    ]
    for number, title, body in actions:
        item = Table([[p(number, "metric"), p(f"<b>{title}</b><br/>{body}", "body")]], colWidths=[0.58 * inch, 6.32 * inch])
        item.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), PALE_GREEN),
            ("BOX", (0, 0), (-1, -1), 0.45, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story += [item, Spacer(1, 0.07 * inch)]

    story += [Spacer(1, 0.08 * inch), p("Draft response for contractor review", "h1")]
    draft_text = (
        "SUBJECT: Pine Street Community Center - HVAC submittal revision\n\n"
        "We reviewed the proposed HVAC package against the governing requirements before formal submission. "
        "The current selection does not match the specified capacity, refrigerant, efficiency, sound, or electrical limits. "
        "The package also needs the exact AHRI certificate, dimensional drawing, accessory schedule, and written warranty.\n\n"
        "Please provide a compliant matched system and the missing documents. If the specified basis is unavailable, identify each deviation and include the supporting calculations or written design-change request. "
        "The revised package will then be forwarded for the responsible design professional's review."
    )
    draft = Table([[p(draft_text.replace("\n", "<br/>"), "draft")]], colWidths=[6.9 * inch])
    draft.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F5F8F6")),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 11),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
    ]))
    story += [draft, Spacer(1, 0.13 * inch)]
    story += [
        callout("IMPORTANT", "This synthetic packet demonstrates Morrow's format. It is not an approval, professional opinion, code determination, or substitute for the contractor's and design professional's review.", fill=PALE_AMBER, border=colors.HexColor("#E4B24B")),
    ]
    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=letter,
        rightMargin=0.55 * inch, leftMargin=0.55 * inch,
        topMargin=0.62 * inch, bottomMargin=0.68 * inch,
        title="Morrow Sample Correction Packet",
        author="Watchtower - Morrow",
        subject="Synthetic contractor submittal preflight sample",
    )
    doc.build(build_story(), onFirstPage=header_footer, onLaterPages=header_footer)
    shutil.copy2(OUTPUT, DEPLOY_COPY)
    print(OUTPUT)
    print(DEPLOY_COPY)


if __name__ == "__main__":
    main()
