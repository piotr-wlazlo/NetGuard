from netguard.detection.detectors.rules import RulesDetector
from netguard.detection.detectors.statistical import StatisticalDetector


def build_detectors(ml_model_path=None):
    detectors = [RulesDetector(), StatisticalDetector()]
    if ml_model_path:
        from netguard.detection.detectors.ml import IsolationForestDetector
        detectors.append(IsolationForestDetector.load(ml_model_path))
    return detectors
