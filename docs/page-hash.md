# The page hash

A short, stable fingerprint of a portal page's **structure**, computed in the browser.

> ## Correction — 2026-09-28
>
> **This document's original premise was wrong, and the E3 task found out why.**
>
> It said naijagov-api recomputes *this* hash from the `/context` body and that both
> sides must produce the same sixteen characters. They do not, and they are not meant
> to. The backend computes **its own** hash — SHA-256 over the URL path and the
> `(field_id, normalised label, type)` triples, in `src/context/utils.py` — and its
> contract says the extension **adopts** the value `/context` returns, while the
> `page_hash` the extension sends is "compared, never trusted".
>
> So there are two hashes with two jobs, and neither can do the other's:
>
> | | Algorithm | Computed by | Used for |
> | --- | --- | --- | --- |
> | **Ours** (this document) | FNV-1a 64-bit over the canonical snapshot | the content script | suppressing noise between reads, and the approval-time staleness check |
> | **Theirs** | SHA-256 over path + field triples | naijagov-api | raising `PAGE_CHANGED` on `/plan` |
>
> Everything below still correctly specifies **ours**, and `fixtures/page-hash.json`
> still tests it. What is no longer true is that the backend implements it: job 2
> below ("recognising a stale plan") is done *twice*, once on each side, each with its
> own algorithm. `src/sw/context.ts` holds both values and explains the split.
>
> Nothing here needs to change for the two repos to agree, because they no longer
> need to agree on this.

- Extension implementation: `src/shared/page-hash.ts`
- Fixtures both sides test against: `fixtures/page-hash.json`
- Current version marker: `v1`

## What it is for

Two jobs, and it is worth being precise about them because they pull in opposite
directions.

1. **Suppressing noise.** Portals mutate constantly — a validation message
   appears, a framework re-renders a section, a spinner spins. The extension
   re-reads the page on every mutation and calls `/context` only when this hash
   changes. Without that, every keystroke is a backend request.
2. **Recognising a stale plan.** A plan is built against a page. If the page has
   since become a different page, the plan's field ids refer to elements that may
   no longer be the same elements, and the correct answer is to re-plan rather
   than to fill. The hash is how `/plan` can tell.

A hash that is too sensitive breaks job 1: every keystroke looks like a new page.
A hash that is too coarse breaks job 2: a stale plan is accepted. The inclusion
list below is chosen with that trade in mind.

## What goes in

In this order:

1. The literal version marker, `v1`.
2. The page URL reduced to **origin + path**.
3. One record per field, in the order the fields appear in the snapshot, each
   carrying four parts: **type**, **normalised label**, **required**, **normalised
   option labels**.

## What stays out, and why

| Excluded | Why |
| --- | --- |
| Field values | They never leave the browser. There is no slot for them in the snapshot type. |
| The URL's query string | A form submitted with `method="get"` puts everything the user typed into the next page's URL. Including it would leak values *and* would make every submission look like a new page. |
| Field ids and the generation number | They are minted fresh on every read. Including them would make the hash change on every read, which is the opposite of the point. |
| Buttons | A button's label changes with transient page state ("Save" → "Saving…"). Buttons are still serialized and still flagged by the detector; they just do not move the hash. |
| Headings, hints, `maxlength`, `disabled`, `readonly` | Presentational or transient. A field going disabled while a request is in flight is not a new page. |
| DOM order beyond field order | Two pages that ask the same questions in the same order are the same page, whatever the markup around them. |

## Normalisation

Applied to every label and every option label, and **only for hashing** — never
to the text shown to a user.

1. Unicode **NFKC** normalisation.
2. Replace every run of whitespace with a single space (`U+0020`). This includes
   non-breaking spaces, which NFKC has already folded.
3. Trim leading and trailing whitespace.
4. Strip a trailing required marker, **repeatedly until it stops changing**:
   a trailing `(required)` (any case, optional inner spaces), then a trailing run
   of `*`, trimming after each. `Email address *` and `Email address (required)`
   and `Email address` are the same question; whether a portal marks it in the
   label is a styling decision.
5. Lowercase.

The URL is reduced separately: parse it, take `origin` + `pathname`, and remove a
single trailing `/`. An unparseable URL is used trimmed, as-is.

## Canonical form

Records are joined with `\n` (`U+000A`). Within a field record, the four parts are
joined with `U+001F` (ASCII Unit Separator). Option labels within the fourth part
are joined with `U+001E` (ASCII Record Separator). A field with no options
contributes an empty fourth part — the separator is still there.

`required` is the single character `1` or `0`.

Control characters are used as separators precisely because a portal's label text
cannot contain them, so no label can forge a record boundary.

```
v1 \n
<origin><path> \n
<type> US <label> US <0|1> US <option> RS <option> \n
<type> US <label> US <0|1> US \n
...
```

`type` is the snapshot's `FieldType` string, verbatim and already lowercase:
`text`, `email`, `tel`, `url`, `search`, `number`, `date`, `select`, `checkbox`,
`radio`, `textarea`, `file`, `password`, `other`.

## Digest

**FNV-1a, 64-bit**, over the UTF-8 bytes of the canonical string, rendered as
sixteen lowercase hexadecimal characters, zero-padded.

```
offset basis = 0xcbf29ce484222325
prime        = 0x00000100000001b3
hash = offset basis
for each byte b of utf8(canonical):
    hash = (hash XOR b) * prime  mod 2^64
return hex(hash) padded to 16 characters
```

Not SHA-256, for one concrete reason: `crypto.subtle` does not exist in a content
script running on a plain `http://` page, because that is not a secure context,
and government portals are not reliably https. FNV-1a needs no platform API, is
synchronous, and 64 bits is far more than change detection requires. It is not a
cryptographic hash and nothing here depends on it being one — the hash is never a
security boundary, only a change signal.

## Reference implementation

```python
import unicodedata, re

UNIT, OPTION, RECORD = "\u001f", "\u001e", "\n"
MASK = (1 << 64) - 1

def normalise(text: str) -> str:
    value = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text)).strip()
    while True:
        stripped = re.sub(r"\s*\(\s*required\s*\)$", "", value, flags=re.I)
        stripped = re.sub(r"\s*\*+$", "", stripped).strip()
        if stripped == value:
            break
        value = stripped
    return value.lower()

def canonicalize(url: str, fields: list[dict]) -> str:
    lines = ["v1", normalise_url(url)]
    for field in fields:
        options = OPTION.join(normalise(o["label"]) for o in field.get("options") or [])
        lines.append(UNIT.join([field["type"], normalise(field["label"]),
                                "1" if field["required"] else "0", options]))
    return RECORD.join(lines)

def fnv1a64(text: str) -> str:
    h = 0xCBF29CE484222325
    for b in text.encode("utf-8"):
        h = ((h ^ b) * 0x100000001B3) & MASK
    return format(h, "016x")
```

`normalise_url` parses the URL and returns origin + path with a single trailing
slash removed.

## Changing it

Changing the algorithm changes four things together, in one reviewed change:

1. this document,
2. `fixtures/page-hash.json`,
3. the extension implementation,
4. the backend implementation.

Bump `v1`. A version marker inside the hashed string means an old hash can never
collide with a new one, so a client and a server on different versions disagree
loudly on the first page instead of quietly on an unusual one.
