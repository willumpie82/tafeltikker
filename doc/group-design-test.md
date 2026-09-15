# Groups — manual test plan

Covers everything built so far from `groups-design-plan.md` (steps 1-6).
Automated coverage for all of this already exists and passes
(`e2e/groups.spec.ts`, `e2e/group-gate.spec.ts`, `e2e/group-invite.spec.ts`,
34/34 green as of step 6) — this doc is for a human click-through pass,
same style as `test-plan.md`.

Setup: `npm run dev` in `app/`, logged in as `admin`/`wachtwoord123`
(system_admin). Seeded children: Sam/1234, Robin/4321.

Checking a box here is what promotes an item in `groups-design.md` from
`FIXED` (code changed) to `RESOLVED` (verified) — see that doc's status
key. An item whose underlying behavior changed after being checked gets
unmarked with a note pointing at what replaced it, rather than left
checked against stale behavior.

## 1. Admin — group creation (Groepen tab)
- [x] Beheer → Groepen tab loads without error, shows any existing groups.
- [ ] "+ Groep aanmaken" → fill name + slug → submit → klas-geheim shown once in a readonly field. *(unmarked: reveal mechanism changed, now inline on the group's own row — see §6)*
- [ ] Reload the tab (or revisit it) → the same secret is **not**
      re-displayed anywhere; only the group name/slug/member count remain. *(unmarked: slug moved next to the name, roster-open persistence changed — see §6)*
- [x] Creating a second group with the same slug → rejected with a clear
      "already in use" message, first group untouched.
- [ ] Slug with uppercase/spaces/symbols → rejected client- or
      server-side (only `a-z0-9_-` allowed). *(unmarked: fixed a real bug where the HTML pattern attribute silently failed — see §6)*



## 2. Admin — roster management
- [ ] Click "Bekijk rooster" on a group with no members → "Nog geen
      kinderen in deze groep." shown, no crash. *(unmarked: button renamed to "Rooster beheren", name is now also clickable — see §6)*
- [x] A child added via the invite flow (see §4) appears in this list
      with correct avatar + name.
- [ ] "Verwijderen uit groep" on a member → disappears from the roster;
      re-open the roster to confirm it's gone (not just visually hidden). *(unmarked: now requires confirmation first — see §6)*
- [x] After removal, that child's own parent-dashboard card and login
      still work normally — only the group membership was affected.
- [ ] Member count shown next to the group name matches the actual
      roster after an add/remove. *(unmarked: layout changed — slug now sits next to the name — see §6)*

## 3. Admin — invite creation
- [ ] Inside an open group's roster, "Kind uitnodigen" mini-form: enter a
      child's name → submit → a link is revealed immediately. *(unmarked: the separate reveal box is gone, link now only lives in the highlighted list row — see §6)*
- [ ] The invite appears in the group's invite list below the form,
      status "In afwachting". *(unmarked: tied to the same change above)*
- [x] Open the generated link in a new tab (see §4) and complete it →
      revisit the admin tab → that invite's status flips to "Gebruikt".

## 4. Child-facing gate (`/<slug>`)
- [x] Visiting `/` (no slug) still shows the plain avatar grid exactly as
      before — regression guard, this must never change for the
      ungrouped case.
- [x] Visiting a real group's slug fresh (no cookie yet) shows the gate
      screen (klas-geheim field + ouder-login fields), not a roster.
- [x] Visiting a made-up/nonexistent slug shows a "groep niet gevonden"
      state, not the gate and not a crash.
- [x] Wrong klas-geheim → inline error, stays on the gate.
- [x] Correct klas-geheim, "Onthouden" **unchecked** → roster unlocks for
      this pageload, but a reload gates again.
- [x] Correct klas-geheim, "Onthouden" **checked** → roster unlocks, and
      a reload of the same slug skips the gate entirely.
- [x] Ouder-login with a wrong password, and separately with a correct
      password for a parent who has no child in this group — both show
      the *exact same* error text ("Geen kind in deze groep."). Confirms
      a wrong guess can't distinguish "bad password" from "no child
      here."
- [x] A device already trusted (remembered) for one group still gets
      gated when visiting a *different* group's slug.
- [ ] A child already logged in (existing session) who visits any group
      slug lands straight on their own home screen — no gate shown at
      all, regardless of trust state.

## 5. Invite accept flow (`/group-invite.html?token=...`)
- [x] Open an invite link with no token / a garbage token → "Ongeldige
      uitnodiging" state.
- [ ] **New parent path**: register a new account on Stap 1 → Stap 2
      shows an empty candidate checklist (no children yet) → "+ Nieuw
      kind toevoegen" → pick an avatar, set a PIN → named success screen
      ("X is toegevoegd aan Y") → child appears in the parent's own
      dashboard *and* in the group's admin roster. *(unmarked: the new-child form heading now names the actual child — see §6)*
- [x] **Existing parent, fuzzy match**: log in on Stap 1 with an account
      that has a child whose name matches (or nearly matches) the
      invite's child-name → Stap 2 shows "Is dit [avatar] [naam]?" →
      confirming Ja lands on the named success screen. The browser must
      never navigate to `/parent.html` mid-flow.
- [ ] Same existing-parent case, but click **Nee** on the confirmation →
      falls through to a manual checklist of the parent's other
      children, plus "+ Nieuw kind toevoegen".
- [x] Picking a child from that manual checklist completes the join and
      shows the named success screen.
- [ ] **Name collision**: with two separate invites for same-named kids
      in one group, completing the second (as a different parent) is
      blocked with a collision prompt suggesting a distinguishing name;
      submitting a new name completes the join and both children show up
      distinctly in the admin roster (no silent duplicate tiles).
- [x] Revisiting an already-used invite link shows the same
      invalid-invite state as a bad token.
- [x] Completing any invite (new or existing parent) leaves that device
      auto-trusted for the group — revisiting `/<slug>` afterward shows
      the roster directly, no gate.
- [x] A child added via invite keeps their standing in every *other*
      group/family they already belonged to — joining one group is
      additive, never a replace.

## 6. Polish fixes from the manual-test feedback round (§1-5 above)
New behavior since the first pass — the unchecked/failing items from §4-5
above plus everything logged as `[new]` in `groups-design.md` (now tagged
`[#NNN]` there, referenced below).

- [ ] Creating a group auto-opens its roster panel with the secret shown
      inline, clearly labeled with that group's name ("Klas-geheim voor
      X:") and a "Bewaar deze code goed" warning (#235).
- [ ] "Regenereer geheim" on a group's roster panel asks for confirmation
      naming that the old secret stops working, then reveals the new one
      the same way (#235).
- [ ] The group's slug now shows right next to its name (not next to the
      roster button) and is a clickable link that opens that group's
      actual page in a new tab (#237, #239).
- [ ] "? Wat is een slug?" under the slug field on the create-group form
      toggles a plain-language explanation (#238).
- [ ] Entering an invalid slug shows a specific message about the
      allowed characters, not a generic "vul de velden goed in" (#240).
- [ ] Creating a group invite no longer shows the link twice — only the
      list, with the new invite briefly highlighted (#241).
- [ ] With `PUBLIC_BASE_URL` unset/empty in `.env`, generated invite
      links still come out absolute (`http://host:port/...`), not
      relative (#242).
- [ ] Clicking a group's name (not just the "Rooster beheren" button)
      also expands/collapses its roster (#243).
- [ ] Removing a child from a group's roster now asks for confirmation
      first (#244).
- [ ] The roster-management button is now labeled "Rooster beheren", not
      "Bekijk rooster" (#247).
- [ ] Visiting a slug that isn't a real group returns an actual HTTP 404
      (check via devtools Network tab, not just the rendered page) (#248).
- [ ] Once unlocked (gate or already-trusted), a group's avatar screen
      shows "Welkom bij {groepsnaam}, klik op je naam om door te gaan"
      above the tiles, instead of the generic "Wie ben jij?" (#249).
- [ ] On the invite-accept flow's "+ Nieuw kind toevoegen" form, the
      heading now names the actual child from the invite (e.g. "Nieuw
      kind: Sjeng"), not a generic "Nieuw kind" (#250, #252).
- [ ] The manual-picker heading ("Welk kind is ...?") also names the
      invite's child throughout Stap 2, not just once at the very top
      (#252).
- [ ] Re-verify the three items that failed the first manual pass now
      that the above context/clarity fixes are in — these already pass
      in the automated suite, so a repeat failure here would be a real
      regression worth flagging precisely (browser, exact steps):
  - [ ] a child already logged in who visits a group slug still lands on
        their own home screen, no gate.
  - [ ] declining the fuzzy-match confirmation falls through to the
        manual picker correctly.
  - [ ] two same-named invites in one group trigger the collision prompt
        on the second one.

## Known gaps — not built yet, don't test
- **Step 7 (roster polish)**: collapsible per-group sections when an
  admin manages more than one group, pending invites shown inline in the
  roster list itself (currently a separate list), and a friendlier
  in-roster "add" affordance. The underlying data/endpoints already
  support all of this — it's rendering-only work.
- **Step 8 (parent dashboard visibility)**: a parent's own dashboard does
  not yet show which group(s) each child belongs to. The leave-a-group
  backend endpoint (`DELETE /api/parent/children/:id/groups/:groupId`)
  already exists but has no UI hooked up to it yet.
- **Edit/disable/rename a group** (#236): no UI or endpoints yet for a
  group-admin to enable/disable a group or rename it, or for a sys-admin
  to also edit/remove/rename the slug of an existing group.
- **Invite-list collapse + delete** (#251): on a group with many invites
  the list has no collapsing or per-invite delete/cleanup action yet.
- Promoting a second parent to group-admin of an existing group, and
  per-group challenges — both explicitly deferred in the design doc, not
  part of this plan at all.
