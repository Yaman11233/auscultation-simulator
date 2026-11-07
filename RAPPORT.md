# Rapport: Auskultationssimulator (index.html)

Datum: 2026-11-07
Leverans: en enda fil, `index.html` (HTML/CSS/JS, inga externa resurser, ingen build). Den öppnas offline med dubbelklick och fungerar på laptop, surfplatta och projektor.

---

## 1. Uppdraget

Bygga en webbläsarbaserad auskultationssimulator: en stiliserad träningsdocka (HLR/ALS-typ) där användaren drar ett stetoskops bröststycke över kroppen och hör hjärt- och lungljud som ändras realistiskt med positionen. Alla ljud syntetiseras med Web Audio API. Lägena är Teaching, Quiz och Presentation.

## 2. Vad som byggdes – översikt

| Område | Innehåll |
|---|---|
| Docka (SVG) | Vuxen i ryggläge med huvud, hals, bål, armar och övre lår. Mjuk hudtoning, inga ansiktsdetaljer, inga AED-elektroder. Vyer: FRAMSIDA och BAKSIDA. Zoom: hela kroppen eller närbild på bröstet. |
| Landmärken | Klavikler, jugulum, sternum, sternalvinkel, revben med ICS-nummer (kan slås av), nipplar, kostalbåge och navel. Stödlinjer (kan slås av): MSL, MCL, AAL och nipplelinje. På baksidan: kotor/C7, skulderblad, bakre revben (T4/T7/T10), vertebrallinje, skapularlinje och T10-linje (lungbaser). |
| Andning | Animerad bröstkorg kopplad till ljudmotorns andningscykel (14/min som standard, varierar per lungfall), med indikator för Inspiration/Expiration. |
| Stetoskop | Realistiskt bröststycke med slang till skärmkanten. Membran (stor platta) eller klocka (mindre kopp). Skugga visar om det är lyft eller ligger mot huden. |
| Ljud | All syntes med Web Audio. Ingen ljudfil används. |
| Lägen | Teaching, Quiz och Presentation (helskärm med hög kontrast). |
| UI | Ljust och mörkt tema, huvudvolym, mute, hjärtfrekvens 40–160, blåsljudsgrad I–VI (Levine) och hörlursvarning. Fungerar med mus, touch (iPad) och tangentbord. |

## 3. Arkitektur (sektioner i `<script>`)

1. **UTILITIES** – clamp, smoothstep, hash m.m.
2. **ANATOMY** – kroppskoordinater i SVG-enheter (≈ 8 enheter/cm, mittlinje x = 300, viewBox 600×990). Hjälpfunktionen `P(view, side, dx, y)` anger punkter efter *patientens* sida och speglar automatiskt mellan fram- och baksida. Fram: patientens höger = betraktarens vänster. Bak: tvärtom. `SITES` innehåller alla namngivna auskultationspunkter.
3. **SPATIAL MAPS** – `MAPS`: varje ljudkomponent har en lista med Gauss-zoner `{view, x, y, s (sigma), w (vikt)}`.
   - Intensitet: `I = 1 − Π(1 − w·g)`. Den är mjuk, högst 1 och slår ihop överlappande zoner utan hårda gränser.
   - Förstärkning: `gain = I²`, för tydligare perceptuell kontrast.
4. **SOUND SYNTHESIS** – `SYN`, en funktion per ljudtyp:
   - `thump`: dämpade sinusar med frekvensfall plus en kort bandpassad brustransient (S1, A2, P2, S3, S4).
   - `click`: kort högfrekvent transient (opening snap, mittsystoliskt klick).
   - `noise`: filtrerat brus med envelopp. Valfritt: AM med sågtand ("harsh"), långsam LFO ("wobble", för rummel) och extra low-pass. Används för blåsljud, rummel och andningsljud.
   - `rub`: "stick-slip"-korn av brus, genererade per händelse (perikardiell och pleural rub).
   - `crackles`: buffert med dämpade cosinus-"pops", fina eller grova, tidiga eller sena i inspiriet. Returnerar tidpunkterna för grafen.
   - `wheeze`: flera sinustoner med lätt glidning (polyfon).
   - `SHAPES`: enveloppformer (diamond, plateau, decresc, cresc, msRumble, vesIn/vesOut, bronch, rub, wheeze). Samma former används för både ljud och fonokardiogram.
5. **COMPONENT LIBRARY + CASES** – fabriker `C.S1()`, `C.A2()`, `C.P2()`, `C.S3()`, `C.S4()`, `C.vesR()`, `C.vesL()`, `C.bronch()` samt `CASES` (ren data). Bakgrundslager `BG`: svaga andningsljud i hjärtfallen och svaga hjärtljud i lungfallen. De kan stängas av.
6. **AUDIO ENGINE** – `class Engine`:
   - Lookahead-schemaläggare (`pump`, var 25:e ms, 0,3 s framåt) med separata cykler för hjärtslag och andetag.
   - Ankare per hjärtslag: `S1`, `sys` (S1 + andel av systole), `A2`, `dia` (A2 + andel av diastole), `P2`, `S1next`. Systolens längd = 0,36·√RR (0,20–0,46 s).
   - Ankare per andetag: `insp`, `exp`, `next`.
   - Fysiologisk S2-splittring: `split = exp + (insp − exp) · lungvolym(A2-tid)`. Den är alltså kopplad till andningscykeln.
   - Förmaksflimmer: RR = medel·(0,6–1,4) slumpmässigt. S1-amplituden beror på föregående RR (kort RR ger starkare S1).
   - Signalkedja: komponentbussar (spatial gain) → mix → parallella membran- och klockfilter med övertoning → tonfilter low-pass 2,2 kHz → kontaktgain (in/ut-toning) → master → säkerhetslimiter → utgång.
     - Membran: high-pass 200 Hz + 170 Hz, 4:e ordningen, makeup 1,8.
     - Klocka: low-pass 200 Hz, makeup 0,65.
   - Vid fallbyte tonas gamla bussar ut och de redan schemalagda cyklerna fylls i för de nya komponenterna, så att inget avbrott uppstår.
   - Motorn fungerar även med `OfflineAudioContext`, vilket användes för testerna.
7. **MANIKIN (SVG)** – genereras i JS. Konturer via Catmull-Rom → Bézier (`sp()`), speglade halvor och revben klippta mot bålens kontur.
8. **APP STATE + UI** – drag/pekhändelser (pointer capture, `touch-action: none`), träffdetektion mot hud via `elementFromPoint` (`.skin`, med `data-region`), statusrad med närmaste punkt eller region, quizlogik, fonokardiogram på canvas, intensitetsmätare, andningsanimation och kortkommandon.
9. `window.AuscSim` exponerar Engine, CASES, MAPS, SITES, C, SYN, mapAt och mapPeak för test och utbyggnad.

## 4. Auskultationspunkter (framsida, SVG-koordinater)

| Punkt | Beskrivning | (x, y) |
|---|---|---|
| Aortic | 2:a ICS, höger sternalrand | (280, 303) |
| Pulmonic | 2:a ICS, vänster sternalrand | (320, 303) |
| Erb's point | 3:e ICS, vänster sternalrand | (320, 325) |
| Tricuspid | 4:e–5:e ICS, vänster nedre sternalrand | (319, 358) |
| Mitral (apex) | 5:e ICS, vänster MCL | (374, 390) |
| R carotid | utstrålning (AS) | (276, 205) |
| L axilla | mittaxillärt, utstrålning (MR) | (422, 380) |

Lungpunkter: trakea, RUL/LUL, RML, lingula och lateral bas fram. Bak: RUL/LUL, RLL/LLL, baser (≈ T10) och interskapulärt.

## 5. Fall

### Hjärta (12)
| # | Fall | Kärna i syntesen | Max (karta) |
|---|---|---|---|
| 1 | Normala hjärtljud (HR 72) | S1 + A2 + P2, minimal split | S1 apex, S2 bas |
| 2 | Fysiologisk split S2 | split 18 ms (exp) → 75 ms (insp) | pulmonalområdet |
| 3 | Aortastenos | hårt crescendo–decrescendo-blåsljud (bandpass 330 Hz, AM 55 Hz), svag A2, S4 | aortaområdet → karotider |
| 4 | Mitralisinsufficiens | blåsande holosystoliskt (560 Hz), svag S1 | apex → vänster axill |
| 5 | Aortainsufficiens | tidigt diastoliskt decrescendo (720 Hz) | Erbs punkt |
| 6 | Mitralisstenos | stark S1, opening snap (A2 + 70 ms), lågfrekvent rummel med presystolisk förstärkning | apex, mycket lokaliserat (klocka) |
| 7 | VSD | hårt holosystoliskt (420 Hz, AM 70 Hz) | vänster nedre sternalrand |
| 8 | S3-galopp | 34 Hz, A2 + 140 ms, HR 92 | apex (klocka) |
| 9 | S4-galopp | 30 Hz, S1 − 100 ms, HR 66 | apex (klocka) |
| 10 | Perikardiell friktionsgnidning | tre komponenter: förmaks- och kammarsystole samt tidig diastole | vänster sternalrand 3:e–4:e ICS |
| 11 | Mitralisprolaps | mittsystoliskt klick + sent systoliskt crescendo | apex |
| 12 | Förmaksflimmer | oregelbundet oregelbunden RR, varierande S1, ingen S4 | apex |

### Lungor (6)
| # | Fall | Innehåll |
|---|---|---|
| 1 | Normala andningsljud | vesikulärt över lungfälten, bronkiellt över trakea, bronkovesikulärt över manubrium och interskapulärt |
| 2 | Fina krepitationer basalt | sena inspiratoriska "Velcro"-pops, bilateralt basalt (bak) |
| 3 | Exspiratoriska wheezes | polyfona toner (392/494/622 Hz), förlängt expirium, diffust |
| 4 | Högersidig pneumothorax | andningsljud saknas över höger hemithorax |
| 5 | Pleurafriktion | knarrande, sent inspirium + tidigt expirium, höger nedre laterala bröstkorg |
| 6 | Konsolidering höger underlob (extra) | bronkiell andning + grova krepitationer över RLL |

Varje fall har en klinisk förklaring på engelska ("explain"), var ljudet hörs bäst ("bestHeard") och ett tips.

## 6. Lägen

- **Teaching:** punkter med etiketter och fallnamn i en banner. Ett live-fonokardiogram (svepande, modellbaserat) visar S1/S2/S3/S4, OS, klick, blåsljud, rubs och krepitationer i realtid, viktat efter aktuell position och membran/klocka. Aktuell komponent markeras och "Now: …" visas. Därtill finns en mätare för lokal intensitet per komponent och en ruta "About this case".
- **Quiz:** slumpat fall ur aktuell modul, med HR ±6 bpm utom vid FF. Inga etiketter, inget fallnamn och ingen graf. Fyra svarsalternativ. Efter svaret visas rätt/fel, förklaring och var ljudet hörs bäst, en pulserande röd ring på maxpunkten (vyn byts automatiskt om punkten ligger på baksidan) samt poäng.
- **Presentation:** helskärm, svart bakgrund med gul accent, större text och etiketter. Fungerar ihop med både Teaching och Quiz.

## 7. Interaktion

- Dra bröststycket, eller tryck var som helst på kroppen för att placera det.
- Ljud hörs bara när bröststycket ligger mot huden. När det släpps tonas ljudet ut, om inte "Keep in place when released" är ikryssat.
- Kortkommandon: piltangenter flyttar (Shift = större steg), D/B membran/klocka, V vy, Z zoom, M mute, P presentation, mellanslag lyft/sänk.
- Ljudet startar först vid första användarinteraktionen, enligt webbläsarkravet.

## 8. Testning och resultat

Testerna kördes i en webbläsare mot en lokal server. Ljudet renderades offline med `OfflineAudioContext` (22,05 kHz) och analyserades med RMS och nollgenomgångar i fönster per hjärtslag (S1, systole, S2, tidig/mitt/sen diastole) eller per andetag.

**A. Kartornas maxpunkter (rutnät 2 enheter, båda vyerna):** alla 17 fall med nyckelkomponent fick maxpunkten på avsedd anatomisk punkt (avstånd 0–1 enhet). Pneumothorax har ingen sådan komponent eftersom ljudet saknas på hela sidan.

**B. Rumsligt test med renderat ljud** (dB i fönstret för respektive komponent på 8 punkter):
- AS: aorta −17, höger karotis −20, apex −35, axill −45
- MR: apex −10, axill −13, aorta −48
- AR: Erb −23 (längs vänster sternalrand −23 till −25), apex −61
- MS-rummel (klocka): apex −25, axill −60, övriga < −85
- VSD: tricuspidal −12, apex −21, karotis −78
- MVP: apex −16; S3/S4 (klocka): apex −16, övriga ≤ −28
- Fysiologisk split: pulmonal −22, apex −47
- Normal: S1 är starkast vid apex och S2 starkast vid basen.

**C. Membran eller klocka:**
| Fall | Membran | Klocka |
|---|---|---|
| S3 | −30 dB | −16 dB |
| S4 | −28 dB | −16 dB |
| MS-rummel | −31 dB | −25 dB |
| AR | −22 dB | −48 dB |
| MR | −10 dB | −29 dB |
| AS | −16 dB | −32 dB |

**D. Lungor:**
- Pneumothorax: höger −41 dB, vänster −12 dB.
- Normal och konsolidering vid höger bas: sent expirium −100 dB mot −13 dB (bronkiellt), nollgenomgångar 400 mot 985/s.
- Krepitationer: 485 transienter vid basen mot 31 i ovanloben.
- Pleurarub: 3660 transienter vid höger lateral bas mot 23 vid lingula.

**E. Skillnad mellan fall (avstånd mellan ljudegenskaper):** de närmaste paren var AS~MVP, AS~VSD och Normal~FF. De skiljs åt av tidsförlopp (klick och sent blåsljud), plats och RR-variabilitet. Normal lunga och konsolidering liknar varandra bara därför att båda mättes över bronkiella områden; mätt på samma plats skiljer de sig tydligt (se D).

**F. Nivåer:** limiter (tröskel −4 dB, ratio 20) i stället för kompressor, så att de rumsliga nivåskillnaderna bevaras. Topparna ligger på cirka 0,7–1,1 vid testvolymen; UI-standardvolymen är lägre.

**G. Visuellt kontrollerat:** framsida och baksida, närbild, stödlinjer, Teaching, Quiz med svar och markör, mörkt tema, Presentation och mobilbredd (375 px). Inga JS-fel efter rättningarna.

## 9. Buggar som rättades under arbetet

1. `Engine`-konstruktorn anropade `setMode()` innan `this.pos` fanns, så motorn startade inte. Ordningen ändrades.
2. `mapPeak` krävde en zon med vikt exakt 1. Wheeze-kartan saknade en sådan, så quizmarkören och testet kraschade. Funktionen väljer nu zonen med störst vikt.
3. En kompressor med automatisk makeup jämnade ut de rumsliga skillnaderna. Den ersattes av en ren limiter.
4. MS-rumlet läckte igenom membranet. Lösningen blev extra low-pass i rummelsyntesen och ett brantare membranfilter (4:e ordningen).
5. MR:s utstrålning till axillen var nästan lika stark som vid apex. Axillzonen sänktes (skillnad nu cirka 3 dB).
6. Gränsvärdena i loudness-testet gav för höga toppar. Gain sänktes för AR, rub och MVP-klick och höjdes för krepitationer och pleurarub.
7. Etiketter överlappade i grafen och på dockan (L axilla mot Mitral, ICS-nummer mot Aortic). Det löstes med textmätning och omplacering, och etiketterna skalas ner i närbild.
8. Konsolideringens maxpunkt låg mellan RLL och bas, och wheeze testades som lokaliserat trots att det är diffust. Kartan och testkriterierna justerades.

## 10. Så lägger man till ett nytt fall

Lägg ett dataobjekt i `CASES`. Om en ny utbredning behövs, lägg också en karta i `MAPS`:

```js
MAPS.TR = [lobe(SITES.tricuspid, 36, 1), lobe(P('front','R',20,360), 30, .4)];
CASES.push({
  id:'tr', module:'heart', name:'Tricuspid regurgitation', tag:'Systolic murmur', hr:80, graded:true,
  components:[C.S1(), C.A2(), C.P2(),
    {id:'TR', label:'HSM', name:'Holosystolic murmur', cat:'murmur', band:'high', synth:'noise', map:'TR',
     cycle:'beat', gain:1, graded:true, params:{fc:500, q:.7, gain:1.4},
     events:[{from:{a:'S1'}, to:{a:'A2'}, shape:'plateau'}]}],
  key:'TR', expect:['tricuspid'],
  bestHeard:'Left lower sternal border', explain:'…', tip:'…'
});
```

- Fält i en komponent: `synth` (thump/click/noise/rub/crackles/wheeze), `map`, `cycle` (beat/breath), `events` med `at`+`dur` eller `from`/`to`, `shape`, `amp`, `cat` (färg i grafen), `band` (low/mid/high, för grafen och mätaren), `graded` (följer Levine-reglaget) och `varS1`.
- Tidsankare: `{a:'A2', s:0.07}` (sekunder) eller `{a:'sys', f:0.5}` (andel av systole). För andning: `insp`, `exp`, `next`.
- Fall-fält: `rhythm:'af'`, `split:{exp,insp}`, `resp`, `ti` (inspiriets andel), `preferred:'bell'`, `mark` (egen quizmarkör).
- Fallet syns då automatiskt i menyn, i quizet, i grafen och i intensitetsmätaren.

## 11. Begränsningar och förslag

- Ljuden är syntetiserade och stiliserade. De är tidsmässigt och spektralt rimliga men inte inspelade patientljud. Låt en kliniker lyssna igenom alla fall i hörlurar.
- Ljudkvaliteten har bara verifierats med mätningar, inte med lyssning.
- Lågfrekventa ljud (S3, S4, rummel) hörs dåligt i laptophögtalare. Det står i en varning i appen.
- På iOS tystas Web Audio om ringsignalknappen står på ljudlöst.
- Möjliga tillägg:
  - manövrar (Valsalva, stående/hukande, vänster sidoläge)
  - inspiratorisk förstärkning av högersidiga blåsljud (Carvallo)
  - fler fall (TR, PS, ASD med fixerad split, HOCM)
  - inställbar andningsfrekvens
  - export av quizresultat

## 12. Filer

- `index.html` – hela applikationen, **genererad** av `build.mjs` (öppna denna; dubbelklick fungerar offline).
- `src/` – källkoden: `template.html` (HTML/CSS), `app.js` (ljudmotor, fall, 2D-vy, UI), `body.js` (SDF-kropp, marching cubes, 2D↔3D-mappning), `three-view.js` (3D-scen).
- `build.mjs`, `package.json` – bygget (se avsnitt 13.2).
- `.claude/launch.json` – enbart för lokal testserver under utvecklingen.
- `RAPPORT.md` – denna rapport.

---

# Version 2 (2026-11-07): interaktiv 3D-docka

## 13.1 Vad som ändrades

Endast dockan byttes. Ljudmotorn, fallen, den rumsliga formeln, quiz, teaching, fonokardiogram, mätare, presentationsläge, teman och panelen är oförändrade i logik. Ändringar utanför 3D-koden:
- `Engine.setPosition3(p, contact)` lades till. `updateGains` använder 3D-kartan när positionen är en 3D-punkt, annars som tidigare den 2D-kartan.
- Revben/ICS/stödlinjer flyttades till en gemensam datafunktion `decalGeometry(view)` som både 2D-SVG:n och 3D-texturerna ritar från (samma koordinater, ingen dubblering).
- Panelens sektion **View**: växel **3D / 2D**, kamerapresets, **Rotate mode**. 2D-vyns Front/Back och zoom ligger kvar under "2D".

Nytt i 3D:
- **Docka:** procedurell, en enda sömlös mesh. Kroppen är en SDF (signed distance field) av ellipsoider och "round cones" sammanfogade med smooth-min (polynomial smin), polygoniserad med marching cubes (cell 0,9 cm, ≈ 21 500 hörn / 43 000 trianglar, ≈ 0,3 s vid start) med normaler från SDF-gradienten. Skulpterade landmärken (små Gauss-formade upphöjningar/fördjupningar längs kurvor på ytan): klavikler, jugulum, sternalfåra, sternalvinkel, kostalbågar, nedre pectoraliskant, areolae/nipplar, navel; på baksidan ryggfåra, C7, skulderbladens kanter och spina samt glutealfåra.
- **Proportioner:** samma mått som 2D-dockan (8 SVG-enheter = 1 cm), t.ex. bröstkorg ±15,5 cm, midja ±13,8 cm, huvud 20 cm högt, armar abducerade ≈ 17° så att axillen är åtkomlig.
- **Dekaler:** revben, ICS-nummer och stödlinjer (MSL, MCL, AAL, nipple line, vertebral, scapular, T10) ritas på canvas-texturer (fram och bak) och projiceras på ytan i shadern via den inversa mappningen (13.3). Kan slås av/på som förut.
- **Ljus:** hemisfärljus + key + fill + två rim-ljus, matt hudmaterial, miljöreflex (RoomEnvironment) på krom. Mjuk kontaktskugga under dockan. Bakgrunden är genomskinlig, så scenens bakgrund är exakt temat (ljus, mörk, presentation).
- **Andning:** hörnförskjutning längs normalen i vertex-shadern, viktad per hörn (bröst mest, buk lite, rygg nästan inget), styrd av motorns andningscykel (max 7 mm).
- **Kamera:** OrbitControls med dämpning, 360° runt och nästan rakt uppifrån/underifrån (polarvinkel 0,01–π−0,01), zoom 22–520 cm, panorering (höger-drag / två fingrar). Kameran kan aldrig hamna i kroppen: efter varje uppdatering kontrolleras SDF-värdet i kamerapositionen och kameran knuffas ut till ≥ 4 cm från ytan.
- **Presets** med mjuk animerad övergång (sfärisk interpolation, 0,7 s): Front, Back, Left/Right (patientens sidor), Top (kranialt), Bottom (kaudalt), Chest close-up, Reset. Avståndet anpassas till fönstrets proportioner. Tangenter: **V** nästa vy, **Z** bröstnärbild, **R** reset.
- **Drag-konflikt:** ett drag som *startar på kroppen* (eller på bröststycket) flyttar bröststycket; ett drag som startar på bakgrunden roterar vyn. **Rotate mode** (knapp) eller **håll Space / Alt** gör att alla drag roterar, även när kroppen fyller skärmen. Tekniskt: en capture-lyssnare på scenen tar över pekaren innan OrbitControls får den.
- **Stetoskop i 3D:** membran (bred platta med svart kant) eller klocka (smal kopp med gummiring), skaft och ventil i krom; orienteras efter ytnormalen och vrids så att skaftet pekar mot slangen. Slangen är en `TubeGeometry` längs en Catmull-Rom-kurva som går ut ur bild uppe till höger. Lyft läge = 2,2 cm ovanför huden med större, svagare skugga.
- **Kontakt:** ljud endast när bröststycket ligger mot huden. Träffen beräknas med ray marching mot samma SDF som meshen byggs från (snabbare än triangeltest, skillnad < 0,5 cm). "Keep in place when released" fungerar som förut. Piltangenter flyttar bröststycket längs ytan (i skärmens riktningar), **L** lyfter/sänker.
- **Etiketter:** auskultationspunkterna är små 3D-markörer på ytan med HTML-etiketter i fast pixelstorlek (läsbara vid all zoom, större i presentationsläge). En etikett döljs när punkten vetter bort från kameran eller skyms av kroppen (ray march från kameran). Etiketten placeras på den sida av punkten som är bort från kroppens mittlinje.
- **Quiz:** efter svaret flyger kameran så att den tittar rakt mot punkten med maximal intensitet, och en pulserande röd 3D-ring visas där (även laterala punkter, t.ex. pleurafriktionen i höger axillarlinje).
- **Statusrad:** "Listening: …" beräknas från 3D-träffpunkten: närmaste auskultationspunkt inom 2,2 cm, annars region (huvud, vänster/höger arm, hals, främre bröstkorg, bakre torax, vänster/höger lateral bröstvägg, buk, ländrygg, flank, lår).
- **Fallback:** saknas WebGL används 2D-vyn automatiskt (3D-knappen inaktiveras med en notis). 2D kan också väljas manuellt, eller tvingas med `index.html?2d`.

## 13.2 Bygget

Three.js r160 (fast version) och dess tillägg (`OrbitControls`, `RoomEnvironment`, tabellerna från `MarchingCubes`) importeras som ES-moduler i `src/`. `build.mjs` paketerar allt med **esbuild** till *ett* klassiskt IIFE-skript (inga `import`, ingen `type="module"`) och klistrar in det i `src/template.html` → `index.html` (≈ 610 kB). Därför fungerar filen från `file://` utan nätverk. Detta valdes framför r160:s UMD-bygge, eftersom OrbitControls m.fl. sedan r148 bara finns som moduler och skulle behöva handredigeras.

```
npm install        # en gång (nätverk behövs bara här)
npm run build      # eller: node build.mjs  → skriver index.html
```

Redigera aldrig `index.html` direkt; ändra i `src/` och bygg om.

## 13.3 Hur 3D-punkter och -zoner definieras

Världskoordinater: centimeter, +Y uppåt (huvud), +Z anteriort, +X = patientens vänster. En 2D-punkt omvandlas med `y = (500 − y₂D)/8` och horisontell förskjutning `u` från mittlinjen (fram: `x₂D − 300`, bak: `300 − x₂D`, i cm).

**Projektion (`to3D`)** – elliptisk-cylindrisk kring bålens axel:
1. Vid startup mäts för varje höjd (steg 0,5 cm) bålens halvbredd *a(y)*, främre och bakre halvdjup *b(y)* och centrumdjup *zc(y)* genom ray marching mot "kärn-SDF:en" (bål utan armar/huvud).
2. `s = clamp(u / a(y), −0,985, 0,985)`, `c = ±√(1 − s²)` (+ fram, − bak). En stråle skjuts från utsidan mot axeln längs riktningen (a·s, 0, b·c). På ett elliptiskt tvärsnitt ger det exakt samma x som i 2D för främre punkter, medan punkter vid 2D-siluettens kant hamnar lateralt (mid-axillärt). Därför fungerar axill och laterala baser från sidan.
3. Träffen förfinas med några Newton-steg mot den fullständiga SDF:en; normalen tas från gradienten.

Alla befintliga `SITES` och alla zoner i `MAPS` projiceras så vid start till `SITES3` / `MAPS3`. Ingen falldata ändrades.

**Intensitet (`mapAt3`)** – samma formel `I = 1 − Π(1 − w·g)`, gain = I². `g` är en Gauss-funktion av 3D-avståndet (cm). Varje zon får sigma omräknad från 2D-enheter (÷ 8) och multiplicerad med mappningens lokala sträckning, anisotropt: längs zonens horisontella yttangent σh = σ·kh, i övrigt σv = σ·kv. (kh ≈ 1 framtill och större lateralt där 2D-bilden är förkortad.) Fram- och bakzoner separeras nu naturligt av kroppens djup; `view`-fältet behövs inte längre.

**Dekaler** använder den exakta inversen (`to2D`) per hörn, så linjer, punkter och ljudkartor ligger garanterat på samma ställe.

Ny zon eller punkt läggs till precis som förut – i 2D-koordinater i `SITES`/`MAPS`. Den projiceras automatiskt till 3D.

## 13.4 Verifiering mot 3D-kartan (motsvarar avsnitt 8 A–D)

**A. Maxpunkter** (sökning över alla ≈ 21 500 hörn i meshen): alla 17 fall med nyckelkomponent har sitt max på rätt punkt. Avstånd till avsedd punkt: 0,05–0,4 cm (trakea 0,5 cm, wheeze 0,8 cm – diffust per definition).

**Kartnivåer 2D → 3D** (gain i dB relativt max): nästan alla relationer ligger inom ±0,5 dB, t.ex.:

| Komponent @ plats | 2D | 3D |
|---|---|---|
| S1 @ tricuspidal / Erb / aorta | −2,2 / −3,6 / −8,0 | −2,0 / −3,4 / −7,7 |
| A2 @ apex | −10,9 | −10,6 |
| P2 @ aorta | −13,4 | −13,8 |
| AS @ höger karotis / apex | −3,8 / −19,9 | −3,5 / −19,9 |
| AR @ LSB 3–4 / apex | −0,7 / −38,7 | −0,7 / −40,6 |
| VSD @ apex | −9,1 | −9,4 |
| Vesikulärt R @ RML | −1,0 | −0,9 |
| **MR @ vänster axill** | **−4,9** | **−6,9** |
| S1 @ vänster axill | −6,3 | −10,0 |

Enda märkbara skillnaden: utstrålning **från apex ut i axillen** blir 2–4 dB svagare i 3D. Avståndet längs bröstkorgens krökning mellan apex och mid-axillärlinjen är längre än i den förkortade 2D-bilden. Den anisotropa sigma-korrektionen minskade skillnaden från 3,9 till 2,0 dB för MR. MR hörs fortfarande tydligt i axillen och starkast vid apex.

**B. Renderat ljud vid 3D-punkterna** (dB i komponentens fönster):
- AS: aorta −16, höger karotis −19, apex −34
- MR: apex −10, axill −16, aorta −53
- AR: Erb −22, apex −62
- MS-rummel (klocka): apex −25, övriga < −88
- VSD: tricuspidal −12; MVP: apex −16; rub: LSB 3–4 −17; S3/S4: apex −16
- Split S2: pulmonal −21, apex −46
- Normal S2: pulmonal −12, apex −18

S1-fönstret (normal) ger −14 dB vid apex, Erb och tricuspidal. Limitern planar ut S1-toppen där; kartan ger apex 0 dB, tricuspidal −2 dB och Erb −3,4 dB.

**C. Membran eller klocka:** identiskt med version 1 – S3 −30/−16, S4 −28/−16, MS −31/−25, AR −22/−48, MR −10/−29, AS −16/−32 dB.

**D. Lungor:**
- Pneumothorax: höger ovanlob −42 dB, vänster −10 dB.
- Normal vs konsolidering vid höger bas: sent expirium −100 mot −11 dB.
- Krepitationer: 485 transienter vid basen mot 55 i ovanloben.
- Pleurarub: 3615 transienter lateralt mot 33 vid lingula.

**Regression:** alla 18 fall genomklickade i båda modulerna med punkter fram, bak och lateralt, alla 8 presets, quiz (svar, ring, nästa), klocka/membran, revben/linjer, båda teman, 2D↔3D-växling och `?2d`-fallback, utan JavaScript-fel. Visuellt kontrollerat: fram-, bak-, sido- och ovanvy, bröstnärbild, mörkt tema, mobilbredd. Drag på kroppen flyttar bröststycket (hamnar exakt på apex), drag i Rotate mode roterar utan att flytta det, piltangenter flyttar längs ytan.

**Inte verifierat:** riktig touch/pinch på en iPad (endast emulerat), uppspelning i Safari, och att dubbelklick från `file://` öppnar filen. Testerna kördes via en lokal server, men filen har inga externa resurser och inga `import`.
