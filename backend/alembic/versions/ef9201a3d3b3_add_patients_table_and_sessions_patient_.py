"""add patients table and sessions.patient_id

Revision ID: ef9201a3d3b3
Revises: e654e9c4c28d
Create Date: 2026-05-21 19:32:50.197132

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ef9201a3d3b3'
down_revision: Union[str, None] = 'e654e9c4c28d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'patients',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('full_label', sa.String(length=120), nullable=False),
        sa.Column('date_of_birth', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(),
            server_default=sa.text('(CURRENT_TIMESTAMP)'),
            nullable=False,
        ),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_patients_user_id'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('patients', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_patients_user_id'), ['user_id'], unique=False
        )

    # SQLite batch mode requires named FK constraints when added via
    # batch_op.create_foreign_key; passing None for the name explodes
    # with "Constraint must have a name" during the batch table rebuild.
    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('patient_id', sa.Integer(), nullable=True))
        batch_op.create_index(
            batch_op.f('ix_sessions_patient_id'), ['patient_id'], unique=False
        )
        batch_op.create_foreign_key(
            'fk_sessions_patient_id',
            'patients',
            ['patient_id'],
            ['id'],
        )


def downgrade() -> None:
    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.drop_constraint('fk_sessions_patient_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_sessions_patient_id'))
        batch_op.drop_column('patient_id')

    with op.batch_alter_table('patients', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_patients_user_id'))

    op.drop_table('patients')
