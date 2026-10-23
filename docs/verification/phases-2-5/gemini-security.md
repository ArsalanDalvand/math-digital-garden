### **Review RBAC**

- Self-approval bypass in review endpoint (`backend/app/workspace.py:240`):
  Authors can review and approve their own change proposals (`p.user_id == user.id`), violating the author review boundary and separation of duties.
  **Minimal fix**:
  ```python
  if p.user_id == user.id:
      raise HTTPException(403, 'Authors cannot review their own proposals')
  ```

- Unsafe assertion handling in production (`backend/app/workspace.py:251`):
  `assert note is not None and p is not None` is stripped when Python runs under optimization (`-O`), resulting in an unhandled 500 `AttributeError` if a proposal or canonical note is deleted concurrently.
  **Minimal fix**:
  ```python
  if note is None or p is None:
      raise HTTPException(404, 'Proposal or note not found')
  ```

---

### **Data Loss and State Desync**

- Proposer fork left desynced after proposal approval (`backend/app/workspace.py:255`):
  When `decide` approves a proposal and merges changes into `CanonicalNote`, it does not update the student's `UserNoteFork`. The student's fork retains its old `base_hash` and `base_content`. Future diffs continue displaying already-merged content as unmerged modifications, and any future proposal will fail review with `409 'Canonical base changed'` unless the student resets their fork, which overwrites newer edits (data loss).
  **Minimal fix**:
  ```python
  fork = await owned_fork(db, note.id, p.user_id, lock=True)
  if fork is not None:
      fork.base_content, fork.base_hash = note.current_content, note.current_hash
      if fork.custom_content == p.proposed_content:
          fork.custom_content, fork.current_hash = note.current_content, note.current_hash
  ```

- Proposal creation on stale canonical base (`backend/app/workspace.py:217`):
  `propose` does not verify `fork.base_hash == note.current_hash`. If canonical notes were updated since the student branched, the proposal is created with a stale `base_hash` that will permanently fail approval in `decide` with a 409 error.
  **Minimal fix**:
  ```python
  if fork.base_hash != note.current_hash:
      raise HTTPException(409, 'Fork base is out of date; sync before proposing')
  ```

---

### **Raw Markdown Preservation**

- Canonical content corruption through patch round-trip (`backend/app/workspace.py:257`):
  `decide` generates canonical content via `dmp.patch_apply(dmp.patch_fromText(p.diff_patch), note.current_content)`. Google `diff-match-patch` performs URI decoding and heuristic chunk matching that can alter LaTeX equations (e.g. `+` signs, multiline formulas, RTL Persian text), violating Zero Round-Trip Loss. Since approval already asserts `note.current_hash == p.base_hash`, `p.proposed_content` is the exact author-validated markdown.
  **Minimal fix**:
  ```python
  note.current_content, note.current_hash = p.proposed_content, digest(p.proposed_content)
  ```

---

### **Save Concurrency**

- Global lock contention on `CanonicalNote` during fork saves (`backend/app/workspace.py:191`):
  `save_fork` locks `CanonicalNote` with `lock=True` (`SELECT ... FOR UPDATE`). Personal fork saves only mutate `UserNoteFork` and `ForkRevision`. Locking the shared canonical note row serializes saves across all students editing the same note, causing severe database contention and timeouts.
  **Minimal fix**:
  ```python
  note = await note_by_slug(db, slug, lock=False)
  ```

- Unhandled unique constraint collision on concurrent first fork (`backend/app/workspace.py:196`):
  When a user saves a fork for the first time (`fork is None`), concurrent requests bypass `owned_fork` locking (non-existent row). Both enter `db.add(fork)`, causing an unhandled `IntegrityError` on `uq_user_note` and returning a 500 error instead of a 409 conflict or idempotently updating.
  **Minimal fix**:
  Wrap initial fork creation in `try...except IntegrityError` and re-query or raise `HTTPException(409, 'Concurrent fork creation')`.

---

### **CSRF Protection**

- Missing Origin check bypass in `write_guard` (`backend/app/workspace.py:48`):
  `write_guard` validates `origin` only when present (`if origin and origin.rstrip('/') not in allowed:`). If `Origin` is omitted (or stripped by privacy plugins/cross-origin proxies), validation succeeds without falling back to `Referer` or requiring origin verification.
  **Minimal fix**:
  ```python
  origin = request.headers.get('origin') or request.headers.get('referer')
  if not origin or not any(origin.rstrip('/').startswith(a) for a in allowed):
      raise HTTPException(403, 'Valid Origin or Referer required')
  ```