
"""Sample data for demos only. Usage: python seed.py [--reset]"""

import os
import sys
import random
from datetime import date
from dotenv import load_dotenv

# Load environment variables from the backend .env file
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app import app
from models import db, Transaction, Budget
from analytics import shift_month, cur_month, month_bounds

random.seed(7)


def build(m, is_cur):
    s, _ = month_bounds(m)
    out = []

    def add(day, title, amt, cat, typ="expense", notes="Sample data"):
        d = date(s.year, s.month, min(day, 28))

        if d <= date.today():
            out.append(
                Transaction(
                    title=title,
                    amount=round(amt, 2),
                    category=cat,
                    type=typ,
                    date=d,
                    notes=notes
                )
            )

    add(1, "Monthly salary", 85000, "Salary", "income")
    add(2, "House rent", 24000, "Housing")
    add(5, "Electricity bill", random.randint(1400, 2200), "Utilities")
    add(6, "Netflix", 649, "Entertainment")
    add(7, "Spotify", 119, "Entertainment")

    if random.random() < 0.6:
        add(15, "Freelance project", random.randint(8000, 18000),
            "Freelance", "income")

    for d in (3, 10, 17, 24):
        add(
            d,
            random.choice(["Big Basket", "Local market", "Supermarket"]),
            random.randint(1200, 2800),
            "Groceries"
        )

    for d in (4, 9, 13, 19, 26):
        add(
            d,
            random.choice(["Zomato order", "Cafe lunch", "Dinner out"]),
            random.randint(250, 1100),
            "Food & Dining"
        )

    for d in (2, 8, 12, 18, 23, 27):
        add(
            d,
            random.choice(["Metro card", "Cab ride", "Fuel"]),
            random.randint(150, 900),
            "Transport"
        )

    add(11, "Online shopping", random.randint(1500, 4500), "Shopping")

    if random.random() < 0.4:
        add(20, "Pharmacy", random.randint(300, 1200), "Health")

    if is_cur:
        add(
            14,
            "Laptop purchase",
            38999,
            "Shopping",
            notes="Sample data: a deliberately large one-off"
        )

    return out


with app.app_context():
    # Only clear existing records when --reset is explicitly supplied.
    if "--reset" in sys.argv:
        Transaction.query.delete()
        Budget.query.delete()
        db.session.commit()
    elif Transaction.query.count():
        sys.exit(
            "Database already has transactions. "
            "Run `python seed.py --reset` to replace sample data."
        )

    cm = cur_month()

    for i in range(5, -1, -1):
        m = shift_month(cm, -i)
        db.session.add_all(build(m, i == 0))

    for category, amount in {
        "Groceries": 9000,
        "Food & Dining": 4000,
        "Transport": 3500,
        "Entertainment": 1200,
        "Shopping": 6000,
        "Utilities": 2500,
    }.items():
        db.session.add(
            Budget(category=category, month=cm, amount=amount)
        )

    db.session.commit()
    print("Seeded", Transaction.query.count(), "transactions.")
