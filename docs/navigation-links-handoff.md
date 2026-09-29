# Navigation links — what naijagov-api needs to do

**For:** whoever works on naijagov-api.
**From:** the extension repo, which has already shipped its half.

---

## The bug this came from

A user on the portal's landing page asked:

> I am on the landing page and want to renew my license, what should I select first and what steps should I take next

and got back:

> The current page snapshot shows no fields or buttons to interact with. Please look on the landing page for a button or menu option labeled "Renew License" or "License Renewal." Once you find it, let me know or provide a snapshot of that page, and I will guide you through the next steps.

That reply is the product failing at its whole job — it asks the person who is stuck to go and find the thing they are stuck on, and report back.

Two causes. **One was ours and is fixed.** The other is yours.

---

## What we fixed (already shipped, no action needed from you)

The extension's serializer only ever collected `<button>`, button-ish `<input>`s, and `<a role="button">`. A portal landing page has no form and no buttons — every route into it is an ordinary `<a href>`. So the snapshot genuinely was empty, and the model was describing its input accurately.

The serializer now collects navigation links. On our `replica/landing.html` fixture that took the page from 0 usable elements to 10 named routes.

**What this changes for you, today, with no work on your side:** links arrive **folded into `buttons`** on `/context` and `/plan`. Both your request models are `extra="forbid"`, so a `links` key of our own would 400 every request until you declare one. Folding is the only thing that could reach you without a coordinated deploy.

So a landing page now sends you something like:

```json
"buttons": [
  { "field_id": "g1-f1", "text": "Home",                        "sensitive": false },
  { "field_id": "g1-f2", "text": "Renew Licence",               "sensitive": false },
  { "field_id": "g1-f3", "text": "Make a payment",              "sensitive": true  },
  { "field_id": "g1-f6", "text": "Renew your driver's licence", "sensitive": false }
]
```

Verified against your running instance: `/context` and `/plan` both accept it, and the reply to the question above became:

> To start renewing your driver's licence, please select the "Renew Licence" option (g1-f2) on the landing page. After that, you will be guided through the application steps for renewal.

Which is the right answer — and which surfaces the two problems below.

### Caps you should know we now respect

Your `buttons` and `sensitive_flags` are `max_length`, which **rejects the whole request** rather than truncating. Our own caps are 100 buttons + 40 links = up to 140, so we now cut the folded list to **100**, form controls first and navigation filling whatever room is left. We also drop any `sensitive_flags` entry whose `field_id` did not survive that cut, so nothing dangles.

---

## What you need to do

### 1. Stop the model asking the user to go and look

**Priority: highest. This is the actual reported bug and it is independent of everything else.**

Even with an empty snapshot, "provide a snapshot of that page and I will guide you" is the wrong shape of answer. The extension is the eyes; asking the user to be the eyes inverts the product.

A "where do I start / what do I click first / what comes next" question should be answerable from the workflow and step knowledge you already hold, **without** reading the DOM. The landing page matched a workflow in my test (`supported: true`), so the rules were there — the prompt just routed the turn as a fill-planning turn and reported that it had nothing to fill.

Concretely: a turn that proposes no actions is still a turn that can answer a question. It should not describe its own input ("the current page snapshot shows no fields or buttons") to the user at all — that is an implementation detail of ours leaking into their reading.

### 2. Don't put `field_id` in user-facing prose

Observed in the live reply above: `select the "Renew Licence" option (g1-f2)`.

`g1-f2` is our internal registry id. It means nothing to a citizen, it looks like an error code, and it appears in a sentence they are meant to act on. Ids belong in `actions[].field_id`, never in `reply`.

### 3. Declare a real `links` field, so we can delete the fold

**Additive and optional, and it must ship before we change anything.** Order matters: you deploy, then we remove the fold in a follow-up. If we removed it first, links would stop reaching you entirely.

Suggested shape, mirroring what we already hold locally:

```python
# src/context/constants.py
MAX_LINKS: Final = 40  # matches the extension's own cap

# src/context/schemas.py
class PageLink(SnapshotModel):
    """A navigation link. Read, never clicked — following one is the user's decision."""

    field_id: FieldId
    text: Label = ""
    # Origin and path only. The extension strips the query string before sending,
    # for the same reason it strips it from `url`: a method="get" form puts what the
    # user typed into the next page's URL.
    href: Annotated[str, Field(max_length=MAX_URL_LENGTH)] = ""
    external: bool = False
    sensitive: bool = False


# on both ContextRequest and PlanRequest
links: list[PageLink] = Field(default_factory=list, max_length=MAX_LINKS)
```

Why it is worth doing rather than living with the fold:

- **`href` and `external` are lost today.** Folded into a button, a link keeps only its text. Knowing that "Make a payment" goes to `remita.net`, or that "Contact us" leaves the site, is exactly the kind of thing worth grounding an answer in.
- **The model currently cannot tell a link from a button**, so it may plan a `clickSafe` on one. See the next item.
- **A landing page's navigation crowds out a form's controls** under one shared 100 cap. Separate lists, separate budgets.

### 4. Never plan `clickSafe` on a link

Once you can tell them apart, the guard should refuse it — and it is worth knowing why rather than treating it as arbitrary.

**We already reject it**, and will keep rejecting it whatever you send: the validator clears `clickSafe` only for something `isButtonLike` accepts, and a navigation link is not. Following a link navigates the tab away, and that stays the user's decision for the same reason "Continue" is theirs — per `CLAUDE.md`, *"in the MVP, Continue is the user's click, because on some portals Continue also submits."*

So a planned click on a link is not dangerous, it is just wasted: it comes back as a `WRONG_TYPE` rejection the user has to read. Refusing it on your side turns a visible failure into a non-event.

### 5. Be aware: a flagged link does not gate the page

A portal's masthead carries "Make a payment" on **every** page, including pages with no payment on them. We flag such a link `sensitive: true`, but we deliberately **do not** let it raise the `CHECKPOINT` state — that would stop the Copilot dead on a landing page. Same call, and same reasoning, as the E2 decision that a password field is field-level sensitive rather than page-blocking.

Only a CAPTCHA or payment **frame** gates a page. If your guard mirrors our checkpoint logic anywhere, it needs the same carve-out, or the two sides will disagree about whether a page is usable.

---

## How to check you have it right

Point a `/context` + `/plan` round trip at the extension's `replica/landing.html` fixture (served by `npm run replica`, port 5174) and ask the original question verbatim. The reply should:

- name **"Renew Licence"** as the thing to select
- carry **no** `field_id` in the prose
- **not** ask the user to go and find anything, or to supply a snapshot
- **not** propose a `clickSafe` on it
