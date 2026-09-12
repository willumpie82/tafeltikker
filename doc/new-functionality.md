Completed items live in `processed.md` now — this file is just what's still open.

general:
- [planned] commit changes and deploy on proxmox LXC
- [n] make sure passwords are not passed as plain text (noticed a curl cmd with plain password) — inherent to no TLS; only fixable at the nginx reverse-proxy layer once the Proxmox deployment exists, discussed with the user and deferred until then (see the deploy item above)
- [n] future: add autdit log visible for admin (not ouder/user-admin)
- [n] when adding functionallity, lets not just wipe the database, migrate the data to the new table where possible, add a test user/child combo
- [n] dashboard shows history of plays, week/month (bar graph[number of tests/day])

- [n] kind login screen: can we store the last logged in kids in a cookie? and only show the tile when it is stored, otherwise just (nick)name field, problem is, before kind tries to login, we don't know yet to what 'parent'/group this user belongs, test kind-naam unique-ness? if this app becomes popular, we have a user challange anyway, what if we add /[grouptag] to the URL (user admin can add group as e.g. schoolnaam_klasX "de_fonkel_5a")
- [n] found while building v1: resetting a tafel-confidence challenge doesn't actually give the kid a fresh shot at it — confidence is an all-time rolling average, not scoped to after the challenge starts (unlike tijd-gespeeld, which does restart cleanly), so if the underlying attempts already clear the bar, it just re-completes instantly. Worth a decision: leave as-is (it's honestly reporting current mastery), or scope confidence to attempts since startedAt too, like time-played does?


typing:


calc:

