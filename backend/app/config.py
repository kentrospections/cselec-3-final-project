from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    kafka_bootstrap_servers: str
    kafka_topic: str = "grade-updates"
    kafka_simulate_interval: int = 0
    model_path: str = "model/at_risk_classifier.joblib"

    model_config = {"env_file": ".env", "protected_namespaces": ()}


settings = Settings()
