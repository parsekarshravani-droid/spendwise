import csv, io
from datetime import date
from decimal import Decimal
from flask import Blueprint, jsonify, request, Response
from datetime import datetime, timezone
from sqlalchemy import or_, update
from sqlalchemy.exc import IntegrityError
from models import db, Transaction, Budget, Settings
import analytics as A
import insights as I

bp = Blueprint("api", __name__, url_prefix="/api")
EXPENSE_CATS = A.CATEGORIES[:10] + ["Other"]

def err(msg, status=400, fields=None): return jsonify({"error": msg, "fields": fields or {}}), status

def parse_tx(d):
    e, v = {}, {}
    v["title"] = str(d.get("title") or "").strip()
    if not v["title"] or len(v["title"]) > 120: e["title"] = "Enter a title of up to 120 characters."
    try:
        amt = Decimal(str(d.get("amount")).replace(",", "").strip())
        if not (Decimal("0") < amt < Decimal("1000000000")): raise ValueError
        v["amount"] = amt.quantize(Decimal("0.01"))
    except Exception:
        e["amount"] = "Enter an amount greater than 0."
    v["type"] = str(d.get("type") or "").strip().lower()
    if v["type"] not in ("income", "expense"): e["type"] = "Choose income or expense."
    v["category"] = str(d.get("category") or "").strip()
    if v["category"] not in A.CATEGORIES: e["category"] = "Choose a category from the list."
    try: v["date"] = date.fromisoformat(str(d.get("date") or "").strip())
    except ValueError: e["date"] = "Enter a valid date (YYYY-MM-DD)."
    v["notes"] = str(d.get("notes") or "").strip()
    if len(v["notes"]) > 500: e["notes"] = "Notes can be up to 500 characters."
    return v, e

def month_arg():
    m = request.args.get("month") or A.cur_month()
    return m if A.valid_month(m) else None

@bp.get("/health")
def health():
    db.session.execute(db.text("select 1")); return {"status": "ok"}

@bp.get("/meta")
def meta(): return {"categories": A.CATEGORIES, "expense_categories": EXPENSE_CATS, "ai_available": I.ai_available()}

def filtered():
    q = Transaction.query
    if s := request.args.get("q", "").strip():
        q = q.filter(or_(Transaction.title.ilike(f"%{s}%"), Transaction.notes.ilike(f"%{s}%")))
    if t := request.args.get("type"): q = q.filter(Transaction.type == t)
    if c := request.args.get("category"): q = q.filter(Transaction.category == c)
    for arg, op in (("start", "__ge__"), ("end", "__le__")):
        if request.args.get(arg):
            try: q = q.filter(getattr(Transaction.date, op)(date.fromisoformat(request.args[arg])))
            except ValueError: pass
    col = {"date": Transaction.date, "amount": Transaction.amount, "title": Transaction.title,
           "category": Transaction.category}.get(request.args.get("sort"), Transaction.date)
    col = col.asc() if request.args.get("order") == "asc" else col.desc()
    return q.order_by(col, Transaction.id.desc())

@bp.get("/transactions")
def list_tx():
    try: page, per = max(1, int(request.args.get("page", 1))), min(100, max(1, int(request.args.get("per_page", 10))))
    except ValueError: return err("page and per_page must be numbers.")
    p = filtered().paginate(page=page, per_page=per, error_out=False)
    return {"items": [t.to_dict() for t in p.items], "page": p.page, "pages": p.pages, "total": p.total}

@bp.post("/transactions")
def create_tx():
    v, e = parse_tx(request.get_json(silent=True) or {})
    if e: return err("Please fix the highlighted fields.", 422, e)
    t = Transaction(**v); db.session.add(t); db.session.commit()
    return t.to_dict(), 201

@bp.put("/transactions/<int:i>")
def update_tx(i):
    t = db.get_or_404(Transaction, i, description="Transaction not found.")
    v, e = parse_tx(request.get_json(silent=True) or {})
    if e: return err("Please fix the highlighted fields.", 422, e)
    for k, val in v.items(): setattr(t, k, val)
    db.session.commit(); return t.to_dict()

@bp.delete("/transactions/<int:i>")
def delete_tx(i):
    db.session.delete(db.get_or_404(Transaction, i, description="Transaction not found.")); db.session.commit()
    return "", 204

def safe(x):  # neutralise spreadsheet formula injection
    x = str(x); return "'" + x if x[:1] in "=+-@\t\r" else x

def csv_response(rows, header, name):
    buf = io.StringIO(); w = csv.writer(buf); w.writerow(header); w.writerows(rows)
    return Response(buf.getvalue(), mimetype="text/csv", headers={"Content-Disposition": f"attachment; filename={name}"})

@bp.get("/transactions/export")
def export_tx():
    rows = [[safe(t.title), f"{t.amount:.2f}", t.category, t.date.isoformat(), t.type, safe(t.notes)] for t in filtered().all()]
    return csv_response(rows, ["title", "amount", "category", "date", "type", "notes"], "transactions.csv")

@bp.post("/transactions/import")
def import_tx():
    f = request.files.get("file")
    if not f: return err("Choose a CSV file to import.")
    try: text = f.read().decode("utf-8-sig")
    except UnicodeDecodeError: return err("The file must be UTF-8 encoded CSV.")
    rd = csv.DictReader(io.StringIO(text))
    cols = {(c or "").strip().lower() for c in (rd.fieldnames or [])}
    missing = {"title", "amount", "category", "date", "type"} - cols
    if missing: return err(f"Missing required columns: {', '.join(sorted(missing))}.")
    good, errors = [], []
    for n, row in enumerate(rd, start=2):
        if n > 5001: errors.append({"row": n, "error": "Row limit of 5,000 exceeded."}); break
        v, e = parse_tx({(k or "").strip().lower(): val for k, val in row.items()})
        if e: errors.append({"row": n, "error": " ".join(e.values())})
        else: good.append(Transaction(**v))
    db.session.add_all(good); db.session.commit()
    return {"imported": len(good), "skipped": len(errors), "errors": errors[:50]}, (201 if good else 422)

# ---- budgets ----
def parse_budget(d, partial=False):
    e, v = {}, {}
    try:
        a = Decimal(str(d.get("amount")).replace(",", ""))
        if not (Decimal("0") < a < Decimal("1000000000")): raise ValueError
        v["amount"] = a.quantize(Decimal("0.01"))
    except Exception: e["amount"] = "Enter an amount greater than 0."
    if not partial:
        v["category"] = d.get("category")
        if v["category"] not in EXPENSE_CATS: e["category"] = "Choose an expense category."
        v["month"] = d.get("month") or A.cur_month()
        if not A.valid_month(v["month"]): e["month"] = "Use the format YYYY-MM."
    return v, e

@bp.get("/budgets")
def list_budgets():
    m = month_arg()
    return (err("month must be YYYY-MM.") if not m else jsonify(A.budget_status(m)))

@bp.post("/budgets")
def create_budget():
    v, e = parse_budget(request.get_json(silent=True) or {})
    if e: return err("Please fix the highlighted fields.", 422, e)
    if Budget.query.filter_by(category=v["category"], month=v["month"]).first():
        return err(f"A {v['category']} budget already exists for {v['month']}. Edit it instead.", 409, {"category": "Already budgeted this month."})
    b = Budget(**v); db.session.add(b)
    try: db.session.commit()
    except IntegrityError: db.session.rollback(); return err("That budget already exists.", 409)
    return next(x for x in A.budget_status(v["month"]) if x["id"] == b.id), 201

@bp.put("/budgets/bulk")
def bulk_budgets():
    """Create-or-update several budgets for one month atomically. Never duplicates (category, month)."""
    d = request.get_json(silent=True) or {}
    month, items = str(d.get("month") or ""), d.get("budgets")
    if not A.valid_month(month): return err("month must be YYYY-MM.", 422)
    if not isinstance(items, list) or not items or len(items) > len(EXPENSE_CATS): return err("Send a list of budgets to save.", 422)
    errors, seen, parsed = {}, set(), []
    for it in items:
        it = it if isinstance(it, dict) else {}
        cat = it.get("category")
        v, e = parse_budget({"category": cat, "amount": it.get("amount"), "month": month})
        if cat in seen: e["category"] = "Listed twice."
        seen.add(cat)
        if e: errors[str(cat)] = e.get("amount") or e.get("category")
        else: parsed.append(v)
    if errors: return err("Some budgets are invalid.", 422, errors)
    existing = {b.category: b for b in Budget.query.filter_by(month=month)}
    for v in parsed:
        if v["category"] in existing: existing[v["category"]].amount = v["amount"]
        else: db.session.add(Budget(**v))
    try: db.session.commit()
    except IntegrityError:
        db.session.rollback(); return err("Budgets were changed elsewhere. Reload and try again.", 409)
    return {"budgets": A.budget_status(month)}

@bp.put("/budgets/<int:i>")
def update_budget(i):
    b = db.get_or_404(Budget, i, description="Budget not found.")
    v, e = parse_budget(request.get_json(silent=True) or {}, partial=True)
    if e: return err("Please fix the highlighted fields.", 422, e)
    b.amount = v["amount"]; db.session.commit()
    return next(x for x in A.budget_status(b.month) if x["id"] == b.id)

@bp.delete("/budgets/<int:i>")
def delete_budget(i):
    db.session.delete(db.get_or_404(Budget, i, description="Budget not found.")); db.session.commit(); return "", 204

# ---- dashboard / analytics / insights ----
@bp.get("/dashboard")
def dash():
    m = month_arg()
    return err("month must be YYYY-MM.") if not m else jsonify(A.dashboard(m))

def period_arg():
    p = request.args.get("period", "month"); return p if p in ("week", "month", "year") else None

@bp.get("/analytics")
def analytics():
    p = period_arg(); return err("period must be week, month or year.") if not p else jsonify(A.report(p))

@bp.get("/analytics/report.csv")
def report_csv():
    p = period_arg()
    if not p: return err("period must be week, month or year.")
    r = A.report(p)
    rows = [["summary", s["label"], s["income"], s["expenses"], s["savings"]] for s in r["series"]]
    rows += [["category", c["category"], c["current"], c["previous"], round(c["current"] - c["previous"], 2)] for c in r["comparison"]]
    return csv_response(rows, ["section", "label", "income_or_current", "expenses_or_previous", "net_or_change"], f"report-{p}.csv")

@bp.get("/insights")
def insights():
    m = month_arg()
    if not m: return err("month must be YYYY-MM.")
    return {"month": m, "insights": I.compute(m), "ai_available": I.ai_available()}

@bp.post("/insights/ai-summary")
def ai_summary():
    m = month_arg()
    if not m: return err("month must be YYYY-MM.")
    try: return I.ai_summary(m)
    except I.AIError as ex: return err(str(ex), 503)


# ---- settings (global: the app has no authentication) ----
CURRENCIES = ("INR", "USD", "EUR", "GBP", "AED")
DATE_FORMATS = ("DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD")
THEMES = ("light", "dark", "system")

def get_settings():
    s = db.session.get(Settings, 1)
    if s is None:
        db.session.add(Settings(id=1))
        try: db.session.commit()
        except IntegrityError: db.session.rollback()  # another request created it first
        s = db.session.get(Settings, 1)
    return s

def money_or_none(raw):
    if raw is None or str(raw).strip() == "": return None
    a = Decimal(str(raw).replace(",", "").strip())
    if not (Decimal("0") < a < Decimal("1000000000")): raise ValueError
    return a.quantize(Decimal("0.01"))

def parse_settings(d):
    v, e = {}, {}
    if "display_name" in d:
        n = str(d["display_name"] or "").strip()
        if len(n) > 60: e["display_name"] = "Use 60 characters or fewer."
        else: v["display_name"] = n
    for k, allowed, label in (("currency", CURRENCIES, "a supported currency"), ("date_format", DATE_FORMATS, "a supported date format"), ("theme", THEMES, "light, dark or system")):
        if k in d:
            if d[k] in allowed: v[k] = d[k]
            else: e[k] = f"Choose {label}."
    for k in ("monthly_income_target", "monthly_spending_limit"):
        if k in d:
            try: v[k] = money_or_none(d[k])
            except Exception: e[k] = "Enter an amount greater than 0, or leave it empty."
    for k in ("notifications_enabled", "monthly_summary_enabled"):
        if k in d:
            if isinstance(d[k], bool): v[k] = d[k]
            else: e[k] = "Must be true or false."
    if "budget_alert_threshold" in d:
        t = d["budget_alert_threshold"]
        try:
            if isinstance(t, bool) or int(t) != float(t) or not 50 <= int(t) <= 100: raise ValueError
            v["budget_alert_threshold"] = int(t)
        except (ValueError, TypeError): e["budget_alert_threshold"] = "Enter a whole number from 50 to 100."
    return v, e

@bp.get("/settings")
def read_settings(): return get_settings().to_dict()

@bp.put("/settings")
def write_settings():
    d = request.get_json(silent=True)
    if not isinstance(d, dict): return err("Send a JSON object.", 400)
    v, e = parse_settings(d)
    if e: return err("Please fix the highlighted fields.", 422, e)
    cur = get_settings()
    version = d.get("version", cur.version)
    if isinstance(version, bool) or not isinstance(version, int): return err("version must be a number.", 422, {"version": "Invalid."})
    # Atomic compare-and-set: only applies if nobody else saved since this client loaded the settings.
    res = db.session.execute(update(Settings).where(Settings.id == 1, Settings.version == version)
                             .values(**v, version=version + 1, updated_at=datetime.now(timezone.utc)))
    if res.rowcount == 0:
        db.session.rollback()
        return err("Settings were changed from another device or tab. Reload to see the latest values.", 409)
    db.session.commit(); db.session.expire_all()
    return get_settings().to_dict()
