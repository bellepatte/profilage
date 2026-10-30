/* Plan : moteur du plan d'entraînement sur plusieurs semaines, construit à partir du profil (allures, zones) et de la répartition du
   volume (allure cible, volume hebdomadaire, parts par zone). Il ne connaît aucune méthode par son nom : chaque méthode est dans
   methodes/<id>.js (Spécifique LPN, méthodes d'entraîneurs), chaque contrainte de planification dans contraintes/<nom>.js (doublés, cycle
   menstruel, travail de nuit, séances du club, longueur maximale, volume cible / maxi / mini, compétitions), les séances communes dans
   plan-seances.js. Ordre de chargement : plan.js, plan-seances.js, contraintes/*.js, methodes/*.js (ou plan.bundle.js, qui les réunit).
   Les séances sont des adaptations des principes publiés, pas les plans officiels des entraîneurs. Chaque séance porte ses minutes par
   zone (parts) et ses étapes (exports, montres). */
(function () {
  'use strict';
  window.PlanCore = window.PlanCore || {}; // interface pour les autres fichiers du plan, remplie à la fin de ce fichier
  const E = window.Endurance;
  const $ = (id) => document.getElementById(id);
  const lerp = (a, b, l) => a + (b - a) * l;
  const borne = (x, a, b) => Math.min(b, Math.max(a, x));

  // Règles de construction par défaut : celles des méthodes d'entraîneurs (constantes `_M`, qu'on ne modifie pas) ; une méthode les remplace
  // en partie par son champ `regles` (voir REGLES_DEFAUT).
  const RETOUR = 10; // min : retour au calme d'une séance de qualité
  const ECHAUFFEMENT = 20; // méthodes : échauffement
  const echauffement = (c, zone) => (c.regles ? c.regles.echauffement(c, zone) : ECHAUFFEMENT);
  const PROGRESSION = 3; // niveaux de difficulté gagnés entre la première et la dernière semaine avant l'affûtage
  const CHARGE_PAS = 0.06, DECHARGE = 0.7; // volume : +6 % par semaine de charge d'un bloc ; 70 % en semaine de décharge
  const SL_PART_M = 0.28, SL_MAX_M = 150, EF_MIN_M = 30; // méthodes : sortie longue (part du volume, plafond en min), footing minimal
  const DOUBLE_PART_M = 0.6, DOUBLE_BORNES_M = [20, 45], DOUBLE_VOLUME_M = 7; // méthodes : 2e séance d'un doublé (part d'un footing, bornes en min) ; volume (h) sous lequel les doublés servent peu
  // methode : identifiant de la méthode choisie (methodes/*.js) ; par défaut, celle qui s'enregistre avec parDefaut (Spécifique LPN, 'zones')
  const METHODE_DEFAUT = 'zones';
  const state = { seances: 4, doubles: 0, moment: 'indifferent', semaines: 4, horizon: 'semaines', debut: '', fin: '', courses: [], cycle: 'auto', charge: 3, decharge: 1, difficulte: 4, methode: null, club1: false, club2: false, limite: null, limiteU: 'min', volType: 'cible',
    regles: { actif: false, debut: '', duree: 28, hormonale: false, irregulier: false, sensRegles: false, sensAvant: false }, // suivi du cycle menstruel (facultatif)
    nuit: { actif: false, mode: 'fixe', soirs: [false, false, false, false, false, false, false], debut: '', nuits: 3, repos: 4 } }; // travail de nuit (facultatif)

  try {
    const s = JSON.parse(localStorage.getItem('plan') || '{}');
    for (const c of Object.keys(state)) if (c in s) state[c] = s[c];
    if (s.mode === 'zones') state.methode = METHODE_DEFAUT; // ancien choix « Personnalisé » (devenu la méthode par défaut)
  } catch (e) { /* stockage indisponible */ }
  if (!state.methode) state.methode = METHODE_DEFAUT;
  if (!['auto', 'constante', 'cycle'].includes(state.cycle)) state.cycle = 'auto';
  if (state.horizon !== 'date') state.horizon = 'semaines';
  if (state.limiteU !== 'km') state.limiteU = 'min';
  if (!(state.limite > 0)) state.limite = null;
  const save = () => { try { localStorage.setItem('plan', JSON.stringify(state)); } catch (e) { /* stockage indisponible */ } };

  /* ---------- Formats ---------- */

  const fD = (m) => { // durée : 45 s, 1 min 30, 12 min, 1 h 05
    if (m >= 59.5) { const r = Math.round(m); return `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, '0')}`; }
    const s = Math.round(m * 12) * 5;
    return s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` : `${s / 60} min`;
  };
  const fA = (x) => `${E.formatAllure(x)} /km`;
  const fourchette = ([a, b]) => { const x = E.formatAllure(Math.min(a, b)), y = E.formatAllure(Math.max(a, b)); return x === y ? `${x} /km` : `${x}–${y} /km`; };
  const arr5 = (x) => Math.max(5, Math.round(x / 5) * 5);
  const arrondi = (x) => (x >= 2 ? Math.round(x * 2) / 2 : x >= 1 ? Math.round(x * 4) / 4 : Math.round(x * 12) / 12);
  const moy = (m) => (Array.isArray(m) ? (m[0] + m[1]) / 2 : m);

  /* ---------- Allures (min/km), prédites par le moteur ---------- */

  const allureDist = (c, d) => E.tablePredictions(c.profil, [d])[0].allureMinKm;
  const pv = (lo, hi) => c => [1000 / (c.profil.V * hi / 100), 1000 / (c.profil.V * lo / 100)]; // allures entre lo et hi % de VMA
  /** Allure (min/km) d'une course de t minutes, prédite par le moteur */
  const allureT = (c, t) => t / (E.tableDistances(c.profil, [t])[0].distance / 1000);
  const MILE = 1.609; // un mile, en km
  // Allures nommées (clé → { nom, min(c) : allure en min/km, ou [rapide, lente] }) : les communes dans plan-seances.js, les propres à une
  // méthode dans son fichier (PlanCore.allures)
  const ALLURES = {};
  function al(c, cle) {
    const a = ALLURES[cle], nom = typeof a.nom === 'function' ? a.nom(c) : a.nom;
    if (!c.profil) return `à ${nom}`;
    const m = a.min(c);
    return `à ${nom} (${Array.isArray(m) ? fourchette(m) : fA(m)})`;
  }
  const zt = (c, id) => (c.profil ? `${id} (${E.allureZone(c.zones[id], true)} /km)` : id);
  /** Allure moyenne d'une zone (min/km), pour estimer les distances : milieu des bornes, Z1 à 60 % de l'allure 1 h */
  const aZ = (c, id) => { const z = c.zones[id]; return z.pMin === null ? 1000 / (c.vRef * 0.6) : z.pMax === null ? 1000 / (c.vRef * (z.bas + z.haut) / 200) : (z.allureRapide + z.allureLente) / 2; };
  /** Distance (km) de fractions : répétitions à l'allure donnée, récupérations en Z1 ; null sans profil */
  const kmS = (c, S, allure) => (c.profil ? S.n * S.r / allure + (S.n - 1) * S.rc / aZ(c, 'Z1') : null);
  /** Plage d'allures (min/km, [rapide, lente]) d'une zone, zones ouvertes bornées (as / haut de E.zones) ; null sans profil */
  const plageZ = (c, id) => { if (!c.profil) return null; const z = c.zones[id]; return [z.allureRapide ?? 1000 / (c.vRef * z.haut / 100), z.allureLente ?? 1000 / (c.vRef * z.bas / 100)]; };
  /** Plage d'allures d'une clé de ALLURES (± 1,5 % autour d'une allure unique) ; null sans profil */
  const plageA = (c, cle) => { if (!c.profil) return null; const m = ALLURES[cle].min(c); return Array.isArray(m) ? [Math.min(...m), Math.max(...m)] : [m * 0.985, m * 1.015]; };
  /** Zone d'une allure (min/km) */
  const zoneDe = (c, allure) => { const p = 100 * (1000 / allure) / c.vRef; return (Object.values(c.zones).find(z => p < (z.pMax ?? Infinity)) || c.zones.Z6).id; };
  /** Somme de répartitions par zone ({ Z1: min, … }) */
  const ajoute = (...ps) => ps.reduce((a, p) => { for (const k in p) a[k] = (a[k] || 0) + p[k]; return a; }, {});

  /* ---------- Séances ---------- */

  // Séances de qualité (id → { nom, zone, gen(l, s, c, arg) → { travail (min, récupérations comprises), effort, km, texte, etapes }, leger,
  // conseil, alerte } ; zone 'obj' : zone de l'allure de l'objectif) : les communes dans plan-seances.js, les propres à une méthode dans
  // son fichier (PlanCore.seances)
  const SEANCES = {};

  /** Séance de qualité ; une séance légère (lignes droites) reçoit la durée de son footing plus tard (avecFooting) */
  // id « SEANCE@arg » : séance paramétrée (Magness : distance de l'allure travaillée) ; nom et zone peuvent dépendre de arg
  function qualite(id, l, s, c) {
    const [base, a] = id.split('@'), arg = Number(a), S = SEANCES[base], r = S.gen(l, s, c, arg);
    const nom = typeof S.nom === 'function' ? S.nom(arg) : S.nom, z = typeof S.zone === 'function' ? S.zone(arg) : S.zone, zone = z === 'obj' ? c.zoneObj : z;
    if (S.leger) return { nom, zone, leger: true, travail: 0, extra: r.travail, lignes: r.texte };
    return { ...enveloppe(c, id, nom, zone, r, S), echelle: s }; // echelle : facteur de volume, pour la ramener sous la limite de longueur
  }
  /** Séance de qualité complète : échauffement, corps de séance r ({ travail, effort, km, texte, etapes, parts }), retour au calme.
      effort : temps à l'allure de la séance, sans les récupérations (plafonds de Daniels) ; parts : minutes par zone, les
      récupérations comptent en Z1, l'effort dans la zone de la séance (sauf si r.parts le détaille) ; etapes : pour les montres */
  function enveloppe(c, id, nom, zone, r, S = {}) {
    const effort = r.effort ?? r.travail, echauf = echauffement(c, zone);
    return { id, nom, zone, qualite: true, echauf, travail: r.travail, effort, duree: arr5(echauf + RETOUR + r.travail),
      km: c.profil ? (echauf + RETOUR) / aZ(c, 'Z2') + r.km : null,
      parts: ajoute({ Z2: echauf, Z1: RETOUR }, r.parts || { Z1: r.travail - effort, [zone]: effort }),
      etapes: [{ t: 'echauffement', duree: echauf, allure: plageZ(c, 'Z2') }, ...(r.etapes || [{ t: 'effort', duree: r.travail, nom }]),
        { t: 'retour', duree: RETOUR, allure: plageZ(c, 'Z1') }],
      texte: `Échauffement ${echauf} min en Z2 · ${r.texte} · retour au calme ${RETOUR} min en Z1.${S.alerte ? ` <strong class="doute">${S.alerte}</strong>` : ''}${S.conseil ? ` <em>${S.conseil}</em>` : ''}` };
  }
  // Footing suivi de lignes droites (séance légère) : le quart du temps des lignes droites compte en Z6
  const avecFooting = (x, d, c) => ({ ...x, duree: arr5(d + x.extra), km: c.profil ? (d + x.extra) / aZ(c, 'Z2') : null,
    parts: { Z2: d + x.extra * 0.75, Z6: x.extra * 0.25 },
    etapes: [{ t: 'footing', duree: d, allure: plageZ(c, 'Z2') }, { t: 'effort', duree: x.extra, nom: 'Lignes droites' }],
    texte: `Footing ${fD(d)} en ${zt(c, 'Z2')}, puis ${x.lignes}.` });
  // SL_SPE : fin de sortie à l'allure de l'objectif (semi, marathon) ; SL_FIN : « fast finish » de 10 à 20 min à allure marathon
  function longue(type, d, l, c) {
    const spe = type === 'SL_SPE' && c.dist > 20000, fin = type === 'SL_FIN';
    // partie à l'allure objectif plafonnée aux 2/3 du temps limite à cette allure (≈ chrono prédit), comme tout effort continu
    const p = spe ? Math.min(arr5(lerp(0.15, 0.35, l) * d), Math.floor(TLIM_PART * c.tObj / 5) * 5) : fin ? arr5(lerp(10, 20, l)) : 0, aFin = c.profil && (fin ? allureDist(c, 42195) : c.allureObj);
    const zFin = !p ? null : c.profil ? zoneDe(c, aFin) : fin ? 'Z3' : c.zoneObj;
    return { nom: 'Sortie longue', zone: 'Z2', duree: d, travail: p, km: c.profil ? (d - p) / (c.courseMarche ? c.courseMarche.allure(c) : aZ(c, 'Z2')) + p / aFin : null,
      parts: p ? { Z2: d - p, [zFin]: p } : { Z2: d },
      etapes: [{ t: 'footing', duree: d - p, allure: c.courseMarche ? plageA(c, c.courseMarche.cle) : plageZ(c, 'Z2') }, ...(p ? [{ t: 'effort', duree: p, allure: aFin && [aFin * 0.985, aFin * 1.015] }] : [])],
      texte: `${fD(d)} ${c.courseMarche ? al(c, c.courseMarche.cle) : `en ${zt(c, 'Z2')}`}${courseMarche(c)}${spe ? `, dont ${fD(p)} en fin de sortie ${al(c, 'obj')}`
        : fin ? `, dont ${fD(p)} en fin de sortie à allure marathon${aFin ? ` (${fA(aFin)})` : ''} (fin rapide)` : ''}.` };
  }
  // Footing en Z2, ou de récupération en Z1 (plan selon la répartition)
  const footing = (d, c, z = 'Z2') => ({ nom: z === 'Z1' ? 'Footing de récupération' : 'Footing', zone: z, duree: d, travail: 0, km: c.profil ? d / aZ(c, z) : null,
    parts: { [z]: d }, etapes: [{ t: 'footing', duree: d, allure: plageZ(c, z) }], texte: `${fD(d)} en ${zt(c, z)}${courseMarche(c)}.` });
  /** Texte course-marche ajouté aux footings et aux sorties longues, si la méthode en fait (champ courseMarche) */
  const courseMarche = (c) => (c.courseMarche ? c.courseMarche.texte(c) : '');
  /** Lendemain de qualité (regles.z1Lendemain) : footing de d min qui commence par z1 min en Z1 (la Z1 restante de la semaine), le reste en Z2 */
  const footingZ1 = (d, z1, c) => (z1 >= d - 2.5 ? footing(d, c, 'Z1') : { nom: 'Footing', zone: 'Z2', duree: d, travail: 0,
    km: c.profil ? z1 / aZ(c, 'Z1') + (d - z1) / aZ(c, 'Z2') : null, parts: { Z1: z1, Z2: d - z1 },
    etapes: [{ t: 'footing', duree: z1, allure: plageZ(c, 'Z1') }, { t: 'footing', duree: d - z1, allure: plageZ(c, 'Z2') }],
    texte: `${fD(z1)} en ${zt(c, 'Z1')} (récupération), puis ${fD(d - z1)} en ${zt(c, 'Z2')}.` });
  // Séance « Course » (objectif ou compétition) et échauffement d'avant-course : contraintes/competitions.js
  const echCourse = (x) => K.competitions.echauffement(x);
  const course = (x) => K.competitions.seance(x);

  /* ---------- Méthodes ---------- */

  // Chaque méthode est dans son fichier (methodes/<id>.js) et s'enregistre par PlanCore.methode(objet). Le moteur ne connaît les méthodes
  // que par leurs champs (contrat ci-dessous, vérifié à l'enregistrement : un champ inconnu ou une séance inexistante est signalé dans la
  // console). Aucune méthode n'est nommée dans le moteur.
  //  - identité et textes : id, nom, titre, ordre (rang dans la liste, par défaut à difficulté égale), source, resume, principes[], avertissement,
  //    noteProfil(c), slNote(avecSL) ; bio et bioTitre (« À propos de ce plan » ; « L'entraîneur » par défaut) ;
  //  - fiche : { public, plan, mise (simple, moyenne, complexe), h et j (prérequis de volume et de jours de course, alerte sans effet sur
  //    le plan), ie (fractions longues, plus dures avec un indice d'endurance très bas), limitee (sources limitées, astérisque) } (hypothèses) ;
  //  - adéquation : score { '5k', '10k', semi, marathon } (0 à 3), difficulte [note de 1 à 5, explication] ;
  //  - phases : [{ nom (texte ou fonction de c), f (fin de la phase en part des semaines avant l'affûtage, nombre ou fonction de c),
  //    q (séances de qualité par priorité : ids, ou fonction de c), sl (type de sortie longue : SL, SL_SPE, SL_FIN), partQualite }] ;
  //  - réglages : maxQ, partQualite, plafonds { id: part du volume }, rotation, test { id, tous }, lignes { n, texte }, footingMax, joursMax,
  //    slKm (nombre ou fonction de c), slSi(c), slUneSur2, moyenneLongue, affutage3, sansAffutage, constant, bloc, recupZ1,
  //    doubleSeuil { soir: { id du matin: id du soir }, part }, courseMarche { cle, allure(c), texte(c) } ;
  //  - Spécifique LPN et assimilées : parDefaut (méthode choisie par défaut, en tête de liste), repartition (plan construit sur la
  //    répartition par zone), semaine(c, vol, l, nbQ, k, maxS) (séances de qualité de la semaine), blocsMax, regles (voir REGLES_DEFAUT).
  const CHAMPS_METHODE = ['id', 'nom', 'titre', 'ordre', 'source', 'resume', 'principes', 'avertissement', 'noteProfil', 'slNote', 'bio', 'bioTitre', 'fiche', 'score',
    'difficulte', 'phases', 'maxQ', 'partQualite', 'plafonds', 'rotation', 'test', 'lignes', 'footingMax', 'joursMax', 'slKm', 'slSi', 'slUneSur2', 'moyenneLongue',
    'affutage3', 'sansAffutage', 'constant', 'bloc', 'recupZ1', 'doubleSeuil', 'courseMarche', 'parDefaut', 'repartition', 'semaine', 'blocsMax', 'regles'];
  const METHODES = []; // méthodes enregistrées (methodes/*.js), dans l'ordre de leur champ `ordre`
  // Contraintes de planification (contraintes/*.js), communes à toutes les méthodes : nom → fonctions appelées par le moteur
  const K = {};
  /** Enregistre une méthode et vérifie son contrat (champs connus, séances citées existantes, phases dans l'ordre) : avertissements en console */
  function enregistrerMethode(d) {
    const pb = Object.keys(d).filter(k => !CHAMPS_METHODE.includes(k)).map(k => `champ inconnu « ${k} »`);
    if (!d.id || !d.nom || !d.fiche || !d.difficulte || !d.score) pb.push('champ obligatoire manquant (id, nom, fiche, difficulte, score)');
    METHODES.push(d);
    METHODES.sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99));
    if (pb.length) console.warn(`Méthode ${d.id} : ${pb.join(' ; ')}.`);
  }
  /** Vérifications qui demandent toutes les séances chargées (au premier affichage) : séances citées par les phases (listes fixes) et ordre des phases */
  function verifierMethodes() {
    METHODES.forEach(d => (d.phases || []).forEach((p, k) => {
      const ids = [...(Array.isArray(p.q) ? p.q : []), ...(d.test ? [d.test.id] : [])].map(s => s.split('@')[0]).filter(s => !SEANCES[s]);
      if (ids.length) console.warn(`Méthode ${d.id}, phase ${k + 1} : séance${ids.length > 1 ? 's' : ''} inexistante${ids.length > 1 ? 's' : ''} (${ids.join(', ')}).`);
      const f = p.f, g = k && d.phases[k - 1].f;
      if (typeof f === 'number' && typeof g === 'number' && f < g) console.warn(`Méthode ${d.id} : phase ${k + 1} plus courte que la précédente.`);
    }));
  }

  // fin d'une phase, `avant` semaines avant la course dans un plan de `total` semaines pour la fin de préparation (réduit proportionnellement si le plan est plus court, base : 40 % au moins)
  const finPhase = (avant, total = 14) => { const W = horizon().W; return 1 - avant * Math.min(1, 0.6 * W / total) / W; };
  // Note de difficulté des méthodes (1 adaptée aux débutants … 5 coureurs avancés) : appréciation, pas une donnée publiée
  // Difficulté athlétique affichée sur 3 niveaux (débutant, intermédiaire, avancé), d'après la note de 1 à 5 de chaque méthode : 1 – 2, 3, 4 – 5
  const NIVEAUX_METHODE = ['Débutant', 'Intermédiaire', 'Avancé'];
  const niveau3 = (n) => (n <= 2 ? 1 : n === 3 ? 2 : 3);
  // trois ronds de même taille, remplis jusqu'au niveau, colorés selon le niveau (vert, ambre, orangé)
  const ronds = (n) => { const k = niveau3(n); return `<span class="ronds n${k}" role="img" aria-label="Difficulté : ${NIVEAUX_METHODE[k - 1]}">${'<i class="on"></i>'.repeat(k)}${'<i></i>'.repeat(3 - k)}</span>`; };
  const AFFUTAGE_PHASE = { nom: 'Affûtage', q: ['SPE', 'SEUIL'], sl: 'SL' }; // affûtage commun (séances de plan-seances.js)

  const biais = (c) => (c.profil ? borne((c.profil.IE + 7) / 3, -1, 1) : 0); // même convention que Balance
  const MISE = { simple: 'Simple', moyenne: 'Moyenne', complexe: 'Complexe' };
  const OBJECTIFS = [['5k', 5000, '5 km'], ['10k', 10000, '10 km'], ['semi', 21097, 'semi'], ['marathon', 42195, 'marathon']];
  const f1 = (x) => x.toFixed(1).replace('.', ',');

  /** Prérequis que vos données ne remplissent pas (volume, fréquence) et indice d'endurance très bas pour les méthodes à fractions longues : texte des alertes */
  function prerequis(d, c) {
    const P = d.fiche, a = [];
    if (c.heures < P.h) a.push(`volume : ${P.h} h par semaine au moins (vous : ${fD(c.heures * 60)})`);
    if (state.seances < P.j) a.push(`fréquence : ${P.j} jours de course au moins (vous : ${state.seances})`);
    if (d.joursMax && state.seances > d.joursMax) a.push(`fréquence : ${d.joursMax} jours de course au plus (vous : ${state.seances})`);
    if (P.ie && c.profil && c.profil.IE <= -10) a.push(`indice d'endurance ${f1(c.profil.IE)} : les fractions longues à VMA ou au seuil seront plus dures à tenir`);
    return a;
  }

  /** Objectifs visés par une méthode : adéquation d'au moins 2,5 sur 3, sinon les meilleurs */
  const objectifs = (d) => { const seuil = Math.min(2.5, Math.max(...Object.values(d.score))); return OBJECTIFS.filter(([k]) => d.score[k] >= seuil); };
  /** Épreuves visées et, avec un profil, durée d'effort correspondante */
  function epreuves(d, c) {
    const L = objectifs(d);
    const noms = L.length > 2 ? `${L[0][2]} à ${L[L.length - 1][2]}` : L.map(x => x[2]).join(' et ');
    if (!c.profil) return noms;
    const [t1, t2] = E.tablePredictions(c.profil, [L[0][1], L[L.length - 1][1]]).map(p => fD(Math.round(p.temps)));
    return `${noms} (≈ ${t1 === t2 ? t1 : `${t1} à ${t2}`})`;
  }

  // Liste déroulante des méthodes : difficulté athlétique croissante (départage par l'ordre de la liste)
  const parDifficulte = (liste) => liste.map((d, i) => ({ d, i })).sort((a, b) => a.d.difficulte[0] - b.d.difficulte[0] || a.i - b.i).map(x => x.d);

  // Rapport volume / fréquence / objectif (hypothèses) : volume minimal (h par semaine) et durée moyenne maximale d'une séance (min)
  // pour chaque objectif ; en dessous de MOY_MIN min par jour de course, les séances sont trop courtes pour être utiles
  // (volume minimal conseillé en km, converti en h à l'allure moyenne de Z2 : 6 min/km sans profil)
  const RAPPORT = { '5k': { km: 10, moy: 75 }, '10k': { km: 20, moy: 90 }, semi: { km: 30, moy: 105 }, marathon: { km: 50, moy: 120 } };
  const volumeMini = (c) => RAPPORT[c.goal].km * (c.profil ? aZ(c, 'Z2') : 6) / 60;
  const volumeMiniTxt = (c) => `${RAPPORT[c.goal].km} km`;
  const MOY_MIN = 20; // même minimum que la longueur maximale d'une séance
  /** Alertes sur le rapport entre volume, nombre de séances et objectif (ex. 3 séances en 2 h pour un marathon) */
  function rapportSemaine(c) {
    const R = RAPPORT[c.goal], n = state.seances + nbDoubles(), jour = c.heures * 60 / state.seances, moy = c.heures * 60 / n, a = [];
    const nom = OBJECTIFS.find(([k]) => k === c.goal)[2], pour = `${c.course ? '' : 'une allure proche d\'' }un ${nom}`;
    if (c.heures < volumeMini(c)) a.push(`Rapport défavorable : ${fD(c.heures * 60)} en ${n} séance${n > 1 ? 's' : ''} par semaine, c'est peu pour ${pour} (au moins ${volumeMiniTxt(c)}). ${state.methode === 'zones' ? 'Les séances resteront courtes' : 'La sortie longue restera courte'} et la préparation limitée.`);
    else if (moy > R.moy) a.push(`Rapport défavorable : ${fD(c.heures * 60)} en ${n} séances par semaine, soit ≈ ${fD(moy)} par séance, c'est long pour ${pour} (≈ ${fD(R.moy)} au plus en moyenne). Ajoutez des jours de course ou des doublés, ou baissez le volume.`);
    else if (jour < MOY_MIN) a.push(`Séances trop courtes : ≈ ${fD(jour)} par jour de course. Regroupez le volume sur moins de jours.`);
    return a;
  }

  /* ---------- Temps limite (règle commune) ---------- */

  const TLIM_PART = 2 / 3; // un effort continu ne dépasse pas cette part du temps limite à l'allure courue
  /** Temps limite (min) à l'allure a (min/km) : T = 6 × exp((v / VMA − 1) / k) */
  const tlim = (c, a) => 6 * Math.exp((1000 / a / c.profil.V - 1) / c.profil.k);

  /* ---------- Dates et compétitions intermédiaires ---------- */

  const JOUR = 864e5, SEMAINES_MAX = 52;
  const parseDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
  const fDate = (t, jour) => new Date(t).toLocaleDateString('fr-FR', { ...(jour ? { weekday: 'short' } : {}), day: 'numeric', month: 'short', timeZone: 'UTC' });

  /** Durée du plan : nombre de semaines saisi, ou semaines entières du début du plan à la date de l'objectif (4 à 52) */
  function horizon() {
    if (state.horizon !== 'date') return { W: state.semaines };
    const d0 = parseDate(state.debut), d1 = parseDate(state.fin);
    if (!(d1 > d0)) return { W: state.semaines, invalide: true };
    const brut = Math.ceil((d1 - d0 + JOUR) / (7 * JOUR));
    return { W: borne(brut, 4, SEMAINES_MAX), brut, d0, d1 };
  }

  // Compétitions intermédiaires (contraintes/competitions.js) : contexte d'une course et constantes utilisées par le moteur
  const contexteCourse = (c, d, effort) => K.competitions.contexte(c, d, effort);
  /** Place les jours d'une semaine sur le calendrier (mode par date). Les jours de course tombent aux dates des compétitions ; les autres
      jours sont répartis au mieux (écarts réguliers, pas la veille d'une course si possible, au moins un jour entre deux courses quand les
      dates le permettent) ; les séances de qualité s'écartent des courses. dates : dates des courses de la semaine, dans l'ordre des jours
      de course. Dernière semaine : elle s'arrête à la date de l'objectif, les jours en trop sont retirés (footings d'abord).
      Renvoie { jours, dates, retires } triés par date. */
  function placerJours(jours, w, dates, souples = [], clubs = [], voisines = [], sensible = () => false, eviteSL = null, nuitJ = null) { // sensible(t) : qualité évitée si possible (cycle, sortie de nuit) ; eviteSL(t) : sortie longue et doublés évités (sortie de nuit) ; nuitJ(t) : départ en nuit le soir (doublé évité si possible) // souples[k] : course k courue en footing, sans contrainte sur la qualité ni la veille
    // clubs : séances fixes du club { t (date), jour } : elles gardent leur jour ; celle de qualité écarte les séances de qualité des jours voisins
    const oMax = Math.round((w.fin - w.debut) / JOUR), R = dates.map(t => Math.round((t - w.debut) / JOUR)), Rd = R.filter((_, k) => !souples[k]);
    if (oMax < 0 || R.some(r => r < 0 || r > oMax)) return { jours, dates: null, retires: 0 }; // dates incohérentes (plan trop court) : jours non datés
    const C = clubs.map(x => ({ o: Math.round((x.t - w.debut) / JOUR), jour: x.jour })).filter(x => x.o >= 0 && x.o <= oMax && !R.includes(x.o)), Co = C.map(x => x.o);
    const Cq = C.filter(x => x.jour[0].qualite).map(x => x.o);
    // voisines : courses des semaines voisines (hors footing), qui écartent aussi la qualité et la veille (ex. course le dimanche, lundi suivant)
    // jours sensibles (cycle, lendemain de nuit) → nombre de motifs : qualité évitée si possible, d'abord sur les jours qui cumulent les deux
    const Sx = new Map(Array.from({ length: oMax + 1 }, (_, o) => [o, +sensible(w.debut + o * JOUR)]).filter(([, n]) => n > 0));
    const Rq = [...Rd, ...voisines.map(t => Math.round((t - w.debut) / JOUR)).filter(o => (o < 0 && o >= -3) || (o > oMax && o <= oMax + 3))];
    const course = (j) => j.some(x => x.nom === 'Course');
    const libres = Array.from({ length: oMax + 1 }, (_, o) => o).filter(o => !R.includes(o) && !Co.includes(o));
    let autres = jours.filter(j => !course(j)), retires = 0;
    if (Rq.length) { // pas de séance de qualité à moins de 3 jours d'une course : on ne garde que celles qui ont un créneau assez éloigné
      // créneaux possibles : à 3 jours au moins des courses, et jamais deux jours de qualité de suite (comptage glouton, optimal sur une ligne)
      const loin = libres.filter(o => Math.min(...Rq.map(r => Math.abs(o - r))) >= 3).reduce((a, o) => (a.length && o - a[a.length - 1] < 2 ? a : [...a, o]), []).length;
      const trop = autres.filter(j => j[0].qualite).slice(loin);
      retires += trop.length;
      autres = autres.filter(j => !trop.includes(j));
    }
    if (autres.length > libres.length) { // semaine raccourcie : on garde les séances de qualité, puis les autres dans l'ordre
      const garde = new Set([...autres.filter(j => j[0].qualite), ...autres.filter(j => !j[0].qualite)].slice(0, libres.length));
      retires += autres.length - garde.size;
      autres = autres.filter(j => garde.has(j));
    }
    // jours d'entraînement choisis : combinaison de libres qui rend les écarts réguliers (cycliques sur une semaine entière)
    // Cycle menstruel : jours choisis de façon à laisser assez de créneaux de qualité hors des jours sensibles (non consécutifs, à 3 jours
    // au moins des courses) ; chaque séance de qualité qui devrait tomber un jour sensible coûte SENSIBLE_COUT : priorité absolue sur la régularité des jours (seulement quand le cycle ou le travail de nuit est suivi)
    const nQ = autres.filter(j => j[0].qualite).length, SENSIBLE_COUT = 100;
    const manqueSens = (S) => (!Sx.size || !nQ ? 0 : Math.max(0, nQ - S.filter(o => !Sx.has(o) && Rq.every(r => Math.abs(o - r) >= 3) && !Cq.some(q => Math.abs(q - o) === 1))
      .sort((a, b) => a - b).reduce((a, o) => (a.length && o - a[a.length - 1] < 2 ? a : [...a, o]), []).length));
    // Travail de nuit : il faut aussi un jour hors sortie de nuit pour la sortie longue (en plus des créneaux de qualité)
    // et un jour hors sortie de nuit pour chaque doublé posé sur un jour de footing (un doublé sur un jour de qualité est déjà compté)
    const estSL = (j) => j.some(x => /^(Sortie longue|Footing long)/.test(x.nom)), avecSLsem = !!eviteSL && autres.some(estSL);
    const estDouble = (j) => j.length > 1 && !j.some(x => x.nom === 'Course' || x.club), nDblF = eviteSL ? autres.filter(j => estDouble(j) && !j[0].qualite && !estSL(j)).length : 0;
    // Manques gradués (nombre de jours qui manquent, pas seulement présence d'un manque) : quand la semaine ne peut pas tout satisfaire (doublés
    // en plus), la sortie longue et les qualités passent avant les doublés (qui seront reportés ou fondus), puis chaque jour de plus compte
    const joursHorsSortie = (S) => (eviteSL ? S.filter(o => !eviteSL(w.debut + o * JOUR)).length : Infinity);
    const manqueSL = (S) => (eviteSL ? Math.max(0, nQ + (avecSLsem ? 1 : 0) - joursHorsSortie(S)) : 0);
    const manqueDbl = (S) => (eviteSL ? Math.max(0, nDblF - Math.max(0, joursHorsSortie(S) - nQ - (avecSLsem ? 1 : 0))) : 0);
    const coût = (S) => {
      const tous = [...S, ...R, ...Co].sort((a, b) => a - b), n = tous.length, pen = SENSIBLE_COUT * (manqueSens(S) + 3 * manqueSL(S) + 0.5 * manqueDbl(S)); // la sortie longue pèse triple (une seule par semaine, la plus longue : à tenir hors sortie de nuit, même au prix de jours moins réguliers), les doublés moitié
      if (n < 2) return pen;
      const cycle = oMax === 6, ecarts = tous.slice(1).map((o, k) => o - tous[k]).concat(cycle ? [7 - tous[n - 1] + tous[0]] : []);
      const ideal = cycle ? 7 / n : oMax / (n - 1);
      return ecarts.reduce((a, e) => a + (e - ideal) ** 2, 0) + 4 * S.filter(o => Rq.includes(o + 1)).length + (R.length ? 0 : 2 * (oMax - tous[n - 1])) + pen;
    };
    let meilleur = null;
    const choisir = (debut, S) => {
      if (S.length === autres.length) { const k = coût(S); if (!meilleur || k < meilleur.k - 1e-9) meilleur = { k, S: S.slice() }; return; }
      for (let i = debut; i < libres.length; i++) choisir(i + 1, [...S, libres[i]]);
    };
    choisir(0, []);
    const creneaux = meilleur ? meilleur.S : [], distCourse = (o) => Math.min(9, ...Rd.map(r => Math.abs(o - r)), ...Rq.slice(Rd.length).map(r => Math.min(3, Math.abs(o - r)))); // courses voisines : au-delà de 3 jours, sans préférence (pas de qualité repoussée en fin de semaine)
    const attribue = new Map(); // décalage → jour
    const qualite = autres.filter(j => j[0].qualite), faciles = autres.filter(j => !j[0].qualite);
    if ((Rq.length || Cq.length || Sx.size) && qualite.length) { // autour d'une course, la qualité va aux créneaux les plus éloignés des courses, jamais deux jours de suite (ni à côté du club de qualité)
      const tries = creneaux.slice().sort((a, b) => (Sx.get(a) || 0) - (Sx.get(b) || 0) || distCourse(b) - distCourse(a) || a - b), pris = [];
      for (const o of tries) if (pris.length < qualite.length && distCourse(o) >= 3 && !pris.some(p => Math.abs(p - o) === 1) && !Cq.some(q => Math.abs(q - o) === 1)) pris.push(o);
      for (const o of tries) if (pris.length < qualite.length && !pris.includes(o) && distCourse(o) >= 3) pris.push(o); // à défaut, deux jours de qualité de suite plutôt qu'à moins de 3 jours d'une course
      for (const o of tries) if (pris.length < qualite.length && !pris.includes(o)) pris.push(o); // en dernier recours, le plus éloigné restant
      pris.sort((a, b) => a - b).forEach((o, k) => attribue.set(o, qualite[k]));
      creneaux.filter(o => !attribue.has(o)).forEach((o, k) => attribue.set(o, faciles[k]));
    } else creneaux.forEach((o, k) => attribue.set(o, autres[k]));
    let courseK = 0;
    R.forEach(o => attribue.set(o, jours.filter(course)[courseK++]));
    C.forEach(x => attribue.set(x.o, x.jour));
    // Sortie longue tombée sur un jour à éviter (sortie de nuit) : échangée avec un footing d'un autre jour, le plus loin des courses
    const oSL = eviteSL && [...attribue.keys()].find(o => estSL(attribue.get(o)));
    if (oSL !== undefined && oSL !== null && oSL !== false && eviteSL(w.debut + oSL * JOUR)) {
      const oF = [...attribue.keys()].filter(o => o !== oSL && !R.includes(o) && !Co.includes(o) && !eviteSL(w.debut + o * JOUR) && attribue.get(o).every(x => !x.qualite))
        .sort((a, b) => distCourse(b) - distCourse(a) || b - a)[0];
      if (oF !== undefined) { const j = attribue.get(oSL); attribue.set(oSL, attribue.get(oF)); attribue.set(oF, j); }
    }
    // Doublés (travail de nuit) : jamais un lendemain de nuit si possible ; échangés avec un footing simple d'un jour de repos (ni sortie ni départ en nuit),
    // à défaut d'un jour de départ en nuit ; s'il n'y a pas de place, construire() fond le doublé en un seul footing
    const rang = (o) => (eviteSL(w.debut + o * JOUR) ? 2 : nuitJ && nuitJ(w.debut + o * JOUR) ? 1 : 0); // 0 repos, 1 départ en nuit, 2 sortie de nuit
    if (eviteSL) for (const o of [...attribue.keys()].filter(o => estDouble(attribue.get(o)) && rang(o) > 0).sort((a, b) => rang(b) - rang(a))) {
      const cand = [...attribue.keys()].filter(p => rang(p) < rang(o) && !R.includes(p) && !Co.includes(p) && attribue.get(p).length === 1 && !attribue.get(p)[0].qualite && !estSL(attribue.get(p)))
        .sort((a, b) => rang(a) - rang(b) || a - b);
      if (cand.length && !attribue.get(o)[0].qualite) { const j = attribue.get(o); attribue.set(o, attribue.get(cand[0])); attribue.set(cand[0], j); }
    }
    const ordre = [...attribue.keys()].sort((a, b) => a - b);
    return { jours: ordre.map(o => attribue.get(o)), dates: ordre.map(o => w.debut + o * JOUR), retires };
  }

  /* ---------- Calendrier et semaines ---------- */

  /** Cycle automatique (hypothèses) : charge constante sous 6 semaines d'entraînement ; sinon 3 semaines de charge pour 1 de décharge (2 + 1 sous
      8 semaines), ajusté aux compétitions intermédiaires : on retient la longueur de charge (2 à 5 semaines) dont les semaines de décharge
      tombent le mieux sur la semaine d'une compétition notable (poids : charge légère 1, modérée 2, forte 3) ou sur la suivante (récupération,
      poids × 0,8) ; à égalité, la plus proche de la valeur par défaut. N : semaines avant l'affûtage. */
  function cycleAuto(c, N, h) {
    if (N < 6) return { type: 'constante', charge: 0, decharge: 0, raison: `plan de ${N} semaine${N > 1 ? 's' : ''} : trop court pour alterner charge et décharge` };
    const poids = {}; // semaine → poids des compétitions (courses en footing exclues : elles ne comptent que pour leur TSS)
    if (state.horizon === 'date' && h.d0) Object.assign(poids, K.competitions.poids(c, h));
    const defaut = N < 8 ? 2 : 3, avecCourses = Object.keys(poids).length > 0;
    let meilleur = null;
    for (let charge = 2; charge <= 5; charge++) {
      const B = charge + 1;
      if (B > N) break;
      const decharge = (i) => i >= 0 && i % B >= charge;
      const s = Object.entries(poids).reduce((a, [i, w]) => a + w * ((decharge(+i) ? 1 : 0) + (decharge(+i + 1) ? 0.8 : 0)), 0) - 0.01 * Math.abs(charge - defaut);
      if (!meilleur || s > meilleur.s + 1e-9) meilleur = { s, charge };
    }
    return { type: 'cycle', charge: meilleur.charge, decharge: 1, raison: avecCourses
      ? `vos semaines de décharge tombent sur ou juste après vos compétitions intermédiaires, sur ${N} semaines`
      : `cycle classique pour ${N} semaines${N < 8 ? ' (plan court)' : ''}` };
  }
  const nomCycle = (cy) => (cy.type === 'cycle' ? `cycle ${cy.charge} + ${cy.decharge}${cy.auto ? ' (automatique)' : ''}` : 'charge constante');

  /** Semaines : type, facteur de volume, niveau (1 à 10) et avancement (0 à 1) avant l'affûtage */
  // affutage3 (Pfitzinger) : 3 semaines d'affûtage pour le marathon si la préparation fait au moins 12 semaines
  function calendrier(c, doc) {
    const h = horizon(), W = h.W, nAff = W < 6 || doc.sansAffutage || (doc.bloc && state.horizon !== 'date') ? 0 : doc.affutage3 && c.dist > 30000 && W >= 12 ? 3 : W >= 10 && c.dist > 20000 ? 2 : 1;
    const N = W - nAff;
    // cycle effectif : choix de l'utilisateur, ou calcul automatique ; une méthode à charge constante l'impose
    const cy = doc.constant ? { type: 'constante', charge: 0, decharge: 0, imposee: true }
      : state.cycle === 'auto' ? { ...cycleAuto(c, N, h), auto: true }
        : state.cycle === 'constante' ? { type: 'constante', charge: 0, decharge: 0 } : { type: 'cycle', charge: state.charge, decharge: state.decharge };
    const B = cy.charge + cy.decharge;
    const d = state.difficulte, sem = [];
    for (let i = 0; i < N; i++) {
      const avance = PROGRESSION * i / Math.max(1, N - 1);
      if (cy.type === 'constante') { sem.push({ type: 'Charge', facteur: 1, niveau: d + avance, frac: i / N }); continue; }
      const p = i % B, base = d + PROGRESSION * (i - p) / Math.max(1, N - 1); // niveau au début du bloc
      sem.push(p < cy.charge
        ? { type: 'Charge', facteur: 1 + CHARGE_PAS * (p - (cy.charge - 1) / 2), niveau: base + 0.5 * p, frac: i / N }
        : { type: 'Décharge', facteur: DECHARGE, niveau: base - 1, frac: i / N });
    }
    ({ 3: [0.8, 0.65, 0.5], 2: [0.75, 0.55], 1: [0.6], 0: [] })[nAff].forEach(f => sem.push({ type: 'Affûtage', facteur: f, niveau: d + PROGRESSION - 2, frac: 1 }));
    K.volume.ajuster(sem, c); // volume saisi : cible, maxi ou mini (tout le cycle est décalé d'autant)
    const cal = sem.map((w, i) => ({ ...w, niveau: borne(w.niveau, 1, 10), ...(h.d0 ? { debut: h.d0 + i * 7 * JOUR, fin: h.d1 >= h.d0 + i * 7 * JOUR && h.d1 < h.d0 + (i * 7 + 6) * JOUR ? h.d1 : h.d0 + (i * 7 + 6) * JOUR } : {}) }));
    return { cal, cycle: cy, alertes: h.d0 ? K.competitions.appliquer(cal, c, h) : [] };
  }

  const volRef = () => K.volume.ref(); // « le volume de référence », « le volume maxi » ou « le volume mini » (textes des alertes)
  const nbDoubles = () => K.doubles.nombre(); // nombre de doublés demandés (contraintes/doubles.js)
  // Accélérations après un footing, une fois par semaine (lignes : { n, texte } de la méthode), +1 min par répétition
  const avecLignes = (f, L) => ({ ...f, nom: `${f.nom} et accélérations`, duree: arr5(f.duree + L.n), km: f.km && f.km * (f.duree + L.n) / f.duree, parts: ajoute(f.parts, { Z2: L.n * 2 / 3, Z6: L.n / 3 }),
    etapes: [...f.etapes, { t: 'effort', duree: L.n, nom: 'Accélérations' }], texte: `${f.texte.replace(/\.$/, '')}, puis ${L.n} ${L.texte}.` });

  /** Règles de construction par défaut (méthodes d'entraîneurs : sortie longue, footings égaux, doublés courts). Une méthode peut en
      remplacer une partie par son champ `regles` (Spécifique LPN : volume facile partagé, footing long, Z1 les lendemains de qualité…). */
  const REGLES_DEFAUT = {
    echauffement: () => ECHAUFFEMENT, // échauffement d'une séance de qualité (min) selon sa zone
    slMax: SL_MAX_M, efMin: EF_MIN_M, efLeger: 5, // plafond de la sortie longue ; footing minimal ; footing minimal avant des lignes droites
    filtreClub: false, // séances du club écartées une semaine si elles ne tiennent pas dans la répartition par zone
    chargeObjectif: null, // semaine de l'objectif : charge ramenée à cette part de la référence (null : facteur du calendrier)
    equilibreZones: false, // temps en zone des compétitions déduit de la répartition (et compensé par les autres semaines)
    dechargeQ: false, // décharge : même nombre de séances de qualité, travail multiplié par cette part (sinon une séance en moins)
    doublesUtiles: null, // nombre de séances par semaine à partir duquel les doublés sont utiles (alerte en dessous ; sinon : alerte de volume)
    sansSortieLongue: false, // pas de sortie longue : le dernier jour est la séance longue facile (« Footing long »)
    volumeKm: false, // volume saisi en km : les séances faciles couvrent le reste de la distance à l'allure Z2
    z1Lendemain: false, // la Z1 restante commence les footings du lendemain de qualité (après le placement en plan par date)
    alterner: false, // sans dates : jamais deux jours de qualité de suite si possible
    volumeFacile: (x) => volumeFacileMethodes(x) // partage du volume facile : { sl, dF, ml, efD, secD, dLong, dD, nD, reste }
  };

  /** Volume facile des méthodes d'entraîneurs (règles inchangées) : sortie longue = 1,5 footing, au moins SL_PART_M du volume, jusqu'à son
      plafond ; un footing ne dépasse pas la sortie longue (1 h la semaine de course). La sortie longue est allongée jusqu'à la plus longue
      séance de qualité ou du club (durée et distance), dans la limite de son plafond ; au-delà, c'est cette séance qui en tient lieu.
      Doublés : footing court (DOUBLE_PART_M d'un footing, borné à DOUBLE_BORNES_M), sur les jours à une seule séance hors jour de la plus
      grosse séance (contraintes/doubles.js) : leur nombre est réduit s'il n'y a pas assez de jours. */
  function volumeFacileMethodes(x) {
    let nD = x.nD, r;
    for (;;) {
      r = volumeFacileCalcul({ ...x, nD, drapeaux: {} });
      // jours qui peuvent recevoir un doublé : jours à une seule séance (qualité sans double seuil, footings), moins celui de la plus grosse séance
      // s'il en fait partie (une séance de qualité ou un footing strictement plus long que toutes les autres, dernier jour et club compris)
      const durees = [...x.q.filter(y => y.qualite).map(y => y.duree), ...Array(x.nE).fill(r.dF)], autres = [x.pSL ? r.sl : r.dF, ...x.club.map(y => y.duree)];
      const max = Math.max(...autres, ...durees), grosseJour = durees.filter(d => d === max).length === 1 && Math.max(...autres) < max;
      const dispo = x.q.length - x.nPm + x.nE - (grosseJour ? 1 : 0);
      if (nD <= Math.max(0, dispo)) break;
      nD = Math.max(0, dispo);
    }
    Object.assign(x.drapeaux, r.drapeaux);
    return r;
  }
  function volumeFacileCalcul(x) {
    const { c, doc, q, club, pool, nE, nF, nD, pSL, typeSL, l, vol, aff, derniere, cs, lim, slMax, slMax0, slPlafond, efMin, drapeaux } = x;
    const dD = nD ? arr5(borne(DOUBLE_PART_M * pool / (nF + pSL + DOUBLE_PART_M * nD), ...DOUBLE_BORNES_M)) : 0, reste = pool - nD * dD;
    const autres = [...q.filter(y => y.qualite), ...club].filter(y => y.duree), kMax = Math.max(0, ...autres.map(y => y.km || 0));
    let besoin = Math.max(0, ...autres.map(y => y.duree));
    while (c.profil && kMax && besoin < 300 && longue(typeSL, besoin, l, c).km < kMax - 0.1) besoin++;
    const slVoulu = Math.max(SL_PART_M * vol, reste / (nF + 1.5) * 1.5);
    const sl = !pSL ? 0 : Math.max(arr5(Math.min(slMax, slVoulu)), Math.floor(Math.min(slPlafond, Math.ceil(besoin / 5) * 5)));
    const limBind = lim && slMax < slMax0 && (pSL ? slVoulu > slMax + 2.5 : true); // la limite de longueur est ce qui plafonne ici
    if (limBind && pSL) drapeaux.parLimite = true;
    const cap = derniere ? Math.min(60, slMax) : Math.min(pSL ? sl : slMax, doc.footingMax || Infinity);
    const ml = doc.moyenneLongue && !aff && pSL && nE >= 2 ? arr5(0.75 * sl) : 0;
    const brut = (reste - sl - ml) / Math.max(1, nF - (ml ? 1 : 0));
    const dF = arr5(Math.max(efMin, Math.min(brut, cap)));
    if (nF > 0 && brut < EF_MIN_M && !aff) drapeaux.court = true; // semaine d'affûtage : volume volontairement bas, pas d'alerte
    if (brut > dF + 5 && !cs) { if (limBind && cap >= slMax - 0.01) drapeaux.parLimite = true; else drapeaux.plafond = true; }
    return { sl, dF, ml, efD: null, secD: null, dLong: 0, dD, nD, reste, drapeaux };
  }

  function construire(doc, ctx) {
    const R = { ...REGLES_DEFAUT, ...(doc.regles || {}) }; // règles de construction de la méthode (par défaut : celles des méthodes d'entraîneurs)
    const c = { ...ctx, regles: R, ...(doc.courseMarche ? { courseMarche: doc.courseMarche } : {}) }; // footings et sorties longues en course-marche
    const { cal, alertes: aCourses, cycle } = calendrier(c, doc), nbQ0 = Math.min(doc.maxQ, state.seances <= 3 ? 1 : state.seances <= 5 ? 2 : 3);
    // Plafond de la sortie longue : slKm (km, nombre ou fonction du contexte) converti à l'allure de la sortie longue, sinon le plafond des règles de la méthode (R.slMax)
    const slKm = typeof doc.slKm === 'function' ? doc.slKm(c) : doc.slKm;
    const slMax0 = slKm && c.profil ? slKm * (c.courseMarche ? c.courseMarche.allure(c) : (c.zones.Z2.allureRapide + c.zones.Z2.allureLente) / 2) : R.slMax;
    // Longueur maximale d'une séance (étape 2) : plafonne aussi la sortie longue et les footings (par pas de 5 min)
    const lim = c.limite, lim5 = lim ? Math.max(5, Math.floor(lim.min / 5) * 5) : Infinity, slMax = Math.min(slMax0, lim5), efMin = Math.min(R.efMin, lim5);
    const limiter = (x, l) => { // séance de qualité ramenée sous la limite (coupe : effort retiré) ; sans effet sur une séance sans échelle (club, test)
      if (!lim || !x.qualite || !x.echelle || !K.limite.depasse(c, x)) return x;
      const y = K.limite.reduire(c, x, k => qualite(x.id, l, x.echelle * k, c));
      coupe += x.effort - y.effort;
      if (K.limite.depasse(c, y)) trop = Math.max(trop, y.duree);
      return y;
    };
    const avecSL = !doc.slSi || doc.slSi(c);
    // Séances du club : durée totale, temps par zone, nombre de jours occupés et de séances de qualité prises sur le plan
    const clubs = K.club.actifs(), nClub = clubs.length, clubQ = clubs.filter(k => k.travail).length;
    const jourLibres = state.seances - nClub; // jours de course laissés au plan (sortie longue comprise)
    const aClubSem = { sansQualite: 0, ecartees: {} };
    // séances du club compatibles avec le plan cette semaine (filtre selon la répartition par zone si la méthode le demande : regles.filtreClub)
    const clubsSemaine = (i) => K.club.semaine(clubs, volumes[i].vol, partsSem[i], R.filtreClub);
    // TSS hebdomadaire de référence (volume de référence réparti selon les parts par zone, TSS d'une zone = durée (h) × IF² × 100)
    const tssRef = c.heures * c.parts.reduce((a, p, k) => a + p * window.Balance.zones()[k].iff ** 2 * 100, 0);
    // Volume de la semaine : TSS fixé par le cycle (facteur de la semaine × TSS de référence) moins le TSS des compétitions et la récupération
    // à prévoir (dette, en partie absorbée par une décharge ou un affûtage), converti en temps au TSS horaire de référence ; plancher
    // de PLANCHER_TSS de la cible ; le temps des compétitions s'y ajoute (il est retiré plus bas du volume facile)
    const volumes = cal.map((w, i) => {
      // semaine de l'objectif (voir `derniere`) : charge ramenée à 50 % de la référence, la fréquence est gardée
      const finale = i === cal.length - 1 && c.course && (w.type === 'Affûtage' || state.horizon === 'date');
      const inter = (w.courses || []).map(x => ({ ...contexteCourse(c, x.d, x.effort), t: x.t, effort: x.effort })), cible = R.chargeObjectif !== null && finale ? Math.min(w.facteur, R.chargeObjectif) : w.facteur, dette = Math.max(0, (w.dette || 0) - tssRef * Math.max(0, 1 - cible));
      const tCourses = inter.reduce((a, x) => a + x.tObj + echCourse(x), 0);
      let fEff = tssRef > 0 && (w.tssCourses || dette) ? Math.max(K.competitions.PLANCHER_TSS * cible, cible - ((w.tssCourses || 0) + dette) / tssRef) : cible;
      fEff = K.volume.plafond(fEff, tCourses, c); // volume maxi : les compétitions comprises, la semaine ne dépasse pas le volume saisi
      return { inter, fEff, vol: c.heures * 60 * fEff + tCourses };
    });
    // Équilibre du plan (regles.equilibreZones) : le temps en zone d'une compétition intermédiaire se déduit du temps prévu par la répartition pour
    // cette zone cette semaine-là. S'il le dépasse, alerte ; les autres semaines cèdent l'excédent si elles le peuvent (au plus ABSORBE_ZONE de
    // leur temps dans la zone), sinon on retire ce qui peut l'être et l'équilibre du plan ne peut pas être respecté. Le temps libéré revient
    // à l'endurance (Z2).
    const partsSem = cal.map(() => c.parts.slice()), aZones = [];
    if (R.equilibreZones) {
      const semCourse = cal.map((w, i) => (w.courses ? i : -1)).filter(i => i >= 0);
      for (let k = 2; k < 6; k++) {
        const id = `Z${k + 1}`, prevu = (i) => volumes[i].vol * c.parts[k], depassements = [];
        semCourse.forEach(i => {
          const courses = volumes[i].inter.filter(x => x.zoneObj === id), r = courses.reduce((a, x) => a + x.tObj, 0);
          if (!r) return;
          partsSem[i][k] = Math.max(0, prevu(i) - r) / volumes[i].vol;
          if (r > prevu(i)) depassements.push({ i, r, t: prevu(i), noms: courses.map(x => x.label).join(' + ') });
        });
        if (!depassements.length) continue;
        const autres = cal.map((_, i) => i).filter(i => !semCourse.includes(i)), total = autres.reduce((a, i) => a + prevu(i), 0);
        const exces = depassements.reduce((a, x) => a + x.r - x.t, 0), cede = Math.min(exces, K.competitions.ABSORBE_ZONE * total), f = total ? 1 - cede / total : 1;
        autres.forEach(i => { partsSem[i][k] *= f; });
        depassements.forEach(({ i, r, t, noms }) => aZones.push(exces <= K.competitions.ABSORBE_ZONE * total
          ? `Le ${noms} (${fD(r)} en ${id}) dépasse les ${fD(t)} de ${id} prévues la semaine ${i + 1} : le temps en ${id} des autres semaines est réduit de ${Math.round((1 - f) * 100)} % pour garder l'équilibre du plan.`
          : `Incohérence : le ${noms} (${fD(r)} en ${id}) dépasse les ${fD(t)} de ${id} prévues la semaine ${i + 1}, et les autres semaines ne peuvent pas compenser : l'équilibre du plan ne peut pas être respecté (le temps en ${id} sera supérieur à celui visé). Le temps de la course est déduit de la semaine et le temps en ${id} des autres semaines est réduit de ${Math.round((1 - f) * 100)} %.`));
      }
      partsSem.forEach(p => { p[1] += 1 - p.reduce((a, x) => a + x, 0); });
    }
    // Dates de toutes les compétitions (hors footing) et de l'objectif : chaque semaine écarte sa qualité des courses des semaines voisines
    const cyc = K.cycle.suivi(); // suivi du cycle menstruel (plan par date), ou null
    const nuitS = K.nuit.suivi(); // travail de nuit (plan par date, toutes méthodes), ou null
    // jours où la qualité est évitée si possible : jours sensibles du cycle, sorties de nuit ; la sortie longue évite aussi les sorties de nuit
    // jour à éviter pour la qualité : 1 par motif (jour sensible du cycle, lendemain de nuit), 2 si les deux
    const evite = cyc || nuitS ? (t) => !!(cyc && K.cycle.phaseDu(t, cyc).sensible) + !!(nuitS && K.nuit.jour(t, nuitS).sortie) : undefined;
    let qSortie = 0, doublesFondus = 0, qEvitees = 0, retirees = 0; // séances de qualité restées sur une sortie de nuit ; doublés fondus en un footing ; qualité sur un jour évité (cycle, nuit) ; séances retirées autour des courses
    const datesCourses = [...cal.flatMap(w => (w.courses || []).filter(x => x.effort !== 'footing').map(x => x.t)), ...(c.course && cal.length && cal[cal.length - 1].fin ? [cal[cal.length - 1].fin] : [])];
    let court = false, plafond = false, exces = 0; // volume insuffisant pour le nombre de séances ; footings plafonnés ; intensité non placée (min)
    let coupe = 0, parLimite = false, trop = 0; // effort de qualité retiré par la limite de longueur (min) ; sortie longue ou footings plafonnés par cette limite
    const semaines = cal.map((w, i) => {
      // derniere : semaine de l'objectif (seulement pour une allure de référence : 5 km, 10 km, semi, marathon) : dernière semaine d'affûtage,
      // ou, si le plan va jusqu'à la date de l'objectif, dernière semaine même sans affûtage (plan court)
      const aff = w.type === 'Affûtage', l = (w.niveau - 1) / 9, derniere = i === cal.length - 1 && c.course && (aff || state.horizon === 'date');
      // courses de la semaine : compétitions intermédiaires (par date) puis objectif (dernière semaine) ; la dernière remplace la sortie longue,
      // les autres un footing chacune
      // séances du club de cette semaine (celles qui sont compatibles avec le plan) : remplacent les variables globales pour la semaine
      const { clubs, ecartees } = clubsSemaine(i), nClub = clubs.length, clubT = clubs.reduce((a, k) => a + k.duree, 0), clubQ = clubs.filter(k => k.travail).length;
      const jourLibres = state.seances - nClub;
      K.club.noter(w, ecartees, aClubSem); // séances du club écartées cette semaine : note sous la semaine
      const { inter, fEff, vol } = volumes[i], volP = vol - clubT, cp = { ...c, parts: K.club.horsClub(partsSem[i], vol, clubs) }; // cp : parts par zone du reste de la semaine (équilibre avec les compétitions, hors club)
      // Plusieurs courses le même jour partagent ce jour : jourCourse regroupe les courses par date (la dernière date est celle de cs)
      const cl = [...inter, ...(derniere ? [{ ...c, t: w.fin }] : [])], cs = cl[cl.length - 1] || null;
      const jourCourse = [...cl.reduce((m, x) => m.set(x.t ?? x, [...(m.get(x.t ?? x) || []), x]), new Map()).values()];
      const extra = jourCourse.slice(0, -1); // jours de course avant celui de cs (chacun une liste de courses)
      const decharge = R.dechargeQ && w.type === 'Décharge'; // (sinon : une séance de qualité en moins)
      const s = borne(Math.sqrt(c.heures * fEff / 5), 0.7, 1.4) * (aff ? 0.7 : 1) * (decharge ? R.dechargeQ / Math.sqrt(DECHARGE) : 1); // le volume de la décharge est déjà à 70 %
      const phase = aff ? AFFUTAGE_PHASE : doc.phases.find(p => w.frac < (typeof p.f === 'function' ? p.f(c) : p.f)) || doc.phases[doc.phases.length - 1];
      const nomP = typeof phase.nom === 'function' ? phase.nom(c) : phase.nom;
      // décharge (regles.dechargeQ) : même nombre de séances de qualité, allégées (plutôt que d'en retirer une)
      const nbQs = w.type === 'Charge' || decharge ? nbQ0 : Math.max(1, nbQ0 - 1), nbQ1 = Math.min(w.qMax ?? Infinity, nbQs); // qMax : limité autour d'une compétition
      // séances par zone : moins de séances de qualité autour d'une compétition = moins de temps d'intensité (au prorata), pas des séances plus grosses
      const kComp = nbQs > 0 ? nbQ1 / nbQs : 1;
      const nbQ = Math.max(0, nbQ1 - clubQ); // la séance de qualité du club prend la place d'une séance du plan
      if (clubQ && nbQ1 > 0 && nbQ === 0) aClubSem.sansQualite++;
      const club = clubs.map(k => K.club.seance(k, c));
      // semaine (plan selon la répartition) : séances de qualité, lignes droites et type de sortie longue tirés des minutes par zone
      const sem = doc.semaine ? (nbQ ? doc.semaine(cp, volP, l, nbQ, (decharge ? R.dechargeQ / DECHARGE : 1) * kComp, Math.max(nbQ, Math.min(doc.maxQ, w.qMax ?? Infinity, jourLibres - 2) - clubQ)) : { q: [], lignes: null, sl: 'SL', exces: 0 }) : null;
      if (sem) { coupe += sem.coupe || 0; trop = Math.max(trop, sem.trop || 0); }
      if (sem && !(w.qMax < Infinity)) exces = Math.max(exces, sem.exces); // autour d'une compétition, la qualité est volontairement limitée
      const ids = sem ? [] : typeof phase.q === 'function' ? phase.q(c) : phase.q, L = sem ? sem.lignes : doc.lignes;
      let q = sem ? sem.q : Array.from({ length: nbQ }, (_, j) => qualite(ids[(j + (doc.rotation ? i : 0)) % ids.length], l, s, c)); // rotation : une autre séance en tête chaque semaine
      // plafonds (Daniels) : temps d'effort d'une séance limité à une part du volume de la semaine (T 10 %, I 8 %, R 5 %)
      q = q.map(x => { const p = doc.plafonds && doc.plafonds[x.id]; return p && x.effort > p * vol ? qualite(x.id, l, s * p * vol / x.effort, c) : x; });
      // partQualite (Fitzgerald, 80/20) : travail de qualité de la semaine, récupérations comprises, plafonné à cette part du volume
      const pQ = phase.partQualite ?? doc.partQualite, totQ = q.reduce((a, x) => a + x.travail, 0), kQ = pQ && totQ ? Math.min(1, Math.max(0, pQ * vol - clubs.reduce((a, k) => a + k.travail, 0)) / totQ) : 1;
      if (kQ < 1) q = q.map(x => (x.qualite ? qualite(x.id, l, s * kQ, c) : x));
      // Test périodique (Galloway : mile magique toutes les 2 semaines) à la place de la dernière séance de qualité
      if (doc.test && !aff && q.length && i % doc.test.tous === 1) q[q.length - 1] = qualite(doc.test.id, l, s, c);
      if (lim && !sem) q = q.map(x => limiter(x, l)); // (une méthode à semaine propre, doc.semaine, limite elle-même ses séances)
      // Volume facile (footings, footings des séances légères, sortie longue) : partagé à égalité, la sortie longue est la plus longue.
      // Sans sortie longue (slSi), le dernier jour est un footing de plus.
      const sansSL = !cs && (R.sansSortieLongue || !avecSL || (doc.slUneSur2 && i % 2 === 1)); // slUneSur2 : sortie longue une semaine sur deux
      const nE = Math.max(0, jourLibres - q.length - 1 - extra.length), nF = nE + q.filter(x => x.leger).length + (sansSL ? 1 : 0);
      // Méthode norvégienne : chaque doublé va d'abord à un jour de seuil, avec le soir le format complémentaire (double seuil)
      const nD0 = cs ? 0 : nbDoubles();
      const iSeuil = doc.doubleSeuil ? q.map((x, j) => (doc.doubleSeuil.soir[x.id] ? j : -1)).filter(j => j >= 0) : [], iPm = iSeuil.slice(0, nD0);
      // Travail au seuil de la semaine (matins et soirs) plafonné à la part doubleSeuil.part du volume
      const totSeuil = [...iSeuil.map(j => q[j].travail), ...iPm.map(j => qualite(doc.doubleSeuil.soir[q[j].id], l, s, c).travail)].reduce((a, x) => a + x, 0);
      const kS = totSeuil ? Math.min(1, doc.doubleSeuil.part * vol / totSeuil) : 1;
      if (kS < 1) iSeuil.forEach(j => { q[j] = limiter(qualite(q[j].id, l, s * kS, c), l); });
      const pm = iPm.map(j => ({ matin: q[j], soir: limiter(qualite(doc.doubleSeuil.soir[q[j].id], l, s * kS, c), l) }));
      let pool = volP - [...q, ...pm.map(p => p.soir)].reduce((a, x) => a + (x.qualite ? x.duree : x.extra), 0) - cl.reduce((a, x) => a + x.tObj + echCourse(x), 0);
      if (R.volumeKm && c.volKm && c.profil) {
        // Volume saisi en km (regles.volumeKm) : la somme des km des séances vaut le volume (× facteur de la semaine) ; les séances faciles couvrent le reste de
        // distance à l'allure Z2 (au lieu de la conversion km → temps à l'allure moyenne de toutes les zones)
        const kmSeance = (x) => (x.km ?? x.duree / aZ(c, 'Z2')), kmFixe = [...q.filter(x => x.qualite), ...pm.map(p => p.soir), ...club].reduce((a, x) => a + kmSeance(x), 0) + cl.reduce((a, x) => a + x.dist / 1000 + echCourse(x) / aZ(c, 'Z2'), 0);
        pool = Math.max(0, c.volKm * fEff + inter.reduce((a, x) => a + x.dist / 1000 + echCourse(x) / aZ(c, 'Z2'), 0) - kmFixe) * aZ(c, 'Z2');
      }
      // Volume facile (footings, sortie longue ou séance longue facile, 2es séances des doublés) : règle de la méthode (R.volumeFacile)
      const pSL = sansSL || cs ? 0 : 1.5;
      const typeSL = sem ? sem.sl : typeof phase.sl === 'function' ? phase.sl(c) : phase.sl;
      const slPlafond = Math.min(slMax0, lim ? lim.min : Infinity);
      const drapeaux = {}; // court, plafond, parLimite : levés par la règle du volume facile
      const { sl, dF, ml, efD, secD, dLong, dD, nD } = R.volumeFacile({ c, doc, q, club, pool, nE, nF, nD: nD0 - pm.length, nPm: pm.length, pSL, typeSL, l, vol, aff, derniere, cs, lim, slMax, slMax0, slPlafond, efMin, drapeaux });
      if (drapeaux.court) court = true;
      if (drapeaux.plafond) plafond = true;
      if (drapeaux.parLimite) parLimite = true;
      const sousLimite = (d, ajout) => Math.max(R.efLeger, Math.min(d, lim ? lim5 - arr5(ajout) : Infinity, sl ? sl - 5 - arr5(ajout) : Infinity)); // footing + lignes droites ou accélérations ≤ limite (et < sortie longue)
      q = q.map(x => (x.leger ? avecFooting(x, sousLimite(dF, x.extra), c) : x));
      // Accélérations (lignes) après le premier footing de la semaine, sauf si la semaine a déjà des lignes droites (séance légère) ;
      // durées de footing fixées par la méthode (efD) : le temps des accélérations est pris sur la durée du footing
      const lignes = L && !cs && !q.some(x => x.leger);
      const ef = Array.from({ length: nE }, (_, k) => (ml && k === nE - 1 ? { ...footing(ml, c), nom: 'Sortie moyenne-longue' }
        : lignes && k === 0 ? avecLignes(footing(efD ? Math.max(R.efLeger, efD[nE - 1] - arr5(L.n)) : sousLimite(dF, L.n), c), L) : footing(efD ? efD[nE - 1 - k] : dF, c)));
      // Ordre conseillé : un jour de qualité, puis un jour de footing, etc. ; la sortie longue (ou la course) en dernier
      const jours = [];
      q.forEach(x => { jours.push([x]); if (ef.length) jours.push([ef.pop()]); });
      ef.forEach(x => jours.push([x]));
      pm.forEach(p => jours.find(j => j[0] === p.matin).push({ ...p.soir, nom: `${p.soir.nom} (double seuil)` }));
      const dernier = cs ? jourCourse[jourCourse.length - 1].map(course) : [R.sansSortieLongue ? footing(dLong, c) : sansSL ? footing(dF, c) : longue(typeSL, sl, l, c)];
      // Sans sortie longue : la séance longue facile, plus longue que les autres footings, est nommée (le dernier jour, ou un footing la semaine de course)
      if (R.sansSortieLongue && dLong > dF) { const j = cs ? jours.find(j => j[0].nom === 'Footing' && j[0].duree === dLong) : dernier; if (j) j[0] = { ...j[0], nom: 'Footing long' }; }
      // après les ajustements du travail de nuit (2e footing d'un doublé ajouté à un autre footing), le nom suit le footing réellement le plus long
      const nommerLong = (js) => {
        const f = js.flatMap(j => j.filter(x => /^Footing( long)?$/.test(x.nom))), max = Math.max(0, ...f.map(x => x.duree)), tete = f.filter(x => x.duree === max);
        const actuel = f.find(x => x.nom === 'Footing long');
        if (!actuel || actuel.duree === max) return;
        js.forEach(j => j.forEach((x, m) => { if (x === actuel) j[m] = { ...x, nom: 'Footing' }; else if (tete.length === 1 && x === tete[0]) j[m] = { ...x, nom: 'Footing long' }; }));
      };
      // « Footing long » seulement s'il dépasse la plus longue des autres séances de la semaine (km avec un profil, sinon durée) : sinon « Footing »
      const nomVrai = (js) => {
        const t = js.flat(), fl = t.find(x => x.nom === 'Footing long');
        if (!fl || !t.some(x => x !== fl && x.duree && (x.km != null && fl.km != null ? x.km >= fl.km - 0.15 : x.duree >= fl.duree - 0.01))) return; // 0,15 km : écart non visible à l'affichage (0,1 km)
        js.forEach(j => j.forEach((x, m) => { if (x === fl) j[m] = { ...x, nom: 'Footing' }; }));
      };
      // Doublés : 2es séances posées sur des jours à une seule séance (contraintes/doubles.js) ; la méthode fixe leur durée (secD, ou dD)
      K.doubles.placer({ jours, dernier, club, nD, secD, dD, dF, c });
      extra.forEach(g => jours.push(g.map(course)));
      jours.push(dernier);
      // Plafond atteint et une autre séance reste plus longue : celle-ci tient lieu de sortie longue, la dernière devient une sortie facile
      const sortieL = dernier[0];
      const plusLongue = R.sansSortieLongue ? null : [...jours.flat(), ...club].filter(x => x !== sortieL && x.duree && (x.km != null && sortieL.km != null ? x.km > sortieL.km + 0.1 : x.duree > sortieL.duree + 0.01)) // en km avec un profil, sinon en durée
        .reduce((m, x) => (!m || (x.km || x.duree) > (m.km || m.duree) ? x : m), null);
      if (!R.sansSortieLongue && sortieL.nom === 'Sortie longue' && plusLongue) {
        // Méthodes : si une autre séance reste plus longue, elle tient lieu de sortie longue et la dernière devient une sortie facile
        dernier[0] = { ...sortieL, nom: sortieL.travail ? 'Sortie avec fin rapide' : 'Sortie facile' };
        if (!plusLongue.club) jours.forEach(j => { const m = j.indexOf(plusLongue); if (m >= 0) j[m] = { ...plusLongue, nom: `${plusLongue.nom} (tient lieu de sortie longue)` }; });
      }
      // recupZ1 (plan selon la répartition) : footings passés en Z1 (récupération) jusqu'au temps de Z1 visé ; regles.z1Lendemain : d'abord les footings du
      // lendemain d'une séance de qualité (la Z1 restante), puis les secondes séances des doublés, puis les autres ; méthodes : secondes séances
      // d'abord. lendemain(k, js) : le jour k suit un jour de qualité (plan par date : la veille dans le calendrier)
      const versZ1 = (js, lendemain) => {
        if (!doc.recupZ1) return js;
        js = js.map(j => j.slice());
        let manque = volP * cp.parts[0] - js.flat().filter(x => !x.club).reduce((a, x) => a + (x.parts.Z1 || 0), 0);        const secondes = js.flatMap((j, k) => j.slice(1).map((_, m) => [k, m + 1])), lendemains = js.map((j, k) => [k, 0]).filter(([k]) => lendemain(k, js));
        if (R.z1Lendemain) for (const [k] of lendemains) { // la Z1 restante commence les footings du lendemain de qualité (par pas de 5 min)
          const x = js[k][0], z1 = Math.min(x.duree, Math.round(manque / 5) * 5);
          if (manque <= 0 || z1 < 5 || x.nom !== 'Footing' || x.etapes.length > 1) continue;
          js[k][0] = footingZ1(x.duree, z1, c); manque -= z1;
        }
        const cand = R.z1Lendemain ? [...secondes, ...js.map((j, k) => [k, 0])] : [...secondes, ...lendemains, ...js.map((j, k) => [k, 0])];
        for (const [k, m] of cand) {
          const x = js[k][m];
          if (manque <= 0) break;
          if (x.nom !== 'Footing' || x.etapes.length > 1 || manque < x.duree / 2) continue; // footings simples seulement (pas les accélérations)
          js[k][m] = footing(x.duree, c, 'Z1');
          manque -= x.duree;
        }
        return js;
      };
      // regles.alterner, sans dates : jamais deux jours de qualité de suite si c'est possible (qualité ajoutée par la longueur maximale, séance piste du club) :
      // on alterne qualité et jours faciles, le dernier jour compris ; la semaine de course garde la course en dernier
      const estQ = (j) => j.some(x => x.qualite || (x.club && x.travail));
      const alterner = (js) => {
        if (!R.alterner || cs || w.debut || !js.some((j, k) => k && estQ(j) && estQ(js[k - 1]))) return js;
        const Qj = js.filter(estQ), Fj = js.filter(j => !estQ(j)), ordre = [];
        while (Qj.length || Fj.length) { const prev = ordre[ordre.length - 1]; ordre.push((prev && estQ(prev)) || !Qj.length ? Fj.shift() || Qj.shift() : Qj.shift()); }
        return ordre;
      };
      jours.splice(0, jours.length, ...alterner(jours));
      const parDate = !!w.debut && R.z1Lendemain; // par date : la Z1 est placée après le placement sur le calendrier (vrais lendemains de qualité)
      if (!parDate) jours.splice(0, jours.length, ...versZ1(jours, (k, js) => k > 0 && js[k - 1][0].qualite));
      // Mode par date : les jours sont placés sur le calendrier (courses aux dates des compétitions, objectif à la date de fin)
      if (w.debut) {
        // séances du club : à leur jour de la semaine (lundi, jeudi) quand il tombe dans la semaine du plan
        const fixes = K.club.fixes(clubs, club, w);
        // une date par jour de course (plusieurs courses le même jour : un seul jour, « souple » si elles sont toutes courues en footing)
        const p = placerJours(jours, w, jourCourse.map(g => g[0].t), jourCourse.map(g => g.every(x => x.effort === 'footing')), fixes, datesCourses, evite, nuitS ? (t) => K.nuit.jour(t, nuitS).sortie : undefined, nuitS ? (t) => K.nuit.jour(t, nuitS).nuit : undefined);
        retirees += p.retires;
        if (p.retires) (w.notes = w.notes || []).push(`${p.retires} séance${p.retires > 1 ? 's' : ''} de moins cette semaine : pas de séance de qualité à moins de 3 jours d'une course, ni après la date de l'objectif.`);
        // Séance de qualité restée sur un jour sensible du cycle (pas d'autre créneau possible) : mention, sans toucher au volume
        // Idem le matin après une nuit de travail (pas d'autre créneau) : mention « à alléger, ou après une sieste »
        const mention = (t) => [cyc && K.cycle.phaseDu(t, cyc).sensible && 'Jour sensible de votre cycle : à alléger ou à décaler selon vos sensations.',
          nuitS && K.nuit.mention(t, nuitS)].filter(Boolean).join(' ');
        // travail de nuit : doublés restés un lendemain de nuit, reportés sur un autre footing ou fondus en un seul footing
        const jr = p.dates && nuitS ? p.jours.map(j => j.slice()) : p.jours;
        let fondus = p.dates && nuitS ? K.nuit.reporterDoubles(jr, p.dates, nuitS, c, lim, lim5) : 0;
        const jp = !p.dates || !evite ? jr : jr.map((j, k) => {
          const m = mention(p.dates[k]), n = nuitS && K.nuit.jour(p.dates[k], nuitS);
          if (m && n && n.sortie) qSortie += j.filter(x => x.qualite && !x.club).length;
          if (m) qEvitees += j.filter(x => x.qualite && !x.club).length;
          let jj = !m ? j : j.map(x => (!x.qualite ? x : { ...x, texte: `${x.texte} <em>${m}</em>` }));
          const aj = K.nuit.ajusterJour(jj, n, c, lim, lim5); // doublé un lendemain de nuit fondu, ou mention un jour de départ en nuit
          if (aj.fondu) fondus++;
          jj = aj.jj;
          return jj;
        });
        if (fondus) { doublesFondus += fondus; (w.notes = w.notes || []).push(`Travail de nuit : ${fondus} doublé${fondus > 1 ? 's' : ''} retiré${fondus > 1 ? 's' : ''} d'un lendemain de nuit : le 2e footing est ajouté à un footing d'un autre jour, ou fondu avec celui du jour (même volume).`); }
        if (R.sansSortieLongue) nommerLong(jp);
        const jn = !parDate ? jp : p.dates ? versZ1(jp, (k, js) => k > 0 && p.dates[k] - p.dates[k - 1] < 1.5 * JOUR && js[k - 1].some(x => x.qualite))
          : versZ1(jp, (k, js) => k > 0 && js[k - 1][0].qualite);
        if (R.sansSortieLongue) nomVrai(jn); // après versZ1 : le passage en Z1 change les km
        return { ...w, phase: nomP, jours: jn, dates: p.dates, seances: jn.flat() };
      }
      K.club.inserer(jours, club, clubs); // sans dates : lundi en tête, jeudi en 4e jour, avant la sortie longue
      const js = alterner(jours);
      if (R.sansSortieLongue) nomVrai(js);
      return { ...w, phase: nomP, jours: js, seances: js.flat() };
    });
    // Alertes d'incohérence liées aux séances du club
    const pl = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
    const aClub = K.club.alertes({ c, clubs, nClub, clubQ, jourLibres, aClubSem, semaines });
    // Alertes sur la longueur maximale d'une séance : compatibilité avec l'objectif et le volume, puis effets sur le plan construit
    const aLimite = lim ? K.limite.alertes({ c, lim, semaines, parLimite, coupe, trop, clubs }) : [];
    // Travail de nuit : conditions du suivi, doublés sans jour de repos, doublés fondus, courses et séances de qualité un lendemain de nuit
    const aNuit = K.nuit.alertesPlan({ s: nuitS, cal, doublesFondus, datesCourses, qSortie });
    const aCycleC = K.cycle.alertesCourses(datesCourses, cyc); // course sur un jour sensible du cycle (information)
    // Plan sous contraintes : beaucoup de contraintes combinées (4 ou plus, ou 3 avec des compromis) : le plan est construit, l'alerte explique
    // les contraintes actives, les compromis qu'elles ont imposés et comment retrouver de la marge
    const nCompet = cal.reduce((a, w) => a + (w.courses || []).length, 0), nD = nbDoubles(); // pl : défini plus haut (alertes du club)
    const contraintes = [state.regles.actif && 'le suivi du cycle menstruel', state.nuit.actif && 'le travail de nuit', lim && `la longueur maximale de séance (${lim.txt})`, nD && pl(nD, 'doublé'),
      (court || c.heures < volumeMini(c)) && 'un volume faible pour l\'objectif', nCompet && pl(nCompet, 'compétition intermédiaire').replace('intermédiaire', nCompet > 1 ? 'intermédiaires' : 'intermédiaire'),
      nClub && `${pl(nClub, 'séance')} du club`].filter(Boolean);
    const compromis = [qEvitees && `${pl(qEvitees, 'séance')} de qualité sur un jour à éviter (cycle ou lendemain de nuit, avec la mention « à alléger »)`,
      doublesFondus && `${pl(doublesFondus, 'doublé')} retiré${doublesFondus > 1 ? 's' : ''} d'un lendemain de nuit`, retirees && `${pl(retirees, 'séance')} retirée${retirees > 1 ? 's' : ''} autour des compétitions`,
      Object.keys(aClubSem.ecartees).length && 'des séances du club remplacées certaines semaines', coupe >= 1 && 'de l\'effort de qualité raccourci par la longueur maximale',
      court && 'des footings portés au minimum (volume réel au-dessus du volume visé)',
      plafond && 'des footings plafonnés (volume réel sous le volume visé)', exces >= 1 && 'de l\'intensité non placée'].filter(Boolean);
    const aComplexe = contraintes.length >= 4 || (contraintes.length >= 3 && compromis.length)
      ? [`Plan sous contraintes : ${contraintes.length} contraintes combinées (${contraintes.join(', ')}). Le plan est construit, mais ${compromis.length
        ? `il a dû faire des compromis : ${compromis.join(' ; ')}.` : 'il reste peu de marge : le moindre changement peut forcer des compromis.'} Pour un plan plus fidèle à la méthode, relâchez une contrainte (moins de doublés, une longueur maximale plus haute, plus de jours de course ou de volume, moins de compétitions).`] : [];
    return { semaines, court, plafond, avecSL, exces, cycle, aClub, aLimite, aNuit, aCycleC, aComplexe, aCourses: [...aCourses, ...aZones] };
  }

  /* ---------- Rendu ---------- */

  const moments = (j) => K.doubles.moments(j); // séances d'un jour avec leur moment (contraintes/doubles.js)

  function contexte() {
    // Allure de référence (preset) : chrono prédit, course en fin de plan ; allure cible placée sur la barre : temps de soutien
    // théorique, sans course. Zone de l'allure cible d'après sa place en % de l'allure 1 h (aussi sans profil).
    const b = window.Balance.contexte(), p = b.profil, zones = E.zones(p || { V: 1, k: -0.06 });
    const pred = p && (b.preset ? E.tablePredictions(p, [b.dist])[0] : { temps: b.tObj, allureMinKm: b.allure }), ok = pred && Number.isFinite(pred.temps);
    const c = { goal: b.goal, label: b.label, nomObj: b.preset ? b.label.toLowerCase() : 'cible', dist: b.dist, heures: b.heures, profil: ok ? p : null,
      course: b.preset, parts: b.parts, tObj: ok ? pred.temps : b.dist / (10000 / 60), // sans profil : 10 km/h
      zoneObj: (zones.find(z => b.pct * 100 < (z.pMax ?? Infinity)) || zones[5]).id };
    if (c.profil) Object.assign(c, { vRef: E.vitesseReference(p), allureObj: pred.allureMinKm, zones: Object.fromEntries(zones.map(z => [z.id, z])) });
    c.volKm = b.volKm; // volume saisi en km (sinon null)
    c.limite = K.limite.de(c);
    return c;
  }

  // Règles appliquées par construire() quel que soit le plan (personnalisé ou méthode d'entraîneur), affichées sous le résumé
  const REGLES_COMMUNES = [
    "Cycle : automatique par défaut (charge constante sous 6 semaines, sinon 3 semaines de charge pour 1 de décharge, 2 pour 1 sous 8 semaines ; avec des compétitions, la longueur de charge qui place les décharges sur ou juste après les courses chargées), charge constante (même volume chaque semaine), ou semaines de charge (+ 6 % de volume par semaine) suivies d'une semaine de décharge (70 % du volume, un niveau plus bas, une séance de qualité en moins ; Spécifique LPN : voir ses règles).",
    "Volume saisi : cible par défaut (moyenne des semaines de charge) ; maxi : la semaine la plus chargée, compétitions comprises, vaut ce volume ; mini : la semaine de charge la plus légère vaut ce volume. Tout le cycle est décalé d'autant (marge de 5 min pour les arrondis) ; décharge, affûtage et semaine de l'objectif restent allégés.",
    "Affûtage avant l'objectif : 1 semaine (60 % du volume), 2 pour le semi et le marathon à partir de 10 semaines, 3 pour le marathon avec Pfitzinger à partir de 12 semaines ; aucun sous 6 semaines. La dernière semaine finit par la course.",
    "Compétitions intermédiaires (plan par date) : le TSS de la course (+ 50 % pour une course à fond, impact physiologique maximal) est retranché de la cible du cycle pour sa semaine ; la récupération (25 % de ce TSS la semaine précédente, 50 % puis 25 % les deux suivantes) est prise en partie sur les semaines de décharge ou d'affûtage, déjà allégées ; volume au moins égal à 30 % de la cible.",
    "Engagement dans une compétition : à fond (allure prédite), sans forcer (10 % moins vite), à la cool (20 % moins vite) ou en footing (milieu de la Z2) ; sa durée, son TSS et sa zone sont recalculés, et c'est ce temps en zone qui est déduit de la répartition. Une course en footing ne limite pas les séances de qualité autour d'elle.",
    "Autour d'une compétition : séances de qualité limitées selon sa charge (légère, modérée ou forte), aucune à moins de 3 jours d'une course, pas de doublé la semaine de la course ; la course remplace la sortie longue, ou le dernier jour en Spécifique LPN (s'il y en a plusieurs, les autres remplacent un footing).",
    "Calendrier (plan par date) : les jours sont datés, les courses tombent à leur date, les autres jours sont répartis régulièrement, en évitant la veille d'une course ; la dernière semaine s'arrête à la date de l'objectif."];

  let donnees = null; // dernier plan affiché, lu par export.js
  const brut = (h) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  // Alertes classées (bloquant, attention, information) et triées dans cet ordre ; au-delà de 3, les suivantes sont repliées
  const NIVEAUX_ALERTE = [['err', /Incohérence|incompatible|non remplis|ne peuvent pas être raccourcies/], ['info', /tient lieu|servent|Moins de 6 semaines|ne peut pas être effectuée|Renseignez|^Cycle menstruel :|^Travail de nuit :/]];
  const ORDRE_ALERTE = ['err', 'warn', 'info'];
  function listeAlertes(el, liste) {
    const tri = liste.map(a => ({ a, n: (NIVEAUX_ALERTE.find(([, re]) => re.test(a)) || ['warn'])[0] })).sort((x, y) => ORDRE_ALERTE.indexOf(x.n) - ORDRE_ALERTE.indexOf(y.n));
    const li = (x) => `<li class="a-${x.n}">${x.a}</li>`, reste = tri.length - 3;
    el.innerHTML = tri.slice(0, 3).map(li).join('') + (reste > 0
      ? `<li class="a-plus"><details><summary>${reste} autre${reste > 1 ? 's' : ''} alerte${reste > 1 ? 's' : ''}</summary><ul class="alertes">${tri.slice(3).map(li).join('')}</ul></details></li>` : '');
    el.hidden = !liste.length;
  }
  // Icône d'une séance : club, course, qualité, sortie longue, récupération (Z1), footing
  const iconeSeance = (x) => (x.club ? '👥' : x.nom === 'Course' ? '🏁' : x.qualite ? '⚡' : /^(Sortie longue|Footing long)/.test(x.nom) ? '🛣️' : x.zone === 'Z1' ? '💤' : '🏃');
  const zoneChip = (z) => `<span class="zchip" style="--c:var(--${z.toLowerCase()})">${z}</span>`;

  function render() {
    const c = contexte();
    const doc = METHODES.find(d => d.id === state.methode) || METHODES.find(d => d.parDefaut); // aucune méthode n'est recommandée : méthode par défaut
    const zones = !!doc.repartition, RG = { ...REGLES_DEFAUT, ...(doc.regles || {}) }; // plan construit sur la répartition par zone ; règles de construction

    $('eq-repartition').hidden = !zones; // la répartition par zone ne concerne que les méthodes construites sur elle (repartition)
    $('pl-contexte').innerHTML = `${c.course ? 'Objectif' : 'Allure travaillée'} <strong>${c.label}</strong>` +
      (c.profil ? ` (<strong>${fA(c.allureObj)}</strong>, ${c.course ? (c.tObj > 300 ? 'chrono prédit au-delà de 5 h, hors du modèle' : `chrono prédit ≈ ${E.formatTemps(c.tObj)}`) : c.tObj >= 299 ? 'tenue plus de 5 h' : `tenue ≈ ${E.formatTemps(c.tObj)}`})` : '') +
      ` · volume ${{ max: 'maxi ', min: 'mini ' }[state.volType] || ''}<strong>${fD(c.heures * 60)}</strong> par semaine.` +
      (c.profil ? '' : ` Sans profil, les allures ne sont pas calculées : <button type="button" class="lien" data-vue="profil">saisir mes chronos</button>.`);

    // Choix de la méthode : liste déroulante (méthode par défaut en tête, puis les autres par difficulté croissante)
    // et fiche de la méthode choisie : public, épreuves visées, difficulté, mise en œuvre, durée du plan et prérequis non remplis
    const libelle = (d) => `<span class="lm-nom">${d.titre}${d.fiche.limitee ? ' *' : ''}</span>${ronds(d.difficulte[0])}`;
    $('pl-methodeBtn').innerHTML = libelle(doc);
    $('pl-methodeListe').innerHTML = [...METHODES.filter(d => d.parDefaut), ...parDifficulte(METHODES.filter(d => !d.parDefaut))].map(d => `<li role="option" id="lm-${d.id}" data-m="${d.id}" aria-selected="${d === doc}">${libelle(d)}</li>`).join('');
    const fm = doc.fiche, niv = doc.difficulte[0], lacunes = prerequis(doc, c);
    $('pl-fiche').innerHTML = `<p class="public" style="grid-column:1/-1;margin:0">${fm.public}${fm.limitee ? ' <abbr title="Sources limitées : construit à partir de résumés et de forums, sans le texte de l\'auteur sur les phases et les séances">* sources limitées</abbr>' : ''}</p>`
      + `<span class="ligne-fiche"><span class="sous">🎯 Épreuves visées</span> ${epreuves(doc, c)}</span>`
      + `<span class="ligne-fiche" title="${doc.difficulte[1][0].toUpperCase() + doc.difficulte[1].slice(1)}."><span class="sous">💪 Difficulté athlétique</span> ${ronds(niv)} <strong>${NIVEAUX_METHODE[niveau3(niv) - 1]}</strong></span>`
      + `<span class="ligne-fiche"><span class="sous">🛠️ Mise en œuvre</span> ${MISE[fm.mise]}</span>`
      + `<span class="ligne-fiche"><span class="sous">⏳ Durée du plan</span> ${fm.plan}</span>`
      + (lacunes.length ? `<span class="prerequis" style="grid-column:1/-1">⚠ Prérequis : ${lacunes.join(' ; ')}</span>` : '');

    const { semaines, court, plafond, avecSL, exces, cycle, aClub, aLimite, aNuit, aCycleC, aComplexe, aCourses } = construire(doc, c), hor = horizon();
    const nD = nbDoubles(), total = state.seances + nD;
    const pl = (n, mot) => `<strong>${n}</strong> ${mot}${n > 1 ? 's' : ''}`;
    $('pl-resumeSemaine').innerHTML = `<div class="grand">${total}<small>séance${total > 1 ? 's' : ''} / semaine</small></div><ul>`
      + `<li>${pl(state.seances, 'jour')} de course</li><li>${nD ? pl(nD, 'doublé') : 'Aucun doublé'}</li><li>${pl(7 - state.seances, 'jour')} de repos</li>`
      + `<li>≈ <strong>${fD(c.heures * 60 / total)}</strong> par séance</li></ul>`;
    $('pl-titre').innerHTML = zones ? `${doc.nom} <span class="sous">· optimiser une allure spécifique selon des critères paramétrables</span>` : `Méthode ${doc.nom}`;
    // Notes personnalisées visibles ; explications (résumé, principes, règles communes) repliées
    // (la difficulté détaillée de la méthode, doc.difficulte[1], est dans l'infobulle de la ligne « Difficulté athlétique »)
    $('pl-resume').innerHTML = (doc.avertissement ? `<p class="info-box">${doc.avertissement}</p>` : '') + (doc.noteProfil && doc.noteProfil(c) ? `<p class="note">${doc.noteProfil(c)}</p>` : '') +
      (doc.slNote ? `<p class="note">${doc.slNote(avecSL)}</p>` : '') +
      '<div class="replis">' +
      `<details class="mini"><summary>📖 À propos de ce plan</summary>${doc.bio ? `<p class="note bio"><strong>${doc.bioTitre || 'L\'entraîneur'} :</strong> ${doc.bio}</p>` : ''}<p class="note">${doc.resume}</p></details>` +
      `<details class="mini"><summary>${zones ? '📐 Règles de construction' : '📚 Principes et source'}</summary><ul class="note">${doc.principes.map(p => `<li>${p}</li>`).join('')}</ul>` +
      (zones ? '' : `<p class="note">Source : ${doc.source}</p>`) + '</details>' +
      `<details class="mini"><summary>🧩 Règles communes à tous les plans</summary><ul class="note">${REGLES_COMMUNES.map(p => `<li>${p}</li>`).join('')}</ul></details></div>`;

    const alertes = [];
    if (exces >= 1) alertes.push(`Beaucoup d'intensité pour le nombre de séances de qualité : jusqu'à ${fD(exces)} d'effort par semaine n'ont pas pu être placés (${doc.blocsMax} blocs par séance au plus). Ajoutez des jours de course ou baissez la part d'intensité.`);
    if (court) alertes.push(`${state.volType === 'max' ? 'Volume maxi incompatible avec' : 'Volume juste pour'} ${total} séances par semaine : les footings sont portés à ${RG.efMin} min, le volume réel dépasse donc ${volRef()} certaines semaines.${nD ? ' Réduisez le nombre de doublés.' : ''}`);
    if (plafond) alertes.push(`Volume élevé pour ${total} séances par semaine : les footings sont limités à ${doc.footingMax ? `${doc.footingMax} min (durée maximale conseillée par la méthode)` : zones ? 'la durée maximale d\'une séance' : 'la durée de la sortie longue'}, le volume réel reste sous ${volRef()} certaines semaines. ${doc.joursMax ? `La méthode prévoit ${doc.joursMax} jours de course : baissez plutôt le volume hebdomadaire.` : 'Ajoutez des jours de course ou des doublés.'}`);
    const manque = zones ? [] : prerequis(doc, c);
    if (manque.length) alertes.push(`Prérequis de la méthode ${doc.nom} non remplis (${manque.join(' ; ')}) : avec vos données, elle perd une partie de son principe.`);
    K.doubles.alertes({ nD, total, c, utiles: RG.doublesUtiles, volumeMin: DOUBLE_VOLUME_M }).forEach(a => alertes.push(a));
    if ((!zones || state.horizon === 'date') && hor.W < 6 && !doc.sansAffutage) alertes.push(state.horizon === 'date' ? "Moins de 6 semaines avant l'objectif : pas d'affûtage, la course finale arrive sans semaine allégée." : "Moins de 6 semaines : pas d'affûtage, le plan sert plutôt de bloc d'entraînement.");
    if (hor.invalide) alertes.push(`Renseignez le début du plan et la date de l'objectif (après le début) : en attendant, le plan fait ${state.semaines} semaines.`);
    if (hor.brut < 4) alertes.push("Moins de 4 semaines entre le début du plan et l'objectif : le plan est porté à 4 semaines et dépasse la date de l'objectif.");
    if (hor.brut > SEMAINES_MAX) alertes.push(`Plus de ${SEMAINES_MAX} semaines avant l'objectif : le plan est limité à ${SEMAINES_MAX} semaines, avancez la date de début.`);
    if (c.profil && c.course && c.tObj > 300) alertes.push(`Objectif hors du modèle : le chrono prédit sur ${c.label.toLowerCase()} dépasse 5 h, durée au-delà de laquelle l'indice d'endurance n'est plus valable. Les allures de course du plan sont indicatives : envisagez la course-marche (méthode Galloway) ou un objectif plus court.`);
    aLimite.forEach(a => alertes.push(a));
    aClub.forEach(a => alertes.push(a));
    aCourses.forEach(a => alertes.push(a));
    const aCycle = K.cycle.alertes(); // cycle menstruel : l'alerte santé figure aussi dans les alertes du plan
    aCycle.filter(a => /^Santé/.test(a)).forEach(a => alertes.push(a));
    aCycleC.forEach(a => alertes.push(a));
    aNuit.forEach(a => alertes.push(a));
    aComplexe.forEach(a => alertes.push(a));
    listeAlertes($('pl-alertes'), alertes);
    const rapport = [...aComplexe, ...rapportSemaine(c), ...aLimite, ...aClub, ...aCycle, ...aCycleC, ...aNuit];
    // Difficulté (méthodes construites sur la répartition) : sous le volume minimal de l'objectif (RAPPORT), le temps de qualité est trop court pour que la longueur des
    // séries et des récupérations varie vraiment
    $('pl-diffVolume').hidden = !(zones && c.heures < volumeMini(c));
    K.limite.afficher(); // champ de la longueur maximale (étape 2)
    K.club.afficher(); // cases et note des séances du club (étape 2)
    K.cycle.afficher(); // champs du cycle menstruel (étape 2)
    K.nuit.afficher(); // champs du travail de nuit (étape 2)
    K.volume.afficher(); // cases volume maxi / mini (étape 2)
    listeAlertes($('pl-alerteSemaine'), rapport);

    // Récapitulatif : séances, temps, distance (avec profil) et travail de qualité, par semaine et sur tout le plan
    const somme = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
    const recap = semaines.map(w => ({ n: w.seances.length, jours: w.jours.length, temps: somme(w.seances, x => x.duree),
      km: c.profil ? somme(w.seances, x => x.km) : null, qualite: somme(w.seances, x => x.travail) }));
    const tot = { n: somme(recap, r => r.n), temps: somme(recap, r => r.temps), km: c.profil ? somme(recap, r => r.km) : null, qualite: somme(recap, r => r.qualite) };
    const fKm1 = (x) => `≈ ${(Math.round(x * 10) / 10).toLocaleString('fr-FR')} km`; // distance d'une séance, estimée
    // Bloc de date de l'agenda : numéro et jour de la semaine (« Jour 1 » en l'absence de date)
    // Cycle menstruel (plan par date) : pastille de phase sous la date, cerclée les jours sensibles
    const cyc = K.cycle.suivi(); // suivi du cycle menstruel (plan par date) : pastilles de phase et légende
    $('pl-legendeCycle').hidden = !cyc;
    const pastilleCycle = (t) => K.cycle.pastille(t, cyc);
    // Travail de nuit (plan par date) : 🌃 nuit travaillée le soir, 🛌 sortie de nuit (lendemain matin)
    const nuitR = K.nuit.suivi();
    $('pl-legendeNuit').hidden = !nuitR;
    const pastilleNuit = (t) => K.nuit.pastille(t, nuitR);
    const blocDate = (w, k) => (w.dates
      ? `<div class="date"><b>${new Date(w.dates[k]).getUTCDate()}</b><span>${new Date(w.dates[k]).toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' })}</span>${pastilleCycle(w.dates[k])}${pastilleNuit(w.dates[k])}</div>`
      : `<div class="date"><b>${k + 1}</b><span>Jour</span></div>`);
    const W = semaines.length, fKm = (x) => `${Math.round(x)} km`, totaux = recap.map(r => r.temps), max = Math.max(...totaux);
    const tuile = (ico, label, valeur, sous) => `<div class="chiffre"><div class="label"><span aria-hidden="true">${ico}</span> ${label}</div><div class="valeur">${valeur}</div><div class="sous">${sous}</div></div>`;
    $('pl-chiffres').innerHTML = [
      tuile('🗓️', 'Séances', String(tot.n), `${(tot.n / W).toFixed(1).replace('.', ',')} par semaine, sur ${state.seances} jours`),
      tuile('⏱️', 'Temps de course', fD(tot.temps), `${fD(tot.temps / W)} par semaine (${{ max: 'maxi', min: 'mini' }[state.volType] || 'réf.'} ${fD(c.heures * 60)})`),
      tuile('📏', 'Distance', tot.km === null ? '—' : `≈ ${fKm(tot.km)}`, tot.km === null ? 'profil nécessaire' : `≈ ${fKm(tot.km / W)} par semaine`),
      tuile('⚡', 'Qualité', fD(tot.qualite), `${Math.round(100 * tot.qualite / tot.temps)} % du temps, récupérations comprises`)
    ].join('');
    const cls = (w) => (w.courses ? 'competition' : ({ Charge: 'charge', 'Décharge': 'decharge', 'Affûtage': 'affutage' })[w.type]);
    const etiq = (w) => `${w.type}${w.phase === w.type ? '' : ` · ${w.phase}`}${w.etiquette ? ` · ${w.etiquette}` : ''}`;
    // Infobulle de l'histogramme : temps, charge (TSS = durée (h) × IF² × 100 par zone, IF de balance.js) et temps par zone
    const ZIDS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'], iff = window.Balance.zones().map(z => z.iff);
    const infobulle = (w, i) => {
      const p = ajoute(...w.seances.map(x => x.parts)), tss = ZIDS.reduce((a, z, k) => a + (p[z] || 0) / 60 * iff[k] ** 2 * 100, 0);
      return `Semaine ${i + 1} · ${etiq(w)}\nTemps ${fD(totaux[i])} · TSS ${Math.round(tss + (w.surplus || 0))}${w.surplus ? ` (dont +${Math.round(w.surplus)} de compétition à fond)` : ''}\n${ZIDS.filter(z => (p[z] || 0) >= 0.5).map(z => `${z} : ${fD(p[z])}`).join(' · ')}`;
    };
    $('pl-volumes').innerHTML = semaines.map((w, i) => `<div class="${cls(w)}" style="height:${(totaux[i] / max * 100).toFixed(1)}%" title="${infobulle(w, i)}"><span>${i + 1}</span></div>`).join('');
    $('pl-recapTete').innerHTML = `<tr><th>Sem.</th><th>Type · phase</th><th class="num">Séances</th><th class="num">Temps</th>${c.profil ? '<th class="num">Distance</th>' : ''}<th class="num">Qualité</th></tr>`;
    $('pl-recap').innerHTML = semaines.map((w, i) => `<tr><td>${i + 1}</td><td>${etiq(w)}</td>
      <td class="num">${recap[i].n}${recap[i].n > recap[i].jours ? ` <span class="sous">(${recap[i].jours} j)</span>` : ''}</td><td class="num">${fD(recap[i].temps)}</td>
      ${c.profil ? `<td class="num">≈ ${fKm(recap[i].km)}</td>` : ''}<td class="num">${fD(recap[i].qualite)}</td></tr>`).join('');
    $('pl-recapTotal').innerHTML = `<tr><td>Total</td><td></td><td class="num">${tot.n}</td><td class="num">${fD(tot.temps)}</td>${c.profil ? `<td class="num">≈ ${fKm(tot.km)}</td>` : ''}<td class="num">${fD(tot.qualite)}</td></tr>`;
    // Temps de travail par zone, sur tout le plan : durée, distance (durée / allure médiane de la zone, avec profil) et part du temps
    const partsPlan = ajoute(...semaines.flatMap(w => w.seances.map(x => x.parts))), totPlan = Object.values(partsPlan).reduce((a, x) => a + x, 0);
    const kmZ = ZIDS.map(z => (c.profil ? (partsPlan[z] || 0) / aZ(c, z) : null)), totKmZ = c.profil ? kmZ.reduce((a, x) => a + x, 0) : null;
    $('pl-recapZonesTete').innerHTML = `<tr><th>Zone</th><th class="num">Durée</th><th class="num">Par semaine</th>${c.profil ? '<th class="num">Distance</th>' : ''}<th class="num">% du temps</th></tr>`;
    $('pl-recapZones').innerHTML = ZIDS.map((z, k) => `<tr><td><strong>${z}</strong></td><td class="num">${(partsPlan[z] || 0) < 0.5 ? '—' : fD(partsPlan[z])}</td><td class="num">${(partsPlan[z] || 0) / W < 0.5 ? '—' : fD(partsPlan[z] / W)}</td>`
      + `${c.profil ? `<td class="num">${kmZ[k] < 0.05 ? '—' : `${fKm1(kmZ[k])}`}</td>` : ''}<td class="num">${totPlan ? (Math.round(1000 * (partsPlan[z] || 0) / totPlan) / 10).toLocaleString('fr-FR') : 0} %</td></tr>`).join('');
    $('pl-recapZonesTotal').innerHTML = `<tr><td>Total</td><td class="num">${fD(totPlan)}</td><td class="num">${fD(totPlan / W)}</td>${c.profil ? `<td class="num">${fKm1(totKmZ)}</td>` : ''}<td class="num">100 %</td></tr>`;

    const ouverts = [...document.querySelectorAll('#pl-liste details')].map(d => d.open);
    $('pl-liste').innerHTML = semaines.map((w, i) => {
      const r = recap[i];
      return `<details class="semaine ${cls(w)}"${(ouverts.length ? ouverts[i] : i === 0) ? ' open' : ''}>
        <summary><span class="s-titre">Semaine ${i + 1}</span>${w.debut ? ` <span class="sous">${fDate(w.debut)} – ${fDate(w.fin)}</span>` : ''} <span class="badge ${cls(w)}">${etiq(w)}</span>
          <span class="chips"><span title="Séances">🗓️ ${r.n}</span><span title="Temps de course">⏱️ ${fD(r.temps)}</span>${r.km === null ? '' : `<span title="Distance estimée">📏 ≈ ${fKm(r.km)}</span>`}<span title="Travail de qualité, récupérations comprises">⚡ ${r.qualite ? fD(r.qualite) : '—'}</span><span title="Niveau de difficulté">📶 ${Math.round(w.niveau)}/10</span>${(w.notes || []).length ? `<span title="Notes sur cette semaine">📝 ${w.notes.length}</span>` : ''}</span></summary>
        ${(w.notes || []).map(n => `<p class="note-sem">${n}</p>`).join('')}
        <ol class="seances">${w.jours.map((j, k) => `<li style="--c:var(--${j[0].zone.toLowerCase()})">${blocDate(w, k)}<div class="corps">` +
          (j.length > 1 ? `<span class="jour">${j.every(x => x.nom === 'Course') ? `${j.length} courses le même jour` : `Doublé${moments(j)[0][0] ? '' : ', ordre au choix'}`}</span>` : '') +
          moments(j).map(([m, x]) => `<div class="seance"><div><span class="s-ico" aria-hidden="true">${iconeSeance(x)}</span><strong>${m ? `${m} : ` : ''}${x.nom}</strong> ${zoneChip(x.zone)}<div class="sous">${x.texte}</div></div><div class="droite">${x.km === null ? '' : `<b>${fKm1(x.km)}</b>`}<div class="sous">${fD(x.duree)}</div></div></div>`).join('') + '</div></li>').join('')}</ol></details>`;
    }).join('');

    const premiere = semaines[0].seances.find(x => x.qualite);
    $('pl-diffLbl').textContent = `${state.difficulte}/10`;
    $('pl-diffNote').innerHTML = premiere ? `Première semaine, ${premiere.nom.toLowerCase()} : ${premiere.texte}` : 'Première semaine : footings et lignes droites (phase de fondation).';
    $('pl-cycleNb').hidden = state.cycle !== 'cycle';
    $('pl-cycleAuto').hidden = state.cycle !== 'auto' && !cycle.imposee;
    $('pl-cycleAuto').textContent = cycle.imposee ? 'Cette méthode impose une charge constante, sans semaine de décharge.'
      : `Cycle retenu : ${cycle.type === 'cycle' ? `${cycle.charge} semaine${cycle.charge > 1 ? 's' : ''} de charge puis ${cycle.decharge} de décharge` : 'charge constante'} (${cycle.raison}).`;

    // Durée du plan : nombre de semaines, ou dates (début du plan, objectif) avec les compétitions intermédiaires
    const parDate = state.horizon === 'date';
    document.querySelectorAll('#pl-horizon [data-hor]').forEach(b => {
      b.classList.toggle('actif', b.dataset.hor === state.horizon);
      b.setAttribute('aria-pressed', b.dataset.hor === state.horizon);
    });
    $('pl-hDate').hidden = !parDate;
    $('pl-labSemaines').hidden = parDate;
    $('pl-hResume').textContent = !parDate ? '' : hor.invalide ? "Renseignez le début du plan et la date de l'objectif (après le début)."
      : `Du ${fDate(hor.d0, true)} au ${fDate(hor.d1, true)} : ${hor.W} semaine${hor.W > 1 ? 's' : ''}${c.course ? `, objectif ${c.label}` : ''}.`;
    K.competitions.afficher(c); // liste des compétitions intermédiaires (étape 3)
    K.doubles.afficher(); // moment de la séance d'intensité les jours de doublé (étape 2)

    // Colonne « Plan / sem. » du tableau de répartition (balance.js) : temps moyen par semaine dans chaque zone
    const parts = ajoute(...semaines.flatMap(w => w.seances.map(x => x.parts))), totP = Object.values(parts).reduce((a, x) => a + x, 0);
    const tempsZ = (m) => (m / W < 0.5 ? '—' : fD(Math.round(m / W)));
    ZIDS.forEach((z, i) => { const td = $(`eq-plan${i}`); if (td) td.textContent = `${tempsZ(parts[z] || 0)} · ${Math.round(100 * (parts[z] || 0) / totP)} %`; });
    if ($('eq-planTot')) $('eq-planTot').textContent = tempsZ(totP);

    // Données des exports (export.js) : textes sans balises, étapes structurées pour les montres
    donnees = { titre: zones ? doc.titre : `Méthode ${doc.nom}`, mode: zones ? 'zones' : 'methode', methode: zones ? null : doc.id,
      contexte: { allure: c.label, allureMinKm: c.profil ? c.allureObj : null, tempsMin: c.profil ? c.tObj : null, volumeH: c.heures, typeVolume: state.volType, jours: state.seances,
        doubles: nD, semaines: W, cycle: nomCycle(cycle), difficulte: state.difficulte, limite: c.limite ? c.limite.txt : null },
      repartition: ZIDS.map((z, i) => ({ zone: z, cible: Math.round(1000 * c.parts[i]) / 10, plan: Math.round(1000 * (parts[z] || 0) / totP) / 10 })),
      semaines: semaines.map((w, i) => ({ numero: i + 1, type: w.type, phase: w.phase, debut: w.debut ? new Date(w.debut).toISOString().slice(0, 10) : null, fin: w.fin ? new Date(w.fin).toISOString().slice(0, 10) : null, notes: (w.notes || []).slice(), niveau: Math.round(w.niveau), tempsMin: Math.round(recap[i].temps), km: recap[i].km,
        jours: w.jours.map((j, k) => ({ jour: k + 1, date: w.dates ? new Date(w.dates[k]).toISOString().slice(0, 10) : null, ...(cyc && w.dates ? { cycle: K.cycle.infoJour(w.dates[k], cyc) } : {}), ...(nuitR && w.dates ? { travailNuit: K.nuit.infoJour(w.dates[k], nuitR) } : {}), seances: moments(j).map(([m, x]) => ({ moment: m, nom: x.nom, zone: x.zone, dureeMin: Math.round(x.duree),
          km: x.km === null ? null : Math.round(x.km * 10) / 10, description: brut(x.texte), etapes: x.etapes })) })) })) };
    save();
  }


  // Initialisation des contrôles
  $('pl-seances').innerHTML = [3, 4, 5, 6, 7].map(n => `<option value="${n}">${n}</option>`).join('');
  const champs = { seances: [3, 7], doubles: [0, 6], semaines: [4, 24], charge: [1, 6], decharge: [1, 2], difficulte: [1, 10] };
  for (const [cle, [a, b]] of Object.entries(champs)) {
    $(`pl-${cle}`).value = state[cle];
    $(`pl-${cle}`).addEventListener('input', e => { const v = Math.round(+e.target.value); if (v >= a && v <= b) { state[cle] = v; K.doubles.options(); render(); } });
  }
  $('pl-debut').value = state.debut;
  $('pl-fin').value = state.fin;
  $('pl-debut').addEventListener('change', e => { state.debut = e.target.value; render(); });
  $('pl-fin').addEventListener('change', e => { state.fin = e.target.value; render(); });
  $('pl-horizon').addEventListener('click', e => {
    const b = e.target.closest('[data-hor]');
    if (!b) return;
    state.horizon = b.dataset.hor;
    if (state.horizon === 'date' && !state.debut) { state.debut = new Date().toISOString().slice(0, 10); $('pl-debut').value = state.debut; } // par défaut : aujourd'hui
    render();
  });
  $('pl-cycle').value = state.cycle;
  $('pl-cycle').addEventListener('change', e => { state.cycle = e.target.value; render(); });
  // Liste déroulante des méthodes (listbox accessible : flèches, Entrée, Échap) ; les ronds de difficulté sont à droite de chaque ligne
  const btn = $('pl-methodeBtn'), liste = $('pl-methodeListe');
  const activer = (li) => { liste.querySelectorAll('li.actif').forEach(x => x.classList.remove('actif')); if (li) { li.classList.add('actif'); btn.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } };
  const ouvrir = (o) => { liste.hidden = !o; btn.setAttribute('aria-expanded', o); if (o) activer(liste.querySelector('[aria-selected="true"]')); };
  const choisir = (li) => { ouvrir(false); if (li && li.dataset.m !== state.methode) { state.methode = li.dataset.m; render(); } btn.focus(); };
  btn.addEventListener('click', () => ouvrir(liste.hidden));
  liste.addEventListener('click', e => choisir(e.target.closest('li')));
  liste.addEventListener('mousemove', e => { const li = e.target.closest('li'); if (li && !li.classList.contains('actif')) activer(li); });
  btn.addEventListener('keydown', e => {
    const items = [...liste.querySelectorAll('li')], cur = liste.querySelector('li.actif') || liste.querySelector('[aria-selected="true"]'), i = items.indexOf(cur);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (liste.hidden) ouvrir(true); else activer(items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]); }
    else if ((e.key === 'Enter' || e.key === ' ') && !liste.hidden) { e.preventDefault(); choisir(cur); }
    else if (e.key === 'Escape') ouvrir(false);
  });
  btn.addEventListener('keyup', e => { if (e.key === ' ') e.preventDefault(); });
  document.addEventListener('click', e => { if (!e.target.closest('.lm')) ouvrir(false); });
  document.addEventListener('balance', render); // nouveau profil, allure cible, volume ou répartition dans Balance

  // Sources des méthodes (bas de page, « Sources et études ») : tirées de la fiche de chaque méthode, par ordre alphabétique
  // (le bas de page suit les scripts dans la page : rempli une fois le document chargé)
  const remplirSources = () => { if ($('sources-methodes')) $('sources-methodes').innerHTML = METHODES.filter(d => d.source).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .map(d => `<li><strong>${d.titre}</strong>${d.fiche.limitee ? ' (sources limitées)' : ''} : ${d.source}</li>`).join(''); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', remplirSources); else remplirSources();

  // Interface pour les autres fichiers du plan (plan-seances.js, methodes/*.js) : fonctions utiles aux séances et registres
  Object.assign(window.PlanCore, { E, lerp, borne, state, fD, fA, fourchette, arr5, arrondi, moy, allureDist, pv, allureT, MILE, al, zt, aZ, kmS, plageZ, plageA,
    zoneDe, ajoute, TLIM_PART, tlim, enveloppe, echauffement, RETOUR, contexte, OBJECTIFS, volumeMini, volumeMiniTxt, finPhase, biais, f1, nbDoubles, horizon, footing, ALLURES, SEANCES,
    $, parseDate, fDate, JOUR, render, contraintes: K,
    allures: (o) => Object.assign(ALLURES, o), seances: (o) => Object.assign(SEANCES, o), methode: enregistrerMethode, contrainte: (nom, o) => { K[nom] = o; } });

  window.Plan = { donnees: () => donnees };
  // Premier affichage une fois tous les fichiers du plan chargés (les méthodes s'enregistrent après plan.js, dans n'importe quel ordre)
  const demarrer = () => { verifierMethodes(); render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
