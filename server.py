from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sudachipy import dictionary, tokenizer
from sudachipy import config as sudachi_config
import re

try:
	from pykakasi import kakasi
	has_kakasi = True
except Exception:
	has_kakasi = False

app = FastAPI()
app.add_middleware(
	CORSMiddleware,
	allow_origins=["*"],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)

class FuriganaRequest(BaseModel):
	text: str
	skip_kana: bool = True

# Initialize Sudachi tokenizer once (full dictionary recommended)
_sudachi = dictionary.Dictionary().create()
_mode = tokenizer.Tokenizer.SplitMode.C

# Helpers similar to the reference provided
KANA = r"[\u3040-\u309F\u30A0-\u30FFー]"
KANJI = re.compile(r"[\u3400-\u9FFF]")
PREFIX_RE = re.compile(rf"^{KANA}+")
SUFFIX_RE = re.compile(rf"{KANA}+$")
STRIP_EDGES_RE = re.compile(rf"^{KANA}+|{KANA}+$")
JP_RUN_RE = re.compile(rf"[\u3400-\u9FFF\u3040-\u309F\u30A0-\u30FF々〻ー]+")

kata_to_hira = lambda s: re.sub(r"[\u30a1-\u30f6]", lambda m: chr(ord(m.group(0)) - 0x60), s)

def has_kanji(s: str) -> bool:
	return bool(KANJI.search(s))

def align_okurigana(surface: str, reading_hira: str):
	prefix = (PREFIX_RE.search(surface) or [""])[0]
	suffix = (SUFFIX_RE.search(surface) or [""])[0]

	pref_h = kata_to_hira(prefix)
	suf_h = kata_to_hira(suffix)

	if pref_h and reading_hira.startswith(pref_h):
		reading_hira = reading_hira[len(pref_h):]
	if suf_h and reading_hira.endswith(suf_h):
		reading_hira = reading_hira[: -len(suf_h)]

	kanji_core = STRIP_EDGES_RE.sub("", surface)
	return prefix, kanji_core, suffix, reading_hira

def token_to_ruby(surface: str, reading_kata: str, skip_kana: bool = True) -> str:
	if not reading_kata:
		return surface
	hira = kata_to_hira(reading_kata)
	if not has_kanji(surface):
		return surface if skip_kana else f"<ruby><rb>{surface}</rb><rt>{hira}</rt></ruby>"
	prefix, core, suffix, reading_core = align_okurigana(surface, hira)
	if not core or not reading_core:
		return surface
	return f"{prefix}<ruby><rb>{core}</rb><rt>{reading_core}</rt></ruby>{suffix}"

def tokenize_hiragana(text: str) -> str:
	parts = []
	for m in _sudachi.tokenize(text, _mode):
		reading = m.reading_form() or ""
		if not reading and conv and has_kanji(m.surface()):
			reading = conv.do(m.surface())
		parts.append(kata_to_hira(reading))
	return "".join(parts)

def extract_user_hints(source: str) -> dict:
	"""Harvest 漢字(かな) hints from input to prefer user readings without editing dictionaries."""
	hints = {}
	if not source:
		return hints
	for base, rt in re.findall(r"([\u3400-\u9FFF々〻]+)\s*[\(（]([\u3040-\u30ffー]+)[\)）]", source):
		hira = kata_to_hira(rt)
		if base not in hints or len(hints[base]) < len(hira):
			hints[base] = hira
	return hints

def strip_existing_furigana(source: str) -> str:
	"""Remove existing ruby/bracket annotations while keeping the base text intact."""
	if not source:
		return source
	cleaned = source
	cleaned = re.sub(r"<ruby>([\s\S]*?)<rt[\s\S]*?<\/rt><\/ruby>", r"\1", cleaned)
	cleaned = re.sub(r"([\u3400-\u9FFF\uF900-\uFAFF々〻]+)\s*[\(（]([\u3040-\u30ffー]+)[\)）]", r"\1", cleaned)
	return cleaned

def _is_compound_candidate(m) -> bool:
	"""Heuristic: group kanji nouns/proper-nouns into one compound."""
	try:
		pos = m.part_of_speech()  # (品詞1, 品詞2, ...)
		surf = m.surface()
		return has_kanji(surf) and (pos and (pos[0] == '名詞' or pos[1] in ('固有名詞', '一般')))
	except Exception:
		return has_kanji(m.surface())

def _reading_for_morpheme(m) -> str:
	reading = m.reading_form() or ""
	if not reading and conv and has_kanji(m.surface()):
		reading = conv.do(m.surface())
	return reading

def run_to_ruby(segment: str, skip_kana: bool, hints: dict) -> str:
	"""Annotate with compound-aware grouping: merge consecutive kanji nouns into a single ruby.
	Fallback to per-token when grouping fails."""
	# If Sudachi unavailable
	if _sudachi is None or _mode is None:
		if not has_kanji(segment):
			return segment
		reading = conv.do(segment) if conv else ""
		return token_to_ruby(segment, reading, skip_kana)

	parts = []
	group_surfaces = []
	group_readings = []

	def flush_group():
		"""Emit current group with best effort; fallback to per-token if needed."""
		nonlocal group_surfaces, group_readings, parts
		if not group_surfaces:
			return
		surf_concat = ''.join(group_surfaces)
		reading_concat_kata = ''.join(group_readings)
		reading_concat_hira = kata_to_hira(reading_concat_kata)
		# User hint has highest priority for the whole group
		hinted = hints.get(surf_concat)
		if hinted:
			prefix, core, suffix, reading_core = align_okurigana(surf_concat, hinted)
			if core and reading_core:
				parts.append(f"{prefix}<ruby><rb>{core}</rb><rt>{reading_core}</rt></ruby>{suffix}")
				group_surfaces, group_readings = [], []
				return
		# Try aligned compound
		prefix, core, suffix, reading_core = align_okurigana(surf_concat, reading_concat_hira)
		if core and reading_core:
			parts.append(f"{prefix}<ruby><rb>{core}</rb><rt>{reading_core}</rt></ruby>{suffix}")
		else:
			# Per-token fallback
			for s, r in zip(group_surfaces, group_readings):
				parts.append(token_to_ruby(s, r, skip_kana))
		group_surfaces, group_readings = [], []

	for m in _sudachi.tokenize(segment, _mode):
		surf = m.surface()
		if not has_kanji(surf):
			# Flush any ongoing group, then append kana/punct as-is
			flush_group()
			parts.append(surf)
			continue
		# Single-token user hint
		hint = hints.get(surf)
		if hint:
			flush_group()
			prefix, core, suffix, reading_core = align_okurigana(surf, hint)
			if core and reading_core:
				parts.append(f"{prefix}<ruby><rb>{core}</rb><rt>{reading_core}</rt></ruby>{suffix}")
				continue
		# Decide grouping
		if _is_compound_candidate(m):
			group_surfaces.append(surf)
			group_readings.append(_reading_for_morpheme(m))
		else:
			flush_group()
			reading = _reading_for_morpheme(m)
			parts.append(token_to_ruby(surf, reading, skip_kana))

	# Flush tail
	flush_group()
	return "".join(parts)

# Optional fallback: pykakasi for unknown readings
_kks = kakasi() if has_kakasi else None
if _kks:
	_kks.setMode("J", "H")
	_kks.setMode("K", "H")
	_kks.setMode("H", "H")
	conv = _kks.getConverter()
else:
	conv = None

@app.post("/api/furigana")
async def generate(req: FuriganaRequest):
	text = req.text or ""
	# 1) harvest user hints and strip existing annotations
	hints = extract_user_hints(text)
	cleaned = strip_existing_furigana(text)
	# 2) walk the original string, converting only Japanese runs, preserving everything else verbatim
	parts = []
	pos = 0
	for m in JP_RUN_RE.finditer(cleaned):
		start, end = m.span()
		if start > pos:
			parts.append(cleaned[pos:start])
		segment = cleaned[start:end]
		parts.append(run_to_ruby(segment, req.skip_kana, hints))
		pos = end
	if pos < len(cleaned):
		parts.append(cleaned[pos:])
	return {"html": "".join(parts)}

# Mount static files at root so Render can serve the frontend from the same service
# Note: API routes are defined above, so they take precedence over the static mount
app.mount("/", StaticFiles(directory=".", html=True), name="static")
