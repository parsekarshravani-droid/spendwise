import csv, io
from datetime import date
from decimal import Decimal
from flask import Blueprint, jsonify, request, Response
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from models import db, Transaction, Budget
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
