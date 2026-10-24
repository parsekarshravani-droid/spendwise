from collections import defaultdict
from datetime import date, timedelta
from models import Transaction, Budget

CATEGORIES = ["Food & Dining", "Groceries", "Transport", "Housing", "Utilities", "Health", "Shopping",
              "Entertainment", "Travel", "Education", "Salary", "Freelance", "Investments", "Other"]

def cur_month(): return date.today().strftime("%Y-%m")

def month_bounds(m):
    y, mo = map(int, m.split("-"))
    return date(y, mo, 1), date(y + (mo == 12), mo % 12 + 1, 1)  # [start, end)

def shift_month(m, k):
    y, mo = map(int, m.split("-")); i = y * 12 + mo - 1 + k
    return f"{i // 12:04d}-{i % 12 + 1:02d}"

def valid_month(m):
    try:
        y, mo = map(int, m.split("-")); date(y, mo, 1); return len(m) == 7
    except Exception:
        return False

def tx_between(start, end):
    return Transaction.query.filter(Transaction.date >= start, Transaction.date < end).all()

def totals(txs):
    inc = sum(float(t.amount) for t in txs if t.type == "income")
    exp = sum(float(t.amount) for t in txs if t.type == "expense")
    return {"income": round(inc, 2), "expenses": round(exp, 2), "savings": round(inc - exp, 2)}

def by_category(txs, typ="expense"):
    d = defaultdict(float)
    for t in txs:
        if t.type == typ: d[t.category] += float(t.amount)
    return {k: round(v, 2) for k, v in d.items()}

def budget_status(month):
    s, e = month_bounds(month)
    spent = by_category(tx_between(s, e))
    out = []
    for b in Budget.query.filter_by(month=month).order_by(Budget.category).all():
        amt, sp = float(b.amount), spent.get(b.category, 0.0)
        pct = round(sp / amt * 100, 1)
        out.append({"id": b.id, "category": b.category, "month": month, "amount": amt, "spent": sp,
                    "remaining": round(amt - sp, 2), "pct": pct,
                    "status": "over" if sp > amt else "warning" if pct >= 80 else "ok"})
    return out

def month_series(month, n=6):
    months = [shift_month(month, -i) for i in range(n - 1, -1, -1)]
    s, _ = month_bounds(months[0]); _, e = month_bounds(month)
    buckets = defaultdict(list)
    for t in tx_between(s, e): buckets[t.date.strftime("%Y-%m")].append(t)
    return [{"label": m, **totals(buckets[m])} for m in months]

def dashboard(month):
    s, e = month_bounds(month)
    txs = tx_between(s, e)
    prev = totals(tx_between(*month_bounds(shift_month(month, -1))))
    cur = totals(txs)
    allt = totals(Transaction.query.all())
    cats = by_category(txs)
    tot = sum(cats.values())
    recent = Transaction.query.order_by(Transaction.date.desc(), Transaction.id.desc()).limit(6).all()
    def delta(a, b): return None if not b else round((a - b) / b * 100, 1)
    return {"month": month, "balance": allt["savings"], **cur, "previous": prev,
            "change": {"income": delta(cur["income"], prev["income"]), "expenses": delta(cur["expenses"], prev["expenses"])},
            "savings_rate": round(cur["savings"] / cur["income"] * 100, 1) if cur["income"] else None,
            "series": month_series(month),
            "categories": sorted([{"category": k, "amount": v, "share": round(v / tot * 100, 1)} for k, v in cats.items()],
                                 key=lambda x: -x["amount"]),
            "recent": [t.to_dict() for t in recent], "budgets": budget_status(month)}

# ---- period reports ----
def _key(d, p):
    return (d - timedelta(days=d.weekday())).isoformat() if p == "week" else d.strftime("%Y-%m") if p == "month" else str(d.year)

def _keys(p, today):
    if p == "week":
        mon = today - timedelta(days=today.weekday()); return [(mon - timedelta(weeks=i)).isoformat() for i in range(7, -1, -1)]
    if p == "month": return [shift_month(today.strftime("%Y-%m"), -i) for i in range(11, -1, -1)]
    return [str(today.year - i) for i in range(4, -1, -1)]

def report(period, today=None):
    today = today or date.today()
    keys = _keys(period, today)
    first = keys[0]
    start = date.fromisoformat(first) if period == "week" else date.fromisoformat(first + ("-01" if period == "month" else "-01-01"))
    groups = defaultdict(list)
    for t in Transaction.query.filter(Transaction.date >= start).all(): groups[_key(t.date, period)].append(t)
    series = [{"label": k, **totals(groups[k])} for k in keys]
    cur, prev = by_category(groups[keys[-1]]), by_category(groups[keys[-2]])
    comp = sorted([{"category": c, "current": cur.get(c, 0), "previous": prev.get(c, 0)} for c in set(cur) | set(prev)],
                  key=lambda x: -x["current"])
    return {"period": period, "current_label": keys[-1], "previous_label": keys[-2], "series": series, "comparison": comp}
