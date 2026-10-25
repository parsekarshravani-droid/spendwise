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


class Settings(db.Model):
    """Global app settings. The app has no authentication, so there is exactly one row (id = 1)
    shared by every visitor. Add a user_id column when authentication is introduced."""
    __tablename__ = "settings"
    id = db.Column(db.Integer, primary_key=True)
    display_name = db.Column(db.String(60), nullable=False, default="", server_default="")
    currency = db.Column(db.String(3), nullable=False, default="INR", server_default="INR")
    date_format = db.Column(db.String(12), nullable=False, default="DD/MM/YYYY", server_default="DD/MM/YYYY")
    monthly_income_target = db.Column(db.Numeric(12, 2), nullable=True)
    monthly_spending_limit = db.Column(db.Numeric(12, 2), nullable=True)
    theme = db.Column(db.String(10), nullable=False, default="system", server_default="system")
    notifications_enabled = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    budget_alert_threshold = db.Column(db.Integer, nullable=False, default=80, server_default="80")
    monthly_summary_enabled = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    version = db.Column(db.Integer, nullable=False, default=1, server_default="1")  # optimistic concurrency
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    __table_args__ = (
        db.CheckConstraint("id = 1", name="ck_settings_singleton"),
        db.CheckConstraint("currency in ('INR','USD','EUR','GBP','AED')", name="ck_settings_currency"),
        db.CheckConstraint("theme in ('light','dark','system')", name="ck_settings_theme"),
        db.CheckConstraint("budget_alert_threshold between 50 and 100", name="ck_settings_threshold"),
    )

    def to_dict(self):
        f = lambda v: None if v is None else float(v)
        return {"display_name": self.display_name, "currency": self.currency, "date_format": self.date_format,
                "monthly_income_target": f(self.monthly_income_target), "monthly_spending_limit": f(self.monthly_spending_limit),
                "theme": self.theme, "notifications_enabled": self.notifications_enabled,
                "budget_alert_threshold": self.budget_alert_threshold,
                "monthly_summary_enabled": self.monthly_summary_enabled, "version": self.version,
                "updated_at": self.updated_at.isoformat() if self.updated_at else None}
