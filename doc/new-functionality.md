Completed items live in `processed.md` now — this file is just what's still open.

general:
- [planned] commit changes and deploy on proxmox LXC
- [n] make sure passwords are not passed as plain text (noticed a curl cmd with plain password) — inherent to no TLS; only fixable at the nginx reverse-proxy layer once the Proxmox deployment exists, discussed with the user and deferred until then (see the deploy item above)
- [n] future: add autdit log visible for admin (not ouder/user-admin)
- [n] when adding functionallity, lets not just wipe the database, migrate the data to the new table where possible, add a test user/child combo
- [n] parent-dashboard: add tracking of last runs with status [afgerond[score], afgebroken[number of completed/test-size] ]
- [n] dashboard shows history of plays, week/month (bar graph[number of tests/day])
- [n] lets add a challange module. parent can add a challange based on time played, score[per tafel], pick a sticker when challange is complete. child can see challange progress on his ohw 'dashboard' (where the game is selected, persistent between the 3 screens [select game, configure math, configure type]) 
- [n] parent can select if challange is public or private

typing:

calc:
- [n] while setting up game, now it has selection for 5/10/20 test, lets add a time option (slider?), when no input received for 1min auto-pause, ask if kind is still there? "Ben je er nog?"

