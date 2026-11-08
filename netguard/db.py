import os

from sqlmodel import Session, SQLModel, create_engine

import netguard.model  # noqa: F401

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://netguard:netguard@localhost:5433/netguard"
)

engine = create_engine(DATABASE_URL)

def init_db(db_engine=engine) -> None:
    SQLModel.metadata.create_all(db_engine)

def get_session():
    with Session(engine) as session:
        yield session