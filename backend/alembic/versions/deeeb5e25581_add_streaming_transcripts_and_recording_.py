"""add streaming transcripts and recording status

Revision ID: deeeb5e25581
Revises: aa21300a5382
Create Date: 2026-05-21 12:48:59.605414

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'deeeb5e25581'
down_revision: Union[str, None] = 'aa21300a5382'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_OLD_STATUSES = ('created', 'processing', 'completed', 'failed')
_NEW_STATUSES = ('created', 'recording', 'processing', 'completed', 'failed')


def upgrade() -> None:
    op.create_table(
        'transcripts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('sequence', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(),
            server_default=sa.text('(CURRENT_TIMESTAMP)'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', 'sequence', name='uq_transcripts_session_seq'),
    )
    with op.batch_alter_table('transcripts', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_transcripts_session_id'), ['session_id'], unique=False
        )

    # SQLite stores Enum() as a CHECK constraint. Alembic's autogenerate
    # doesn't diff CHECK constraints, so we rebuild the sessions.status
    # column manually in batch mode to widen the enum to include "recording".
    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.alter_column(
            'status',
            existing_type=sa.Enum(*_OLD_STATUSES, name='session_status'),
            type_=sa.Enum(*_NEW_STATUSES, name='session_status'),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.alter_column(
            'status',
            existing_type=sa.Enum(*_NEW_STATUSES, name='session_status'),
            type_=sa.Enum(*_OLD_STATUSES, name='session_status'),
            existing_nullable=False,
        )
    with op.batch_alter_table('transcripts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_transcripts_session_id'))
    op.drop_table('transcripts')
