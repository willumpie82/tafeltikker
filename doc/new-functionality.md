Completed items live in `processed.md` now — this file is just what's still open.

general:
- [planned] commit changes and deploy on proxmox LXC
- [n] make sure passwords are not passed as plain text (noticed a curl cmd with plain password) — inherent to no TLS; only fixable at the nginx reverse-proxy layer once the Proxmox deployment exists, discussed with the user and deferred until then (see the deploy item above)
- [n] future: add autdit log visible for admin (not ouder/user-admin)
- [n] when adding functionallity, lets not just wipe the database, migrate the data to the new table where possible, add a test user/child combo
- [n] dashboard shows history of plays, week/month (bar graph[number of tests/day])


- [n] found while building v1: resetting a tafel-confidence challenge doesn't actually give the kid a fresh shot at it — confidence is an all-time rolling average, not scoped to after the challenge starts (unlike tijd-gespeeld, which does restart cleanly), so if the underlying attempts already clear the bar, it just re-completes instantly. Worth a decision: leave as-is (it's honestly reporting current mastery), or scope confidence to attempts since startedAt too, like time-played does? => clear usecase, confidence should not be reset (you cannot unlearn ;-) ), it can be recreate/archived/deleted 

- [n] On the dashboard history graph, show day(s) without training time as and show non trained days as empty
- [n] When creating invite, a role can be pre-assigned

typing:
- [?] we have to rethink typing layout on a landscape tablet, also the layout in landscape when a touch keyboard is shown there is not much to see anymore, let me create a mockup for it as well, there are a few scenario's at play here

calc:
- [n] during play, on the tafel indicators, show failed (orange), show good (green) (as is), show todo (grey)

challange:
- [n] archive a challange (e.g. the kid has earned his reward)
- [n] speed + confidence challange (no on 'moeilijk' the timer is 8s), let the parent set the target speed
- [n] in hard mode, when the time expires, the same test repeats 3x (same as multiple choice, but kid has now practically 24s per test)


Groups: [considering]
- see `doc/groups-design.md` for the worked-out login/access-control design (slug vs. class-secret vs. parent-login, per-group cookie trust) — the items below are the earlier raw notes it grew out of
- [n] Introduce groups
- [n] Add group admin role (e.g. teacher)
- [n] Group/sys admin and can create, edit and manage a group (add kids)
- [n] Group admin can see list of existing parent/children to invite to his group (not seeing progress yet)
- [n] on kids dashboard show invite when available, but only parent can accept, when invite is clicked, popup shown for parent to sign-in show 'accept/decline' button after login, also show invite on parent dashboard kids progress card [accept/decline button]
- [n] on login-screen first show field to 'enter' the group_tag, if correct show kid-selection, 
- [n] on login screen show button 'Geen groep' to circle back to kid selection (only show kind-accounts without group)
- [n] for security: should we use e.g. "teacher" name as 'password'/gatekeeper
- [n] also accecable via tafeltikker.oldemans.nl/group_tag
- [n] cookie stores succesful group selection/login, uitloggen clears it
- [n] test group/kind-naam unique-ness?
