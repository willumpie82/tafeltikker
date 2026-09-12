# Tafeltikker manual test plan

Covers everything built so far: avatar/PIN login, math module (3 difficulties),
typing module, and the parent portal. Skip anything from `new-functionality.md`
still marked `[ ]`/`[~]` — it isn't built yet.

Setup: `npm run dev` in `app/` (runs migrations already applied, seeds via
`npm run db:seed` if you want fresh demo data — Sam/1234, Robin/4321,
parent admin/wachtwoord123).

## 1. Child login
- [ ] Avatar grid shows both seeded children with correct emoji + name.
- [ ] Wrong PIN → error message, PIN clears, avatar grid stays reachable via back arrow.
- [ ] Correct PIN → lands on home screen with "Hallo, {name}!".
- [ ] Reload the page while logged in → stays on home (session cookie persists), doesn't bounce back to avatar grid.
- [ ] Logout → back to avatar grid; reload after logout → still avatar grid (session actually cleared).
- [ ] Log in as Robin, confirm it's Robin's name/avatar shown, not Sam's.

## 2. Math — Makkelijk (multiple choice)
- [ ] Settings: selecting/deselecting tables toggles Start button disabled state (disabled with 0 tables selected).
- [ ] Pick 1 table, count 5, difficulty Makkelijk → 4 number options shown, no numpad, no hint button.
- [ ] Tap correct option → "Goed zo!" feedback, Volgende button appears and visibly fills over ~5s, auto-advances.
- [ ] Tap Volgende early → advances immediately, doesn't wait for the fill.
- [ ] Tap wrong option → shows correct answer, still only one tap allowed (options disable after choosing).
- [ ] After last question → summary screen shows "X van de 5 goed", "Terug naar start" returns home.

## 3. Math — Gemiddeld (numpad, 3 tries + hint)
- [ ] Numpad shown, no MC options, hints checkbox row hidden in settings (only relevant for Moeilijk).
- [ ] Get a question wrong twice → "Bijna! Probeer nog eens (nog 2/1 keer)" each time, answer clears, no Volgende yet.
- [ ] On going into the 3rd try, hint panel auto-appears and stops at "Nu jij: X ± Y = ?" — does **not** show the final number.
- [ ] Answering correctly on try 1 or 2 → no hint ever shown, immediate "Goed zo!".
- [ ] Failing all 3 tries → shows correct answer, Volgende appears.
- [ ] Try physical keyboard: type digits, press Backspace, press Enter to submit — should behave the same as tapping the numpad/✓.

## 4. Math — Moeilijk (single shot)
- [ ] Hints checkbox visible in settings; leave unchecked → no hint button during exercise.
- [ ] Check it → hint button appears, tapping it shows the breakdown (still without the final answer), one shot only (no retries).
- [ ] Wrong answer → correct answer shown immediately, no retry.

## 5. Math — cross-cutting
- [ ] Progress bar fills left-to-right as questions advance, matches "Vraag X van Y" text.
- [ ] Back arrow (top-left) during an exercise → returns to home immediately, doesn't crash, doesn't silently continue the session.
- [ ] After using the back arrow, start a new math session → works normally (old session doesn't interfere).

## 6. Typing module
- [ ] Settings: pick each level (Letters/Woorden/Zinnetjes) and a count, Start works for all three.
- [ ] While typing, characters color green (correct) / red (wrong) / highlighted (current) in real time.
- [ ] Completing a prompt shows accuracy % and WPM, Volgende fills and auto-advances (or tap early).
- [ ] Back arrow during typing exercise → returns home, session ends cleanly.
- [ ] Summary screen shows sensible average accuracy/WPM after finishing all prompts.

## 7. Parent portal
- [ ] Wrong username/password → error shown, stays on login.
- [ ] Correct login (admin/wachtwoord123) → dashboard with both children listed.
- [ ] Add a new child (name, avatar, 4-digit PIN) → appears in the list and in the kid app's avatar grid.
- [ ] Edit a child: change name/avatar only (leave PIN blank) → saves, PIN still works with the old value.
- [ ] Edit a child: set a new PIN → old PIN now fails on the kid login screen, new PIN works.
- [ ] Per child: "Sommen" section shows per-table accuracy bars matching what you actually practiced.
- [ ] Per child: "Typen" section shows per-level accuracy/WPM matching what you actually practiced.
- [ ] Time stats (vandaag/deze week/totaal) increase after finishing a practice session (check right after finishing one, not mid-session).
- [ ] 7-day trend bars appear after a few days of varied practice (or at least don't error out with only today's data).
- [ ] Logout from parent portal → back to login; reload → still logged out.

## 8. Session isolation (security)
- [ ] While logged in as a parent in one browser tab, open the kid app in another tab of the *same* browser — child login should still be required (parent session doesn't leak into child routes).
- [ ] With devtools open, confirm there are two separate cookies (`child_session`, `parent_session`) and each only appears in requests to its own `/api/child/**` or `/api/parent/**` routes.
- [ ] A child cannot reach `/parent.html` data without logging in there separately (clicking the gear icon always requires the parent password, even if a child is currently logged in).

## Known gaps (don't test — not built yet)
Registration flow, invite-by-URL, system-admin role, typing warm-up mode, and
the parent-dashboard "feedback field" — all still open in `new-functionality.md`.
