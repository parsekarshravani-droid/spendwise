import os, json, statistics, requests
from collections import defaultdict
from analytics import *

DISCRETIONARY = {"Food & Dining", "Shopping", "Entertainment", "Travel"}

def _ins(kind, title, detail, evidence): return {"type": kind, "title": title, "detail": detail, "evidence": evidence}

def compute(month):
    s, e = month_bounds(month)
    txs = tx_between(s, e)
    cur = totals(txs); cats = by_category(txs)
    prev_m = shift_month(month, -1)
    prev_txs = tx_between(*month_bounds(prev_m)); prev = totals(prev_txs); prev_cats = by_category(prev_txs)
    out = []
    if not txs: return out
    if cur["income"]:
        rate = cur["savings"] / cur["income"] * 100
        kind = "success" if rate >= 20 else "warning" if rate < 0 else "info"
        out.append(_ins(kind, f"You saved {rate:.0f}% of your income" if rate >= 0 else "You spent more than you earned",
                        f"Income {cur['income']:,.0f}, expenses {cur['expenses']:,.0f}, net {cur['savings']:,.0f}."
                        + ("" if rate >= 20 else " A common target is 20% or more."), {"savings_rate": round(rate, 1), **cur}))
    if cats:
        top, amt = max(cats.items(), key=lambda x: x[1]); share = amt / cur["expenses"] * 100
        out.append(_ins("info", f"{top} is your largest expense ({share:.0f}%)",
                        f"{amt:,.0f} of {cur['expenses']:,.0f} total spending this month.", {"category": top, "amount": amt, "share": round(share, 1)}))
    for c, a in cats.items():
        p = prev_cats.get(c, 0)
        if p > 0 and a >= p * 1.25 and a - p >= 100:
            out.append(_ins("warning", f"{c} spending rose {((a - p) / p * 100):.0f}%",
                            f"{a:,.0f} this month versus {p:,.0f} in {prev_m}.", {"category": c, "current": a, "previous": p}))
    # unusual transactions: compared with same-category history over the previous 6 months
    hs, _ = month_bounds(shift_month(month, -6))
    hist = defaultdict(list)
    for t in tx_between(hs, s):
        if t.type == "expense": hist[t.category].append(float(t.amount))
    for t in txs:
        h = hist.get(t.category, [])
        if t.type == "expense" and len(h) >= 4:
            mean, sd = statistics.mean(h), statistics.pstdev(h)
            if float(t.amount) > mean + 2 * sd and float(t.amount) > 1.5 * mean:
                out.append(_ins("warning", f"Unusual {t.category} charge: {t.title}",
                                f"{float(t.amount):,.0f} on {t.date} is {float(t.amount) / mean:.1f}x your usual {mean:,.0f} for this category.",
                                {"transaction_id": t.id, "amount": float(t.amount), "category_mean": round(mean, 2), "samples": len(h)}))
    for b in budget_status(month):
        if b["status"] == "over":
            out.append(_ins("warning", f"Over budget on {b['category']}", f"Spent {b['spent']:,.0f} of {b['amount']:,.0f} ({b['pct']:.0f}%).", b))
        elif b["status"] == "warning":
            out.append(_ins("tip", f"{b['category']} budget is {b['pct']:.0f}% used", f"{b['remaining']:,.0f} left for the rest of the month.", b))
    # savings opportunity: discretionary categories above their own 3-month average
    h3s, _ = month_bounds(shift_month(month, -3))
    h3 = defaultdict(float)
    for t in tx_between(h3s, s):
        if t.type == "expense": h3[t.category] += float(t.amount)
    for c in DISCRETIONARY & set(cats):
        avg = h3.get(c, 0) / 3
        if avg > 0 and cats[c] > avg * 1.15 and cats[c] - avg >= 100:
            out.append(_ins("tip", f"Save about {cats[c] - avg:,.0f} on {c}",
                            f"You spent {cats[c]:,.0f} this month; your 3-month average is {avg:,.0f}. Returning to that average would free up the difference.",
                            {"category": c, "current": cats[c], "avg_3_month": round(avg, 2)}))
    # possible subscriptions: same title with similar amount in 3+ of the last 4 months
    recs = defaultdict(dict)
    r0, _ = month_bounds(shift_month(month, -3)); _, r1 = month_bounds(month)
    for t in tx_between(r0, r1):
        if t.type == "expense": recs[t.title.strip().lower()][t.date.strftime("%Y-%m")] = (t.title, float(t.amount))
    for k, mm in recs.items():
        vals = [v[1] for v in mm.values()]
        if len(mm) >= 3 and max(vals) - min(vals) <= 0.1 * max(vals):
            out.append(_ins("info", f"Possible recurring charge: {next(iter(mm.values()))[0]}",
                            f"Appeared in {len(mm)} of the last 4 months at about {statistics.mean(vals):,.0f}. If this is a subscription, check that you still use it.",
                            {"months": sorted(mm), "avg_amount": round(statistics.mean(vals), 2)}))
    return out

def ai_available(): return bool(os.environ.get("ANTHROPIC_API_KEY"))

class AIError(Exception): pass

def ai_summary(month):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key: raise AIError("AI summaries are not configured on this server.")
    facts = {"month": month, "totals": totals(tx_between(*month_bounds(month))),
             "previous_month_totals": totals(tx_between(*month_bounds(shift_month(month, -1)))),
             "spending_by_category": by_category(tx_between(*month_bounds(month))),
             "budgets": [{k: b[k] for k in ("category", "amount", "spent", "status")} for b in budget_status(month)],
             "detected_insights": [{"title": i["title"], "detail": i["detail"]} for i in compute(month)]}
    model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")
    try:
        r = requests.post("https://api.anthropic.com/v1/messages", timeout=40,
                          headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                          json={"model": model, "max_tokens": 600,
                                "system": "You are a careful personal-finance analyst. Use ONLY the figures in the JSON provided; never invent numbers. "
                                          "Write a summary of under 150 words followed by 3 short, practical suggestions. This is not professional financial advice.",
                                "messages": [{"role": "user", "content": json.dumps(facts)}]})
        r.raise_for_status()
        text = "".join(b.get("text", "") for b in r.json().get("content", []))
    except requests.RequestException:
        raise AIError("The AI service could not be reached. Try again shortly.")
    if not text: raise AIError("The AI service returned an empty answer.")
    return {"summary": text, "model": model, "month": month}
