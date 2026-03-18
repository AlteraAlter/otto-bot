from __future__ import annotations

import json
import math
import os
import re
import unicodedata
from pathlib import Path
from typing import Any

SPLIT_RE = re.compile(r"[^a-z0-9]+")
SPACE_RE = re.compile(r"\s+")
MIN_TOKEN_LEN = 3

TEXT_FIELDS = (
    "Produktart",
    "Artikelbeschreibung",
    "Marke",
    "Zimmer",
    "Stil",
)

FIELD_WEIGHTS: dict[str, int] = {
    "Produktart": 6,
    "Artikelbeschreibung": 5,
    "Marke": 2,
    "Zimmer": 1,
    "Stil": 1,
}

STOP_TOKENS = {
    "set",
    "mit",
    "und",
    "der",
    "die",
    "das",
    "fur",
    "fuer",
    "the",
    "stoff",
    "textil",
    "design",
    "luxus",
    "modern",
    "klassisch",
    "neu",
    "moebel",
    "mobel",
    "big",
    "xxl",
}


class CategoryMapper:
    def __init__(self, category_groups: list[list[str]]):
        self.categories = self._build_category_index(category_groups)
        self.token_index = self._build_token_index(self.categories)
        self.idf = self._build_idf(self.categories)

    @classmethod
    def from_default_file(cls) -> "CategoryMapper":
        env_path = os.getenv("OTTO_CATEGORIES_FILE")
        if env_path:
            path = Path(env_path)
        else:
            path = Path(__file__).resolve().parent / "available_cats.json"

        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise ValueError("Category file must be a JSON list")

        groups: list[list[str]] = []
        for group in payload:
            if isinstance(group, list):
                groups.append([str(item) for item in group if str(item).strip()])
            elif isinstance(group, str) and group.strip():
                groups.append([group.strip()])
        return cls(groups)

    @staticmethod
    def _normalize_text(value: Any) -> str:
        if value is None:
            return ""
        text = str(value).strip().lower()
        text = unicodedata.normalize("NFKD", text)
        text = "".join(ch for ch in text if not unicodedata.combining(ch))
        text = (
            text.replace("ä", "ae")
            .replace("ö", "oe")
            .replace("ü", "ue")
            .replace("ß", "ss")
        )
        text = SPLIT_RE.sub(" ", text)
        return SPACE_RE.sub(" ", text).strip()

    @staticmethod
    def _usable_token(token: str) -> bool:
        return len(token) >= MIN_TOKEN_LEN and token not in STOP_TOKENS

    @classmethod
    def _tokenize(cls, text: str) -> list[str]:
        return [token for token in text.split() if cls._usable_token(token)]

    @classmethod
    def _build_category_index(cls, category_groups: list[list[str]]) -> list[dict[str, Any]]:
        index: list[dict[str, Any]] = []
        for cat_id, group in enumerate(category_groups):
            if not group:
                continue

            synonyms: list[dict[str, Any]] = []
            for raw in group:
                norm = cls._normalize_text(raw)
                if not norm:
                    continue
                tokens = cls._tokenize(norm)
                if not tokens:
                    continue
                synonyms.append({"raw": raw, "norm": norm, "tokens": tokens})

            if not synonyms:
                continue

            index.append({"id": cat_id, "canonical": group[0], "synonyms": synonyms})
        return index

    @staticmethod
    def _build_token_index(categories: list[dict[str, Any]]) -> dict[str, set[tuple[int, int]]]:
        token_index: dict[str, set[tuple[int, int]]] = {}
        for cat_pos, category in enumerate(categories):
            for syn_pos, synonym in enumerate(category["synonyms"]):
                for token in set(synonym["tokens"]):
                    token_index.setdefault(token, set()).add((cat_pos, syn_pos))
        return token_index

    @staticmethod
    def _build_idf(categories: list[dict[str, Any]]) -> dict[str, float]:
        token_df: dict[str, int] = {}
        total_synonyms = 0

        for category in categories:
            for synonym in category["synonyms"]:
                total_synonyms += 1
                for token in set(synonym["tokens"]):
                    token_df[token] = token_df.get(token, 0) + 1

        if total_synonyms <= 0:
            return {}

        return {
            token: math.log((1 + total_synonyms) / (1 + freq)) + 1.0
            for token, freq in token_df.items()
        }

    def map_category(
        self,
        *,
        product_type: str | None = None,
        title: str | None = None,
        brand: str | None = None,
        room: str | None = None,
        style: str | None = None,
    ) -> str | None:
        fields = {
            "Produktart": product_type,
            "Artikelbeschreibung": title,
            "Marke": brand,
            "Zimmer": room,
            "Stil": style,
        }

        field_texts: dict[str, str] = {}
        token_weights: dict[str, int] = {}
        joined_parts: list[str] = []

        for field in TEXT_FIELDS:
            value = fields.get(field)
            if value is None:
                continue
            values = value if isinstance(value, list) else [value]

            for raw in values:
                norm = self._normalize_text(raw)
                if not norm:
                    continue
                field_texts[field] = (field_texts.get(field, "") + " " + norm).strip()
                for token in self._tokenize(norm):
                    token_weights[token] = max(token_weights.get(token, 0), FIELD_WEIGHTS[field])
                joined_parts.append(norm)

        if not token_weights:
            return None

        candidates: set[tuple[int, int]] = set()
        for token in token_weights:
            if token in self.token_index:
                candidates.update(self.token_index[token])

        if not candidates:
            return None

        exact_product_type = self._best_exact_match(
            field_texts.get("Produktart", ""),
            candidates,
            base_score=1000.0,
        )
        if exact_product_type is not None:
            return exact_product_type

        exact_title = self._best_exact_match(
            field_texts.get("Artikelbeschreibung", ""),
            candidates,
            base_score=800.0,
        )
        if exact_title is not None:
            return exact_title

        return self._best_idf_match(" ".join(joined_parts).strip(), token_weights, candidates)

    def _best_exact_match(
        self,
        text: str,
        candidates: set[tuple[int, int]],
        *,
        base_score: float,
    ) -> str | None:
        if not text:
            return None

        haystack = f" {text} "
        best_score: float | None = None
        best: str | None = None

        for cat_pos, syn_pos in candidates:
            synonym = self.categories[cat_pos]["synonyms"][syn_pos]
            synonym_norm = synonym["norm"]
            if len(synonym_norm) < 4:
                continue
            if f" {synonym_norm} " not in haystack:
                continue

            score = base_score + (20.0 * len(synonym["tokens"])) + len(synonym_norm)
            if best_score is None or score > best_score:
                best_score = score
                best = self.categories[cat_pos]["canonical"]

        return best

    def _best_idf_match(
        self,
        joined_text: str,
        token_weights: dict[str, int],
        candidates: set[tuple[int, int]],
    ) -> str | None:
        haystack = f" {joined_text} "
        best_score: float | None = None
        best: str | None = None

        for cat_pos, syn_pos in candidates:
            synonym = self.categories[cat_pos]["synonyms"][syn_pos]
            synonym_tokens = synonym["tokens"]
            overlap = [token for token in synonym_tokens if token in token_weights]
            if not overlap:
                continue

            overlap_weighted = sum(self.idf.get(t, 1.0) * token_weights[t] for t in overlap)
            total_syn_weight = sum(self.idf.get(t, 1.0) for t in synonym_tokens)
            coverage = overlap_weighted / max(total_syn_weight, 1e-9)
            phrase_bonus = 1.0 if f" {synonym['norm']} " in haystack else 0.0
            specificity = sum(self.idf.get(t, 1.0) for t in overlap)
            score = (coverage * 100.0) + (20.0 * phrase_bonus) + (2.0 * specificity)

            if best_score is None or score > best_score:
                best_score = score
                best = self.categories[cat_pos]["canonical"]

        return best


_default_mapper: CategoryMapper | None = None


def get_default_category_mapper() -> CategoryMapper:
    global _default_mapper
    if _default_mapper is None:
        _default_mapper = CategoryMapper.from_default_file()
    return _default_mapper
