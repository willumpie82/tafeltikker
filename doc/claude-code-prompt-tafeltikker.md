# Prompt voor Claude Code — "Tafeltikker"

Kopieer alles hieronder (vanaf "## Project") in Claude Code als startprompt.

---

## Project
Bouw **Tafeltikker**, een selfhosted webapp voor kinderen om te oefenen met **sommen (tafels van 1 t/m 10)** en **typen**. De app draait op mijn eigen server (Debian LXC-container met webserver, Proxmox), dus geen externe cloud-diensten, geen tracking, geen accounts bij derden.

## Gebruikers & inloggen
- **Kindscherm (startscherm):** géén tekst-login. Grid van avatars, één per kind. Kind tikt/klikt zijn eigen avatar aan.
- Na avatar-keuze: invoer van een simpel **"geheim"** (bijv. 4-cijferige PIN of een kleurenpatroon — jij mag kiezen wat kindvriendelijk is, hou het simpel, geen wachtwoord-eisen).
- **Ouder-icoon** ergens in een hoek van het scherm (klein, onopvallend voor kinderen). Klik hierop opent een apart, "volwassen" login (echt wachtwoord) naar het ouderportaal.
- Kind-sessies en ouder-sessies zijn strikt gescheiden — een kind mag nooit bij ouderdata kunnen komen, ook niet per ongeluk via de UI.

## Oefeningen
1. **Sommen:** tafels 1 t/m 10, vermenigvuldigen (later evt. uitbreidbaar naar optellen/aftrekken/delen, maar dat hoeft niet in de eerste versie). Instelbaar welke tafel(s) geoefend worden, aantal sommen per sessie, willekeurige volgorde.
   - **Optioneel vinkje "hints":** als een kind dit aanzet, kan het bij een som een hint opvragen die de som opsplitst in eenvoudigere stappen (zoals je zelf ook rekent), bijv. 7×8 → eerst 7×10, dan 7×2 eraf, of 6×7 → 5×7 + 1×7. Hint is een uitklap/knop per som, niet verplicht getoond — het kind moet 'm zelf aan kunnen zetten/opvragen. Hou de opsplits-strategie simpel en consistent (bijv. altijd via de dichtstbijzijnde ronde tafel, zoals ×10 of ×5).
2. **Typen:** oefenen van het typen zelf (denk: letters/woorden natypen, feedback per toets, WPM/nauwkeurigheid). Simpel niveau-systeem is prima (bijv. losse letters → korte woorden → zinnetjes).
- Directe feedback per antwoord (goed/fout), geen straffend gevoel — positieve, kindvriendelijke toon.

## Voortgang & data
- Per kind bijhouden: geoefende tijd (per sessie en totaal), aantal sommen goed/fout per tafel, typ-voortgang (snelheid/nauwkeurigheid over tijd).
- Data lokaal opslaan (database op de server, geen externe services).

## Ouderportaal
- Bereikbaar via het hoek-icoon + eigen login.
- Overzicht per kind: hoeveel tijd geoefend (dag/week/totaal), voortgang per tafel, typ-voortgang, trend over tijd (simpele grafiek is genoeg).
- Kinderen aanmaken/beheren (naam, avatar, geheim instellen/wijzigen).

## Later (niet per se in MVP, wel rekening mee houden in datamodel)
- Een kind kan gekoppeld worden aan **één of meerdere ouders**.
- Een ouder ziet alleen de kinderen die aan hém/haar gekoppeld zijn (privacy-scheiding tussen gezinnen/ouders die dezelfde instantie zouden delen).
- Houd het datamodel dus van meet af aan zo dat een kind-ouder koppeltabel (many-to-many) er later zonder herontwerp bij kan.

## Technische randvoorwaarden
- Self-hosted op een Debian LXC-container (Proxmox) met webserver ervoor (nginx als reverse proxy is beschikbaar).
- Kies een stack die licht is en makkelijk te draaien/updaten in zo'n LXC (bijv. Node.js of Python backend + SQLite, geen zware dependencies of managed cloud-services nodig).
- Toegankelijk binnen mijn thuisnetwerk (en evt. later via reverse proxy van buitenaf) — houd rekening met eenvoudige deployment (bijv. gewoon `npm run build` / systemd-service, geen Kubernetes-achtige complexiteit).
- Kindvriendelijke, simpele UI: groot, duidelijk, werkt ook prima op een tablet/touchscreen.

## Versiebeheer
- Zet de webapplicatie vanaf het begin in een git-repo (zinnige commits per logische stap, niet alles in één commit).
- Maak ook een apart, klein git-repo (of duidelijke submap) voor de **LXC-template/provisioning**: het script/de configuratie waarmee de container opnieuw opgezet kan worden (basis-image, geïnstalleerde packages, nginx-config, systemd-service, etc.). Doel: ik moet de LXC + app op een nieuwe/andere Proxmox-node kunnen reproduceren puur vanuit git, zonder handmatige stappen te hoeven onthouden.
- Voeg een `.gitignore` toe (geen node_modules, geen database-files, geen secrets/PIN-hashes in git).
- Commit messages en code (variabelen, bestandsnamen, comments) in het Engels, ook al is deze prompt Nederlands.

## Wat ik van je vraag
1. Stel eerst een concrete tech stack + architectuur voor (backend, frontend, database, hoe auth voor kinderen vs ouders eruitziet) passend bij bovenstaande randvoorwaarden, vóórdat je gaat bouwen.
2. Stel een datamodel voor (users/children, parents, parent_child koppeltabel, sessions, exercise_results) dat de latere multi-ouder-koppeling zonder migratie-ellende toelaat.
3. Stel ook voor hoe je de git-repo(s) structureert (app-repo vs infra/LXC-repo, of monorepo met submappen).
4. Werk daarna stapsgewijs: eerst avatar-login + basis sommen-oefening werkend, dan voortgang opslaan, dan ouderportaal, dan typen-module — commit per werkende stap.
5. Vraag het aan mij als iets niet duidelijk is — ga niet te veel aannames doen over styling/features die ik niet genoemd heb.
