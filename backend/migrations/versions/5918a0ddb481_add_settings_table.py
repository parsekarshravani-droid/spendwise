"""add settings table

Revision ID: 5918a0ddb481
Revises: 3d85615b460a
Create Date: 2026-10-24 19:51:44.430401

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5918a0ddb481'
down_revision = '3d85615b460a'
branch_labels = None
depends_on = None


def upgrade():
    # Additive only: creates the new settings table. Existing tables and rows are not touched.
    op.create_table('settings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('display_name', sa.String(length=60), server_default='', nullable=False),
    sa.Column('currency', sa.String(length=3), server_default='INR', nullable=False),
    sa.Column('date_format', sa.String(length=12), server_default='DD/MM/YYYY', nullable=False),
    sa.Column('monthly_income_target', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('monthly_spending_limit', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('theme', sa.String(length=10), server_default='system', nullable=False),
    sa.Column('notifications_enabled', sa.Boolean(), server_default=sa.true(), nullable=False),
    sa.Column('budget_alert_threshold', sa.Integer(), server_default='80', nullable=False),
    sa.Column('monthly_summary_enabled', sa.Boolean(), server_default=sa.false(), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("currency in ('INR','USD','EUR','GBP','AED')", name='ck_settings_currency'),
    sa.CheckConstraint("theme in ('light','dark','system')", name='ck_settings_theme'),
    sa.CheckConstraint('budget_alert_threshold between 50 and 100', name='ck_settings_threshold'),
    sa.CheckConstraint('id = 1', name='ck_settings_singleton'),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('settings')
