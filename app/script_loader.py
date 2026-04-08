"""Helpers for loading legacy repo-root scripts as stable package modules."""

from __future__ import annotations

import importlib.util
import sys
from functools import lru_cache
from pathlib import Path
from types import ModuleType


@lru_cache(maxsize=None)
def load_repo_root_module(module_name: str, file_name: str) -> ModuleType:
    """Load a repo-root Python file and cache the imported module object."""
    root_dir = Path(__file__).resolve().parent.parent
    module_path = root_dir / file_name
    root_str = str(root_dir)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise ModuleNotFoundError(f"Could not load module from {module_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module
