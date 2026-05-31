import logging
from pathlib import Path

import joblib
import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)

_model = None


def load_model() -> None:
    global _model
    path = Path(settings.model_path)
    if path.exists():
        _model = joblib.load(path)
        logger.info("At-risk classifier loaded from %s", path)
    else:
        logger.warning("Model file not found at %s — run scripts/seed.py first", path)
        _model = None


def get_model():
    return _model


def predict_at_risk(features: np.ndarray) -> np.ndarray:
    """Return probability scores for each student (shape: n_students,)."""
    if _model is None:
        raise RuntimeError("Model not loaded. Run scripts/seed.py first.")
    return _model.predict_proba(features)[:, 1]
