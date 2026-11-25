import os

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

import netguard.model  # noqa: F401

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://netguard:netguard@localhost:5433/netguard"
)

# pool_pre_ping: połączenie zerwane np. po restarcie bazy jest wykrywane i odnawiane zamiast zwracać błąd
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Indeksy dla zapytań wykonywanych przy każdej analizie i każdym odświeżeniu listy alertów.
# create_all() nie dodaje indeksów do istniejących tabel, dlatego tworzymy je jawnie (IF NOT EXISTS).
INDEXES = (
    "CREATE INDEX IF NOT EXISTS ix_alerts_status ON alerts (status)",
    "CREATE INDEX IF NOT EXISTS ix_alerts_created_at ON alerts (created_at)",
    "CREATE INDEX IF NOT EXISTS ix_alerts_detection_id ON alerts (detection_id)",
    "CREATE INDEX IF NOT EXISTS ix_detections_flow_id ON detections (flow_id)",
)


def init_db(db_engine=engine) -> None:
    with db_engine.begin() as connection:
        if connection.dialect.name == "postgresql":
            # Kilka procesów API startuje równocześnie; blokada sprawia, że tabele tworzy tylko jeden naraz
            connection.execute(text("SELECT pg_advisory_xact_lock(4242)"))
        SQLModel.metadata.create_all(connection)
        for statement in INDEXES:
            connection.execute(text(statement))


def get_session():
    # expire_on_commit=False: po commit obiekty zachowują wartości, więc odczyt id czy serializacja
    # odpowiedzi nie wysyła osobnego SELECT dla każdego zapisanego wiersza (problem N+1)
    with Session(engine, expire_on_commit=False) as session:
        yield session
