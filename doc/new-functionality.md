general:
- [ ] add a back & log-out button (exists on the home screen and inside the settings screens, but not once an exercise is running — a child can't get back to home or log out mid-session yet)
- [ ] design registration flow
- [n] invite new parent using invite url+key
- [n] system-admin can manage 'parents', reset password
- [n] admin can promote 'parent' to user-admin
- [n] userlevels: child, parent, user-admin (manage parents+childs, cannot see progress), system-admin same as user-admin + promote roles + create new users
- [x] the screen is now highly optimized for mobile, make it more adaptive, sometimes with 'sommen' when the hint is displayed, parts drop of the screen. on widescreen show the hint left of the test — root cause was `align-items: center` on `<body>` silently clipping the top of overflowing content with no way to scroll to it; switched to `align-items: safe center`. On screens ≥900px the math exercise now shows the hint panel in a column to the left of the question/pad instead of stacked above it.
- [x] on login screen add remark - 'tafeltikken beta. + version e.g. v0.1 — added "Tafeltikker · beta v0.1" under the avatar grid and under the parent login form
- [n] commit changes and deploy on proxmox LXC

parent dashboard
- [x] progress per mode % correct per challange (letters, woorden, zinnen, sommen per tafel reeks) — Sommen (per-table) and Typen (per-level: letters/woorden/zinnen) both shown now
- [x] developer feedback system — parent dashboard has a feedback textarea + list, backed by a `feedback` table scoped per parent

typing:
- [ ] add warming up mode
- [x] add typing speed (correct hits) (and log per session to parent dashboard) — WPM/accuracy computed per attempt and now shown per level in the parent dashboard
- [x] add onscreen keyboard (QWERTY) when it takes long, start slowly highlighting the required letter — tappable QWERTY keyboard added (works as a real input method, not just a display); after 3s of no keystroke the next required key highlights, resets on every keystroke
- [x] when focus of the input field is lost, cannot type = confusing — the input now refocuses itself automatically if it loses focus mid-exercise, and tapping the prompt text also refocuses it
- [x] when typo on last letter one cannot backspace, so when correct, continue, when incorrect wait for return — fixed: it only auto-continues on an exact match now; a typo (anywhere, including the last character) stays editable (Backspace works) until Enter is pressed

calc:
- [x] add keyboard entry + enter to confirm — digits/Backspace/Enter now work on Gemiddeld/Moeilijk (not applicable to Makkelijk's multiple choice)
- [x] the hints now give the solution that should not happen until all tries done — fixed, and difficulty-specific hint policy documented in `math-difficulty-levels.md`
- [x] add progress bar for the chosen amount of exercises — visual bar added, now driven by correct-answer count (see below)
- [x] on simplest mode multiple choice, hide keyboard — already true (no numpad/keyboard listener active in Makkelijk)
- [x] next-timer 3sec iso 5 — auto-advance changed from 5s to 3s (math + typing)
- [x] wrong answers don't count as progress (recorded as success % for parent dash) — a wrong final answer (any difficulty) gets requeued to the end of the session instead of just moving on; the progress bar/counter tracks correct answers against the original chosen amount, while every individual attempt (right or wrong) is still logged for the parent dashboard's % stat
- [x] the program marks 'alle sommen in 1x goed' while there have been multiple attempts, since the calcs are requed until all correct, so you cannot finish with 100% correct score. so 1st = 1, 2nd try counts for 0,66, 3rd for 0,33 per answer — implemented exactly as specified: summary now shows an average score using those weights, and only claims "in één keer goed" when every question scored a full 1.0
- [x] when difficult level 3 is choosen, add timer of 8sec per exercise, than mark failed, que for retry — added an 8s per-try countdown (visible above the question) on Moeilijk only; running out marks that try wrong and follows the same retry/requeue rules as a normal wrong answer
