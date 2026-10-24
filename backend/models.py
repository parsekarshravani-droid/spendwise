from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()

class Transaction(db.Model):
    __tablename__ = "transactions"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(120), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    category = db.Column(db.String(40), nullable=False, index=True)
    type = db.Column(db.String(10), nullable=False)  # income | expense
    date = db.Column(db.Date, nullable=False, index=True)
    notes = db.Column(db.String(500), nullable=False, default="")
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    __table_args__ = (db.CheckConstraint("amount > 0", name="ck_tx_amount_positive"),
                      db.CheckConstraint("type in ('income','expense')", name="ck_tx_type"))

    def to_dict(self):
        return {"id": self.id, "title": self.title, "amount": float(self.amount), "category": self.category,
                "type": self.type, "date": self.date.isoformat(), "notes": self.notes}

class Budget(db.Model):
    __tablename__ = "budgets"
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(40), nullable=False)
    month = db.Column(db.String(7), nullable=False)  # YYYY-MM
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    __table_args__ = (db.UniqueConstraint("category", "month", name="uq_budget_category_month"),
                      db.CheckConstraint("amount > 0", name="ck_budget_amount_positive"))
