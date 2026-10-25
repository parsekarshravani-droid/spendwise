import os, sys, pytest
from datetime import date
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app import create_app
from models import db, Budget, Transaction

@pytest.fixture
def c():
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite://"})
    with app.app_context():
        db.create_all(); yield app.test_client(); db.drop_all()

M = date.today().strftime("%Y-%m")
def tx(**k): return {"title": "Lunch", "amount": 450, "category": "Food & Dining", "type": "expense", "date": date.today().isoformat(), **k}

def test_defaults_and_persistence(c):
    s = c.get("/api/settings").json
    assert (s["currency"], s["theme"], s["budget_alert_threshold"], s["notifications_enabled"], s["version"]) == ("INR", "system", 80, True, 1)
    r = c.put("/api/settings", json={"display_name": " Asha ", "currency": "USD", "theme": "dark", "monthly_spending_limit": "50000", "monthly_income_target": 90000, "version": 1})
    assert r.status_code == 200 and r.json["version"] == 2
    again = c.get("/api/settings").json  # a fresh request, as after a page refresh or on another device
    assert (again["display_name"], again["currency"], again["theme"], again["monthly_spending_limit"]) == ("Asha", "USD", "dark", 50000)
    assert c.put("/api/settings", json={"monthly_spending_limit": "", "version": 2}).json["monthly_spending_limit"] is None

@pytest.mark.parametrize("body,field", [({"currency": "JPY"}, "currency"), ({"monthly_spending_limit": -5}, "monthly_spending_limit"),
    ({"monthly_income_target": "abc"}, "monthly_income_target"), ({"budget_alert_threshold": 20}, "budget_alert_threshold"),
    ({"budget_alert_threshold": True}, "budget_alert_threshold"), ({"theme": "neon"}, "theme"), ({"notifications_enabled": "yes"}, "notifications_enabled"),
    ({"display_name": "x" * 61}, "display_name")])
def test_validation(c, body, field):
    r = c.put("/api/settings", json=body); assert r.status_code == 422 and field in r.json["fields"]
    assert c.get("/api/settings").json["version"] == 1  # nothing was saved

def test_stale_version_conflict(c):
    assert c.put("/api/settings", json={"theme": "dark", "version": 1}).status_code == 200
    r = c.put("/api/settings", json={"theme": "light", "version": 1}); assert r.status_code == 409
    assert c.get("/api/settings").json["theme"] == "dark"

def test_bulk_budgets_update_without_duplicates_and_keep_data(c):
    c.post("/api/transactions", json=tx())
    c.post("/api/budgets", json={"category": "Groceries", "month": M, "amount": 1000})
    r = c.put("/api/budgets/bulk", json={"month": M, "budgets": [{"category": "Groceries", "amount": 2500}, {"category": "Transport", "amount": 800}]})
    assert r.status_code == 200
    c.put("/api/budgets/bulk", json={"month": M, "budgets": [{"category": "Groceries", "amount": 3000}]})
    rows = Budget.query.filter_by(month=M).all()
    assert sorted((b.category, float(b.amount)) for b in rows) == [("Groceries", 3000), ("Transport", 800)]
    assert Transaction.query.count() == 1
    bad = c.put("/api/budgets/bulk", json={"month": M, "budgets": [{"category": "Salary", "amount": 5}, {"category": "Health", "amount": -1}]})
    assert bad.status_code == 422 and set(bad.json["fields"]) == {"Salary", "Health"}
    assert Budget.query.count() == 2  # all-or-nothing

def test_threshold_and_spending_limit_drive_dashboard(c):
    c.post("/api/transactions", json=tx(amount=600))
    c.post("/api/budgets", json={"category": "Food & Dining", "month": M, "amount": 1000})
    assert c.get(f"/api/budgets?month={M}").json[0]["status"] == "ok"  # 60% < default 80%
    c.put("/api/settings", json={"budget_alert_threshold": 50, "monthly_spending_limit": 700, "monthly_income_target": 9000, "version": 1})
    assert c.get(f"/api/budgets?month={M}").json[0]["status"] == "warning"
    d = c.get(f"/api/dashboard?month={M}").json
    assert d["limit"]["status"] == "warning" and d["limit"]["remaining"] == 100 and d["expenses"] == 600
    assert d["income"] == 0 and d["income_target"] == 9000  # target never mixes with recorded income
