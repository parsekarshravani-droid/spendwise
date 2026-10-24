import io, os, sys, pytest
from datetime import date
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app import create_app
from models import db

@pytest.fixture
def c():
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite://"})
    with app.app_context():
        db.create_all(); yield app.test_client(); db.drop_all()

today = date.today().isoformat(); month = today[:7]
def tx(**k): return {"title": "Lunch", "amount": 250, "category": "Food & Dining", "type": "expense", "date": today, **k}

def test_crud_and_validation(c):
    assert c.post("/api/transactions", json=tx(amount=-5)).status_code == 422
    r = c.post("/api/transactions", json=tx()); assert r.status_code == 201
    i = r.json["id"]
    assert c.put(f"/api/transactions/{i}", json=tx(title="Dinner")).json["title"] == "Dinner"
    assert c.get("/api/transactions?q=dinn").json["total"] == 1
    assert c.delete(f"/api/transactions/{i}").status_code == 204
    assert c.delete(f"/api/transactions/{i}").status_code == 404

def test_dashboard_budget_insights(c):
    c.post("/api/transactions", json=tx(title="Pay", amount=1000, category="Salary", type="income"))
    c.post("/api/transactions", json=tx(amount=450))
    assert c.post("/api/budgets", json={"category": "Food & Dining", "month": month, "amount": 500}).status_code == 201
    assert c.post("/api/budgets", json={"category": "Food & Dining", "month": month, "amount": 500}).status_code == 409
    d = c.get(f"/api/dashboard?month={month}").json
    assert (d["income"], d["expenses"], d["balance"]) == (1000, 450, 550)
    assert d["budgets"][0]["status"] == "warning" and d["budgets"][0]["remaining"] == 50
    titles = [i["title"] for i in c.get(f"/api/insights?month={month}").json["insights"]]
    assert any("saved" in t for t in titles) and any("budget" in t for t in titles)
    assert c.post("/api/insights/ai-summary").status_code == 503  # no key configured -> honest failure
    assert c.get("/api/analytics?period=week").json["series"][-1]["expenses"] == 450

def test_csv_import_export(c):
    f = "title,amount,category,date,type,notes\nCoffee,120,Food & Dining,%s,expense,\nBad,abc,Nope,2020-01-01,expense,\n=cmd,5,Other,%s,expense,x\n" % (today, today)
    r = c.post("/api/transactions/import", data={"file": (io.BytesIO(f.encode()), "t.csv")}, content_type="multipart/form-data")
    assert r.json["imported"] == 2 and r.json["skipped"] == 1 and r.json["errors"][0]["row"] == 3
    out = c.get("/api/transactions/export").data.decode()
    assert "'=cmd" in out and "Coffee" in out
    assert c.get("/api/analytics/report.csv?period=month").data.decode().startswith("section,label")

def test_unusual_transaction(c):
    from analytics import shift_month
    for m in range(1, 6): c.post("/api/transactions", json=tx(title="Meal", amount=200 + m, date=shift_month(month, -m) + "-10"))
    c.post("/api/transactions", json=tx(title="Banquet", amount=5000))
    ins = c.get(f"/api/insights?month={month}").json["insights"]
    assert any("Unusual" in i["title"] and "Banquet" in i["title"] for i in ins)
