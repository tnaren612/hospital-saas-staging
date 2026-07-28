"""Generate Sri Srinivasa Hospital website feature guide PDF."""

from __future__ import annotations

import os
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "docs",
    "Sri_Srinivasa_Hospital_Website_Feature_Guide.pdf",
)

W, H = A4
MARGIN = 16 * mm

PRIMARY = colors.HexColor("#1449e1")
PRIMARY_DARK = colors.HexColor("#142257")
TEAL = colors.HexColor("#0d9488")
SOFT = colors.HexColor("#f8fafc")
MUTED = colors.HexColor("#64748b")
LINE = colors.HexColor("#cbd5e1")


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="CoverTitle",
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=28,
            textColor=colors.white,
            alignment=TA_CENTER,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CoverSub",
            fontName="Helvetica",
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#dbeafe"),
            alignment=TA_CENTER,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H1Doc",
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            textColor=PRIMARY_DARK,
            spaceBefore=10,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H2Doc",
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=PRIMARY,
            spaceBefore=8,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyDoc",
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Cell",
            fontName="Helvetica",
            fontSize=8,
            leading=10.5,
            textColor=colors.HexColor("#0f172a"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="CellHead",
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10.5,
            textColor=colors.white,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletDoc",
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#0f172a"),
            leftIndent=8,
            spaceAfter=2,
        )
    )
    return styles


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PRIMARY_DARK)
    canvas.rect(0, H - 10 * mm, W, 10 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(
        MARGIN,
        H - 6.5 * mm,
        "Sri Srinivasa Hospital · Website Feature & Stability Guide",
    )
    canvas.drawRightString(W - MARGIN, H - 6.5 * mm, "Frontend Demo · No Backend")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.4)
    canvas.line(MARGIN, 12 * mm, W - MARGIN, 12 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(MARGIN, 7 * mm, "Confidential demo documentation")
    canvas.drawRightString(W - MARGIN, 7 * mm, f"Page {doc.page}")
    canvas.restoreState()


def cover_header(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PRIMARY_DARK)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    canvas.setFillColor(PRIMARY)
    canvas.rect(0, H * 0.42, W, 28 * mm, fill=1, stroke=0)
    canvas.setFillColor(TEAL)
    canvas.rect(0, H * 0.42 - 4 * mm, W, 4 * mm, fill=1, stroke=0)
    canvas.restoreState()


def cover_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#93c5fd"))
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(
        W / 2,
        18 * mm,
        f"Generated {date.today().isoformat()}  ·  Project: sri-srinivasa-hospital",
    )
    canvas.restoreState()


def main():
    styles = build_styles()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    usable = W - 2 * MARGIN

    def P(text, style="BodyDoc"):
        return Paragraph(text, styles[style])

    def cell(text, head=False):
        return Paragraph(text, styles["CellHead" if head else "Cell"])

    def make_table(headers, rows, col_widths):
        data = [[cell(h, True) for h in headers]]
        for r in rows:
            data.append([cell(c) for c in r])
        t = Table(data, colWidths=col_widths, repeatRows=1)
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), PRIMARY_DARK),
                    ("GRID", (0, 0), (-1, -1), 0.35, LINE),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
                ]
            )
        )
        return t

    story = []

    # Cover
    story.append(Spacer(1, 45 * mm))
    story.append(Paragraph("SRI SRINIVASA HOSPITAL", styles["CoverTitle"]))
    story.append(
        Paragraph(
            "Website Feature Guide &amp; Stability Checklist", styles["CoverTitle"]
        )
    )
    story.append(Spacer(1, 8 * mm))
    story.append(
        Paragraph(
            "Badvel · Nellore Road · Andhra Pradesh 516227", styles["CoverSub"]
        )
    )
    story.append(
        Paragraph(
            "Frontend Demo · Next.js · LocalStorage / JSON", styles["CoverSub"]
        )
    )
    story.append(Spacer(1, 18 * mm))
    story.append(
        Paragraph(
            "This document lists every section of the website, what is stable and working today, "
            "how to test it, and what is demo-only versus ready for real patient operations.",
            styles["CoverSub"],
        )
    )
    story.append(Spacer(1, 20 * mm))
    info_rows = [
        [cell("Project path", True), cell(r"C:\Users\windows\sri-srinivasa-hospital")],
        [cell("Local URL", True), cell("http://localhost:3000")],
        [cell("Start command", True), cell("npm run dev")],
        [cell("Admin password", True), cell("admin123")],
        [cell("Patient OTP", True), cell("123456")],
    ]
    info = Table(info_rows, colWidths=[40 * mm, 90 * mm])
    info.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#1e3a8a")),
                ("BACKGROUND", (1, 0), (1, -1), colors.HexColor("#1e40af")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#60a5fa")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#3b82f6")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(info)
    story.append(PageBreak())

    # 1
    story.append(P("1. How to Open the Website", "H1Doc"))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    story.append(
        P(
            "1. Open PowerShell<br/>"
            "2. Run: <b>cd C:\\Users\\windows\\sri-srinivasa-hospital</b><br/>"
            "3. First time only: <b>npm install</b><br/>"
            "4. Start: <b>npm run dev</b><br/>"
            "5. Browser: <b>http://localhost:3000</b><br/>"
            "6. Stop server: <b>Ctrl + C</b>"
        )
    )
    story.append(
        P(
            "<b>Important:</b> Frontend-only demo. Appointments and CMS data are stored in the browser "
            "(localStorage). Clearing browser data removes demo records. No real SMS/email/server is connected."
        )
    )

    # 2
    story.append(P("2. Global Features (All Pages)", "H1Doc"))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    story.append(
        make_table(
            ["Feature", "Status", "How to use"],
            [
                ["Emergency banner", "WORKING", "Top red bar · Call Now / Ambulance dial phone"],
                ["Main navigation", "WORKING", "Header links + More menu"],
                ["English / Telugu", "WORKING", "Language button in header"],
                ["Dark / Light mode", "WORKING", "Sun/moon icon · remembered"],
                ["Accessibility", "WORKING", "Large text + High contrast toggles"],
                ["Floating WhatsApp", "WORKING", "Green button · opens prefilled message"],
                ["Floating Call", "WORKING", "Red phone · emergency number"],
                ["Sticky Appointment", "WORKING", "Opens /appointment"],
                ["AI Chatbot", "WORKING", "Bot icon · demo answers + typing"],
                ["Footer", "WORKING", "Links, phones, email, address"],
                ["Toast notifications", "WORKING", "After forms / bookings"],
            ],
            [45 * mm, 25 * mm, usable - 70 * mm],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        P(
            "<b>Chatbot topics:</b> Book Appointment, Doctor Availability, Emergency, Hospital Timing, "
            "Fees, Location, Services, Insurance."
        )
    )

    # 3
    story.append(P("3. Public Website Sections", "H1Doc"))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    sections = [
        (
            "Home /",
            "Hero, counters, services preview, doctor preview, explore cards, testimonials, CTA. "
            "Book / emergency / WhatsApp buttons work.",
        ),
        ("About /about", "Hospital story, mission, vision, values, address. Working."),
        (
            "Doctor /doctor",
            "Full profile, qualifications, experience, awards, certificates, gallery, fees. Working.",
        ),
        (
            "Services /services",
            "All specialty cards with icons and feature lists. Working.",
        ),
        (
            "Gallery /gallery",
            "Filterable gallery + lightbox. Paths from JSON / CMS. Working.",
        ),
        (
            "Facilities /facilities",
            "ICU, diagnostics, OPD, pharmacy, ambulance, lounge. Working.",
        ),
        (
            "Testimonials /testimonials",
            "Patient reviews with ratings. Demo content. Working.",
        ),
        (
            "Insurance /insurance",
            "Partner list + claim guidance. No real claim system. Working as info page.",
        ),
        (
            "Health Packages /health-packages",
            "Packages, prices, inclusions, book CTA. Working.",
        ),
        (
            "Blog /blog",
            "Articles + category filters + article detail pages. CMS editable. Working.",
        ),
        ("FAQ /faq", "Accordion FAQs + SEO schema. Working."),
        (
            "Contact /contact",
            "Phones, WhatsApp, map, validated form. Email success is simulated. Working as demo.",
        ),
        ("Privacy /privacy", "Policy text page. Working."),
        ("Terms /terms", "Terms of use page. Working."),
        (
            "404 page",
            "Any invalid URL shows branded 404 with home/appointment links. Working.",
        ),
    ]
    for title, body in sections:
        story.append(P(title, "H2Doc"))
        story.append(P(body))

    story.append(PageBreak())

    # 4
    story.append(P("4. Appointment Booking (Core Feature)", "H1Doc"))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    story.append(P("URL: <b>/appointment</b>"))
    story.append(
        make_table(
            ["Item", "Status", "Notes"],
            [
                ["Patient name / phone / email", "WORKING", "Zod validation"],
                ["Age / gender / problem", "WORKING", "Required fields"],
                ["Doctor selection", "WORKING", "Dr. Varaprasad only"],
                ["Date picker", "WORKING", "Next 60 days"],
                ["Time slots M/A/E", "WORKING", "Morning, Afternoon, Evening"],
                ["Booked slots disabled", "WORKING", "After successful booking"],
                ["Doctor calendar panel", "WORKING", "Interactive availability demo"],
                ["Success animation", "WORKING", "On-screen confirmation"],
                ["SMS confirmation", "SIMULATED", "Toast only — not real SMS"],
                ["Email confirmation", "SIMULATED", "Toast only — not real email"],
                ["Data storage", "LOCAL ONLY", "Browser localStorage"],
            ],
            [50 * mm, 28 * mm, usable - 78 * mm],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        P(
            "<b>How to test:</b> Fill form with a 10-digit Indian mobile (starts with 6–9), "
            "pick date + open slot, submit. Re-open same slot — it should be disabled."
        )
    )

    # 5
    story.append(P("5. Patient Login &amp; Dashboard", "H1Doc"))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    story.append(
        make_table(
            ["Item", "Status", "How to use"],
            [
                ["Login page", "WORKING", "/patient/login"],
                ["Send OTP", "SIMULATED", "Toast shows OTP 123456"],
                ["Verify OTP", "WORKING", "Only 123456 accepted"],
                ["Dashboard access", "WORKING", "/patient/dashboard after login"],
                ["Upcoming appointments", "WORKING", "Matches phone used at booking"],
                ["History", "WORKING", "From localStorage"],
                ["Reports", "DEMO DATA", "Fixed sample reports"],
                ["Invoices", "DEMO DATA", "Fixed sample invoices"],
                ["Logout", "WORKING", "Clears patient session"],
            ],
            [50 * mm, 28 * mm, usable - 78 * mm],
        )
    )
    story.append(Spacer(1, 2 * mm))
    story.append(
        P(
            "<b>Tip:</b> Book an appointment with phone 9876543210, then login with the same "
            "phone + OTP 123456 to see that booking."
        )
    )

    # 6
    story.append(P("6. Video Consultation", "H1Doc"))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    story.append(
        make_table(
            ["Item", "Status", "Notes"],
            [
                ["Book video visit", "WORKING", "/video-consult form (type=video)"],
                ["Join meeting room", "WORKING", "/video-consult/meeting"],
                ["Camera preview", "WORKING", "Needs browser camera permission"],
                ["Mute / Video toggle", "WORKING", "Local device only"],
                ["Chat", "WORKING", "Demo doctor auto-reply"],
                ["Screen share", "DEMO UI", "Visual toggle only"],
                ["Leave meeting", "WORKING", "Returns to video page"],
                ["Real doctor call", "NOT REAL", "No multi-user WebRTC call"],
            ],
            [45 * mm, 28 * mm, usable - 73 * mm],
        )
    )

    # 7
    story.append(P("7. Admin Portal", "H1Doc"))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    story.append(P("URL: <b>/admin</b> · Password: <b>admin123</b>"))
    story.append(
        make_table(
            ["Module", "URL", "Status", "What works"],
            [
                ["Login", "/admin", "WORKING", "Demo password gate"],
                ["Overview", "/admin/dashboard", "WORKING", "Stats + recent appointments"],
                [
                    "Appointments",
                    "/admin/appointments",
                    "WORKING",
                    "List, filter, status, chart, seed demo",
                ],
                [
                    "Analytics",
                    "/admin/analytics",
                    "WORKING",
                    "Charts W/M/Y — demo numbers",
                ],
                [
                    "Health Tips CMS",
                    "/admin/blog",
                    "WORKING",
                    "Create / edit / delete articles",
                ],
                [
                    "Gallery CMS",
                    "/admin/gallery",
                    "WORKING",
                    "Add / delete / replace / drag reorder",
                ],
                [
                    "Doctor CMS",
                    "/admin/doctor",
                    "WORKING",
                    "Name, bio, fees, photo path, etc.",
                ],
                ["Logout", "Header button", "WORKING", "Clears admin session"],
            ],
            [35 * mm, 40 * mm, 22 * mm, usable - 97 * mm],
        )
    )

    story.append(PageBreak())

    # 8
    story.append(P("8. Demo for Owner vs Ready for Real Patients", "H1Doc"))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    story.append(
        P(
            "Use this table for stakeholder review. <b>Demo Ready</b> = safe for presentation. "
            "<b>Production Ready</b> = real clinical/patient operations (needs backend + compliance)."
        )
    )
    story.append(Spacer(1, 2 * mm))
    story.append(
        make_table(
            [
                "Capability",
                "Demo Ready now?",
                "Production Ready?",
                "What is still needed for production",
            ],
            [
                [
                    "Marketing pages (Home, About, Services…)",
                    "YES",
                    "YES*",
                    "Real photos, final copy, domain, hosting",
                ],
                [
                    "SEO / schema / sitemap",
                    "YES",
                    "YES*",
                    "Set NEXT_PUBLIC_SITE_URL + real domain",
                ],
                [
                    "WhatsApp / Call buttons",
                    "YES",
                    "YES",
                    "Confirm final numbers",
                ],
                [
                    "Appointment form UI",
                    "YES",
                    "NO",
                    "Backend API, staff notifications, DB",
                ],
                [
                    "Slot calendar simulation",
                    "YES",
                    "NO",
                    "Real schedule engine + doctor calendar",
                ],
                [
                    "SMS confirmation",
                    "DEMO ONLY",
                    "NO",
                    "SMS gateway (e.g. MSG91)",
                ],
                [
                    "Email confirmation",
                    "DEMO ONLY",
                    "NO",
                    "Email service (SMTP/SendGrid)",
                ],
                [
                    "Patient OTP login",
                    "DEMO ONLY",
                    "NO",
                    "Real OTP provider + secure auth",
                ],
                [
                    "Patient reports / invoices",
                    "DEMO DATA",
                    "NO",
                    "Hospital HIS / billing integration",
                ],
                [
                    "Video consultation",
                    "UI DEMO",
                    "NO",
                    "Telemedicine platform / WebRTC + consent",
                ],
                [
                    "AI chatbot",
                    "FAQ DEMO",
                    "PARTIAL",
                    "Optional real AI API + medical disclaimer",
                ],
                [
                    "Admin CMS",
                    "YES (local)",
                    "NO",
                    "Authenticated server CMS + roles",
                ],
                [
                    "Analytics revenue",
                    "DEMO DATA",
                    "NO",
                    "Real analytics + accounting",
                ],
                [
                    "Insurance cashless",
                    "INFO PAGE",
                    "NO",
                    "TPA / insurer network integration",
                ],
                [
                    "Data privacy / security",
                    "BASIC HEADERS",
                    "NO",
                    "HTTPS, server validation, policies, audit",
                ],
            ],
            [42 * mm, 28 * mm, 30 * mm, usable - 100 * mm],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        P(
            "* Marketing pages can go live for branding after replacing images and hosting. "
            "Do <b>not</b> treat appointment bookings as real clinical records until a backend is connected."
        )
    )

    # 9
    story.append(P("9. Demo Credentials &amp; Contacts", "H1Doc"))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    story.append(
        make_table(
            ["Item", "Value"],
            [
                ["Admin password", "admin123"],
                ["Patient OTP", "123456"],
                [
                    "Hospital phones",
                    "8121864863 · 9944867733 · 8249432026",
                ],
                [
                    "Doctor",
                    "Dr. Varaprasad Venkata Sumanth (MBBS, DNB, FSM, CCEBDM)",
                ],
                [
                    "Address",
                    "Sri Srinivasa Hospital, Nellore Road, Badvel, AP 516227",
                ],
                [
                    "WhatsApp message",
                    "Hello Doctor, I would like to book an appointment.",
                ],
            ],
            [45 * mm, usable - 45 * mm],
        )
    )

    # 10
    story.append(P("10. Suggested 10-Minute Test Path", "H1Doc"))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    steps = [
        "Home — check counters, dark mode, Telugu, WhatsApp button",
        "Appointment — book a slot with phone 9876543210",
        "Patient Login — same phone + OTP 123456 — confirm booking appears",
        "Video Consult — Join Demo Meeting — mute / camera / chat",
        "Admin — password admin123 — open Appointments — change status",
        "Admin Blog — create a health tip — open /blog to verify",
        "Chatbot — ask “fees” and “emergency”",
        "Contact form — submit and confirm success toast",
    ]
    for i, s in enumerate(steps, 1):
        story.append(P(f"<b>{i}.</b> {s}", "BulletDoc"))

    # 11
    story.append(P("11. Replacing Images", "H1Doc"))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    story.append(
        P(
            "All images are path-based under <b>public/assets/images/</b>. "
            "Update paths in <b>src/data/*.json</b> (especially images.json, doctor.json, gallery.json). "
            "Do not hardcode image URLs in React components. "
            "Hero building placeholder: <b>public/assets/images/hospital/building.svg</b>"
        )
    )

    # 12
    story.append(P("12. Recommended Next Steps for Go-Live", "H1Doc"))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=6))
    next_steps = [
        "Replace placeholder images with real hospital and doctor photos",
        "Review all medical and fee wording with the doctor",
        "Push project to GitHub and host on your preferred platform",
        "Connect a backend for appointments, auth, SMS, and email",
        "Add real domain, SSL, and production environment variables",
        "Complete privacy / clinical compliance review before storing real patient data",
    ]
    for i, s in enumerate(next_steps, 1):
        story.append(P(f"<b>{i}.</b> {s}", "BulletDoc"))

    story.append(Spacer(1, 8 * mm))
    story.append(
        P(
            "<b>Summary:</b> The website is stable for demo, training, and stakeholder review. "
            "Public content pages and UI flows are production-quality frontends. "
            "Clinical transactions (real bookings, OTP, telemedicine, billing) remain simulated "
            "until a backend is connected."
        )
    )

    def first_page(canvas, doc):
        cover_header(canvas, doc)
        cover_footer(canvas, doc)

    def later_pages(canvas, doc):
        header_footer(canvas, doc)

    doc = SimpleDocTemplate(
        OUT,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Sri Srinivasa Hospital — Website Feature Guide",
        author="Sri Srinivasa Hospital Website Demo",
        subject="Feature stability checklist and section guide",
    )
    doc.build(story, onFirstPage=first_page, onLaterPages=later_pages)
    print("WROTE", OUT)
    print("SIZE", os.path.getsize(OUT))


if __name__ == "__main__":
    main()
