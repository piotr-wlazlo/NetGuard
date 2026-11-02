from collections import defaultdict, deque
from dataclasses import dataclass

import numpy as np

MAD_SCALE = 0.6745


@dataclass(frozen=True)
class BaselineStats:
    median: float
    mad: float
    n_windows: int
    n_values: int


def robust_z(value, stats, mad_floor):
    return MAD_SCALE * (value - stats.median) / max(stats.mad, mad_floor)


class Baseline:
    def __init__(self, max_values=5000):
        self.max_values = max_values
        self._values = defaultdict(lambda: deque(maxlen=max_values))
        self._windows = defaultdict(int)

    def update(self, entity, features):
        for name, values in features.items():
            self._values[(entity, name)].extend(values)
        self._windows[entity] += 1

    def n_windows(self, entity):
        return self._windows.get(entity, 0)

    def stats(self, entity, feature):
        values = self._values.get((entity, feature))
        if not values:
            return None
        arr = np.fromiter(values, dtype=float)
        median = float(np.median(arr))
        mad = float(np.median(np.abs(arr - median)))
        return BaselineStats(median, mad, self._windows[entity], len(arr))
