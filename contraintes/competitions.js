/* Contrainte : compétitions intermédiaires (étape 3, plan par date, toutes méthodes). Chaque course a une charge (TSS) selon sa distance
   et l'engagement (à fond, sans forcer, à la cool, en footing) : retranchée du TSS de sa semaine, avec une récupération à prévoir autour ;
   séances de qualité limitées autour ; la course remplace une séance de sa semaine. Séance « Course » (objectif compris) et échauffement
   d'avant-course, poids des courses pour le cycle automatique, liste de l'étape 3. Chargée après plan.js ; le moteur l'appelle par
   PlanCore.contraintes.competitions. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { $, state, E, fD, fA, moy, aZ, ajoute, plageZ, zt, al, parseDate, fDate, JOUR } = PlanCore;
  const render = () => PlanCore.render();

  // Valeurs valides seulement (anciennes sauvegardes)
  state.courses = Array.isArray(state.courses) ? state.courses.filter(x => x && typeof x.date === 'string' && (x.d === null || Number.isFinite(x.d))) : [];
  state.courses.forEach(x => { if (x.prepa && !x.effort) x.effort = 'sansForcer'; delete x.prepa; }); // ancien choix « sans forcer »

  const COURSES = [[1500, '1 500 m'], [3000, '3 000 m'], [5000, '5 km'], [10000, '10 km'], [15000, '15 km'], [21097, 'Semi-marathon'], [30000, '30 km'], [42195, 'Marathon']];
  const nomCourse = (d) => (COURSES.find(x => x[0] === d) || [d, d >= 1000 ? `${(d / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km` : `${d} m`])[1];

  // Compétitions intermédiaires (hypothèses de conception) : leur charge TSS = durée (h) × IF² × 100 (IF = allure de course / allure 1 h),
  // cumulée si plusieurs courses tombent la même semaine, se retranche du TSS de la semaine fixé par le cycle (charge constante, ou
  // charge / décharge) : le plan garde le rythme du cycle. DETTE : part du TSS des courses à récupérer la veille (semaine précédente),
  // puis les deux semaines suivantes ; les semaines de décharge ou d'affûtage, déjà allégées, en absorbent une partie.
  // q : nombre maximal de séances de qualité sur la veille, la semaine des courses et les deux suivantes (les courses remplacent la sortie
  // longue, et des footings s'il y en a plusieurs).
  const ABSORBE_ZONE = 0.5; // part maximale du temps d'une zone que les autres semaines peuvent céder à une compétition qui dépasse le temps prévu
  // Course à fond : impact physiologique maximal, compté comme un surplus de TSS (hypothèse) qui s'ajoute au TSS de la course pour le volume
  // de la semaine et la récupération (le niveau léger / modéré / fort reste celui de la course elle-même)
  const SURPLUS_FOND = 0.5; // + 50 % du TSS de la course
  const DETTE = [0.25, 0, 0.5, 0.25], PLANCHER_TSS = 0.3; // le TSS d'entraînement d'une semaine ne descend pas sous 30 % de sa cible
  const NIVEAUX_COURSE = [
    { nom: 'légère', tss: 55, q: [Infinity, 1, 1, Infinity], resume: 'une séance de qualité au plus la semaine de la course et la suivante' },
    { nom: 'modérée', tss: 110, q: [Infinity, 0, 0, Infinity], resume: 'pas de séance de qualité la semaine de la course et la suivante' },
    { nom: 'forte', tss: Infinity, q: [Infinity, 0, 0, 1], resume: 'pas de séance de qualité la semaine de la course et la suivante, une seule la semaine d\'après' }];
  const niveauTss = (tss) => NIVEAUX_COURSE.find(n => tss < n.tss);
  // Engagement dans une compétition intermédiaire (hypothèses) : à fond (allure prédite), sans forcer (−10 % de vitesse), à la cool (−20 %),
  // ou en footing (allure du milieu de la Z2, jamais plus vite que l'allure prédite). Durée = distance / vitesse, IF plus bas, donc TSS et
  // zone recalculés ; une course en footing ne limite pas les séances de qualité autour d'elle.
  const ENGAGEMENTS = { fond: { nom: 'À fond', k: 1, suffixe: '' }, sansForcer: { nom: 'Sans forcer (−10 %)', k: 0.9, suffixe: ' sans forcer' },
    cool: { nom: 'À la cool (−20 %)', k: 0.8, suffixe: ' à la cool' }, footing: { nom: 'En footing (Z2)', k: 0.75, suffixe: ' en footing' } };
  const engagement = (x) => ENGAGEMENTS[x.effort] || ENGAGEMENTS.fond;
  const nomCompet = (x) => `${nomCourse(x.d)}${engagement(x).suffixe}`;
  /** Prédiction d'une compétition (d mètres) selon l'engagement : facteur de vitesse k (footing : milieu de la Z2 / vitesse prédite) ; null sans profil */
  function predCourse(c, d, effort) {
    const p = c.profil && E.tablePredictions(c.profil, [d])[0];
    if (!p || !Number.isFinite(p.temps)) return null;
    const v = p.vitesseKmh * 1000 / 60, k = effort === 'footing' ? Math.min(1, 1000 / moy([c.zones.Z2.allureRapide, c.zones.Z2.allureLente]) / v) : engagement({ effort }).k;
    return { k, temps: p.temps / k, allure: p.allureMinKm / k, pct: k * v / c.vRef * 100, IF: k * v / c.vRef };
  }
  function tssCourse(c, d, effort) {
    const p = predCourse(c, d, effort);
    return p ? p.temps / 60 * p.IF ** 2 * 100 : d / 1000 * 6 * engagement({ effort }).k; // sans profil : estimation par la distance
  }
  /** Course intermédiaire sous la forme du contexte attendu par course() : chrono, allure et zone selon l'engagement */
  function contexteCourse(c, d, effort) {
    const p = predCourse(c, d, effort), x = { ...c, dist: d, label: nomCompet({ d, effort }), nomObj: nomCourse(d).toLowerCase(), tObj: d / (10000 / 60) / engagement({ effort }).k };
    if (!p) return { ...x, profil: null };
    return { ...x, tObj: p.temps, allureObj: p.allure, zoneObj: (Object.values(c.zones).find(z => p.pct < (z.pMax ?? Infinity)) || c.zones.Z6).id };
  }  /** Applique les compétitions intermédiaires aux semaines : volume, séances de qualité maximales, notes et courses (plusieurs par semaine
      possibles, la charge est cumulée) ; renvoie les alertes */
  function appliquerCompetitions(sem, c, h) {
    const alertes = [], parSemaine = {};
    state.courses.forEach(({ date, d, effort }) => {
      const t = parseDate(date);
      if (!(d > 0)) { alertes.push(`Compétition du ${Number.isNaN(t) ? 'jour non précisé' : fDate(t)} : distance invalide, ignorée.`); return; }
      if (Number.isNaN(t)) { alertes.push(`Compétition sans date (${nomCourse(d)}) : ignorée.`); return; }
      if (t < h.d0 || t >= h.d1) { alertes.push(`La compétition du ${fDate(t)} (${nomCourse(d)}) est en dehors du plan (entre le début et la veille de l'objectif) : ignorée.`); return; }
      (parSemaine[Math.floor((t - h.d0) / (7 * JOUR))] ||= []).push({ d, t, effort: ENGAGEMENTS[effort] ? effort : 'fond' });
    });
    Object.entries(parSemaine).forEach(([k, liste]) => {
      const i = +k, courses = liste.sort((x, y) => x.t - y.t), tss = courses.reduce((a, x) => a + tssCourse(c, x.d, x.effort), 0), n = niveauTss(tss);
      const noms = courses.map(nomCompet).join(' + '), quand = courses.map(x => `${nomCompet(x)} le ${fDate(x.t, true)}`).join(', ');
      const surplus = courses.filter(x => x.effort === 'fond').reduce((a, x) => a + SURPLUS_FOND * tssCourse(c, x.d, x.effort), 0), total = tss + surplus;
      const charge = `TSS ≈ ${Math.round(tss)}${surplus ? ` + ${Math.round(surplus)} (à fond)` : ''}`;
      [-1, 0, 1, 2].forEach((o, j) => {
        const w = sem[i + o];
        if (!w || (o !== 0 && DETTE[j] === 0 && n.q[j] === Infinity)) return;
        w.dette = (w.dette || 0) + DETTE[j] * total; // TSS à récupérer cette semaine (veille ou suites des courses)
        // courses toutes en footing : pas de limite de qualité (seul leur TSS compte)
        w.qMax = Math.min(w.qMax ?? Infinity, courses.every(x => x.effort === 'footing') ? Infinity : courses.length > 1 && o === 0 ? 0 : n.q[j]);
        const sansQ = w.qMax === 0 ? ', pas de séance de qualité' : '';
        (w.notes = w.notes || []).push([`Veille de la compétition du ${fDate(courses[0].t)} (${noms}, ${charge}) : volume allégé pour garder de la fraîcheur.`,
          `Compétition${courses.length > 1 ? 's' : ''} : ${quand} (charge ${n.nom}${courses.length > 1 ? ' au total' : ''}, ${charge}) : le TSS ${courses.length > 1 ? 'des courses' : 'de la course'} est retranché du TSS de la semaine${sansQ}, ${courses.length > 1 ? `les courses remplacent ${c.regles && c.regles.sansSortieLongue ? 'des séances faciles' : 'la sortie longue et des footings'}` : `la course remplace ${c.regles && c.regles.sansSortieLongue ? 'une séance facile' : 'la sortie longue'}`}.`,
          `Récupération après ${noms} (${charge}) : volume réduit${sansQ}.`, `Reprise progressive après ${noms}.`][j]);
        if (o === 0) { w.courses = courses; w.tssCourses = total; w.surplus = surplus; w.etiquette = `Compétition${courses.length > 1 ? 's' : ''} ${noms}`; }
      });
    });
    return alertes;
  }

  // Échauffement avant une compétition, en Z2, selon la zone de la course : Z6 30 min, Z5 20 min, Z4 15 min, Z3 10 min, aucun en Z1 et Z2 (course en footing
  // comprise). Il s'ajoute au volume de la semaine ; aucune récupération (retour au calme, footing de récupération) n'est prévue le jour d'une compétition.
  const ECHAUFFEMENT_COURSE = { Z3: 10, Z4: 15, Z5: 20, Z6: 30 };
  const echCourse = (c) => ECHAUFFEMENT_COURSE[c.zoneObj] || 0;
  const course = (c) => {
    const ech = echCourse(c);
    return { nom: 'Course', zone: c.zoneObj, duree: c.tObj + ech, travail: 0, km: c.dist / 1000 + (ech && c.profil ? ech / aZ(c, 'Z2') : 0),
      parts: ech ? ajoute({ Z2: ech }, { [c.zoneObj]: c.tObj }) : { [c.zoneObj]: c.tObj },
      etapes: [...(ech ? [{ t: 'echauffement', duree: ech, allure: plageZ(c, 'Z2') }] : []), { t: 'effort', duree: c.tObj, allure: c.profil && [c.allureObj * 0.99, c.allureObj * 1.01], nom: c.label }],
      texte: `${ech ? `Échauffement ${ech} min en ${zt(c, 'Z2')}, puis ` : ''}${c.label}${c.profil ? ` : objectif ≈ ${E.formatTemps(c.tObj)}, ${al(c, 'obj')}` : ''}.${ech ? '' : ' Échauffement léger avant le départ.'} Pas de récupération ce jour-là.` };
  };

  /** Cycle automatique : poids des compétitions notables par semaine (charge légère 1, modérée 2, forte 3 ; courses en footing exclues) */
  const poids = (c, h) => {
    const poids = {};
    const parSemaine = {};
    state.courses.forEach(({ date, d, effort }) => {
      const t = parseDate(date);
      if (!(d > 0) || Number.isNaN(t) || t < h.d0 || t >= h.d1 || effort === 'footing') return;
      (parSemaine[Math.floor((t - h.d0) / (7 * JOUR))] ||= []).push(tssCourse(c, d, effort));
    });
    Object.entries(parSemaine).forEach(([i, l]) => { poids[i] = NIVEAUX_COURSE.indexOf(niveauTss(l.reduce((a, x) => a + x, 0))) + 1; });
    return poids;
  };
  /** Liste des compétitions de l'étape 3 (date, épreuve, engagement, charge) */
  const afficher = (c) => {
    $('pl-courses').innerHTML = state.courses.map((x, i) => {
      const tss = x.d > 0 && tssCourse(c, x.d, x.effort), n = tss && niveauTss(tss), cx = x.d > 0 && contexteCourse(c, x.d, x.effort);
      const detail = cx && cx.profil ? `≈ ${E.formatTemps(cx.tObj)} (${fA(cx.allureObj)}, ${cx.zoneObj}), ` : '';
      return `<div class="ligne-course${x.perso && !(x.d > 0) ? ' invalide' : ''}" data-i="${i}">
        <input type="date" value="${x.date}" aria-label="Date de la compétition">
        <div class="rang"><select class="epreuve" aria-label="Épreuve">${COURSES.map(([d, nom]) => `<option value="${d}"${!x.perso && d === x.d ? ' selected' : ''}>${nom}</option>`).join('')}<option value="perso"${x.perso ? ' selected' : ''}>Autre distance…</option></select>
        ${x.perso ? `<input class="dist" value="${x.txt || ''}" placeholder="ex. 8 km ou 12000" aria-label="Distance de la compétition" autocomplete="off">` : ''}</div>
        <select class="effort" aria-label="Engagement dans la course">${Object.entries(ENGAGEMENTS).map(([k, e]) => `<option value="${k}"${engagement(x) === e ? ' selected' : ''}>${e.nom}</option>`).join('')}</select>
        <button type="button" class="suppr" aria-label="Supprimer cette compétition">✕</button>
        ${n ? `<span class="conv">${nomCompet(x)} : ${detail}TSS ≈ ${Math.round(tss)}${engagement(x) === ENGAGEMENTS.fond ? ` + ${Math.round(SURPLUS_FOND * tss)} (à fond, + 50 %)` : ''}, ${x.effort === 'footing' ? 'compte comme un footing : seul son TSS est retranché, sans limite de séances de qualité' : `charge ${n.nom} (${n.resume})`}.</span>` : ''}</div>`;
    }).join('');
  };

  $('pl-addCourse').addEventListener('click', () => { state.courses.push({ date: '', d: 10000, perso: false, txt: '', effort: 'fond' }); render(); });
  $('pl-courses').addEventListener('change', e => {
    const ligne = e.target.closest('[data-i]'), x = ligne && state.courses[+ligne.dataset.i];
    if (!x) return;
    const v = e.target.value;
    if (e.target.type === 'date') x.date = v;
    else if (e.target.classList.contains('effort')) x.effort = v; // engagement : à fond, sans forcer, à la cool, en footing
    else if (e.target.tagName === 'SELECT') { x.perso = v === 'perso'; x.d = x.perso ? (E.parseDistance(x.txt) > 0 ? E.parseDistance(x.txt) : null) : +v; }
    else { x.txt = v; x.d = E.parseDistance(v) > 0 ? E.parseDistance(v) : null; } // distance personnalisée (5000, 8 km, semi…)
    render();
  });
  $('pl-courses').addEventListener('click', e => {
    const b = e.target.closest('.suppr');
    if (b) { state.courses.splice(+b.closest('[data-i]').dataset.i, 1); render(); }
  });

  PlanCore.contrainte('competitions', { appliquer: appliquerCompetitions, contexte: contexteCourse, seance: course, echauffement: echCourse, poids, afficher,
    PLANCHER_TSS, ABSORBE_ZONE });
})();
