# Noordzee reis

Een zeekaart van de Noordzee tussen Schotland en Nederland met een tijdlijn
van de reis, opgebouwd uit de locatie- en tijdgegevens van foto's en video's.

## Foto's en video's toevoegen

1. Zet bestanden in `data/media/` (submappen mogen, bijvoorbeeld per dag).
2. Commit en push naar `main`.
3. Een GitHub Action (`.github/workflows/build-timeline.yml`) leest automatisch
   de locatie en het tijdstip uit elk bestand en schrijft `data/timeline.json`.
   Dat gebeurt ook lokaal met:

   ```
   pip install -r scripts/requirements.txt
   python scripts/build_timeline.py
   ```

   (vereist `ffmpeg`/`ffprobe` op je systeem voor video's)

### Locatie ontbreekt

- Foto's krijgen hun locatie meestal automatisch uit de EXIF-data (als
  locatievoorzieningen aanstonden bij het maken van de foto).
- Video's bevatten vrijwel nooit bruikbare GPS-data. Het script schat de
  locatie dan door te interpoleren tussen de dichtstbijzijnde foto's/video's
  in de tijd.
- Klopt een locatie niet, zet dan een handmatige correctie in
  `data/location-overrides.json`, met de bestandsnaam als sleutel:

  ```json
  {
    "IMG_1234.MOV": { "lat": 55.95, "lon": -3.19, "timestamp": "2026-07-04T14:30:00" }
  }
  ```

## Grote video's (Git LFS)

Foto's en video's worden getrackt met [Git LFS](https://git-lfs.com/)
(zie `.gitattributes`). Installeer Git LFS lokaal (`git lfs install`) voordat
je media commit.

## Wachtwoordscherm

De site staat achter een licht wachtwoordscherm (`gate.js`). Dit is **geen
echte beveiliging**: een GitHub Pages-site is voor iedereen met de link
technisch bereikbaar. Het scherm houdt alleen toevallige bezoekers en
zoekmachines buiten.

Wachtwoord wijzigen: open `wachtwoord-hash.html` in de browser, typ het
gewenste wachtwoord, en plak de gegenereerde hash als `PASSWORD_HASH` in
`gate.js`.

## Site publiceren

Zet in de repository-instellingen **Settings → Pages** de bron op de `main`
branch, map `/ (root)`.
