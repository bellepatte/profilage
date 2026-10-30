/* Contrainte : séances du club (cases de l'étape 2, toutes méthodes) : lundi, séance de PPG dont footing ; jeudi, séance piste (compte
   comme une séance de qualité). Elles gardent leur jour, comptent dans le volume et sont déduites de la répartition par zone ; une méthode
   qui le demande (regles.filtreClub) les écarte une semaine si elles n'y tiennent pas. Chargée après plan.js ; le moteur l'appelle par
   PlanCore.contraintes.club. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { $, state, fD, fA, zt, aZ, plageZ, parseDate, fDate, JOUR, horizon } = PlanCore;
  const render = () => PlanCore.render();

  // Séances du club (cases à cocher de l'étape 2), chaque semaine si compatibles avec le plan (voir clubsSemaine dans construire) : lundi, « séance de PPG dont footing », comptée comme 40 min
  // en Z2 pour la charge ; jeudi, « séance piste », de charge moyenne équivalente à 1 h en Z2 + 15 min à VMA (compte comme une séance de qualité).
  // Elles comptent dans le volume, occupent un jour de course et, par le jeudi, une séance de qualité.
  const CLUB = [{ id: 'club1', jour: 'lundi', dow: 1, duree: 40, parts: { Z2: 40 }, travail: 0 },
    { id: 'club2', jour: 'jeudi', dow: 4, duree: 75, parts: { Z2: 60, Z5: 15 }, travail: 15 }];
  const clubsActifs = () => CLUB.filter(k => state[k.id]);
  const seanceClub = (k, c) => (k.id === 'club1'
    ? { nom: 'Séance de PPG dont footing (club, lundi)', zone: 'Z2', duree: 40, travail: 0, km: c.profil ? 40 / aZ(c, 'Z2') : null, parts: { Z2: 40 }, club: true,
      etapes: [{ t: 'footing', duree: 40, allure: plageZ(c, 'Z2') }],
      texte: 'Séance de PPG (préparation physique générale) dont footing, au club : comptée comme 40 min en Z2 pour la charge (distance estimée à l\'allure moyenne de Z2).' }
    : { nom: 'Séance piste (club, jeudi)', zone: 'Z5', duree: 75, travail: 15, qualite: true, effort: 15, km: c.profil ? 60 / aZ(c, 'Z2') + 15 / (1000 / c.profil.V) : null, parts: { Z2: 60, Z5: 15 }, club: true,
      etapes: [{ t: 'footing', duree: 60, allure: plageZ(c, 'Z2') }, { t: 'effort', duree: 15, allure: c.profil && [1000 / c.profil.V * 0.99, 1000 / c.profil.V * 1.01], nom: 'Z5, équivalent à 15 min à VMA' }],
      texte: `Séance piste au club, de charge moyenne équivalente à ${fD(60)} en ${zt(c, 'Z2')} plus 15 min à VMA${c.profil ? ` (${fA(1000 / c.profil.V)})` : ''} (distance estimée sur cette base).` });

  /** Séances du club compatibles avec la semaine : si la méthode le demande (regles.filtreClub), une séance n'est intégrée que si son temps en Z2
      tient dans le temps prévu en Z1 + Z2 et son temps en Z5 dans le temps prévu en Z5 (avec les autres séances du club de la semaine) ; sinon
      elle est écartée (remplacée par une séance du plan, avec une note). Sans filtre, les séances du club sont gardées chaque semaine. */
  const semaine = (clubs, vol, parts, filtre) => {
    if (!filtre) return { clubs, ecartees: [] };
    const ok = [], ecartees = [];
    for (const k of clubs) {
      const tz = (z) => [...ok, k].reduce((a, x) => a + (x.parts[z] || 0), 0), dispo12 = vol * (parts[0] + parts[1]), dispo5 = vol * parts[4];
      const motif = tz('Z2') > dispo12 + 0.01 ? `son temps en Z2 (${fD(tz('Z2'))} avec le club) dépasse le temps prévu en Z1 + Z2 (${fD(dispo12)})`
        : tz('Z5') > dispo5 + 0.01 ? `son temps en Z5 (${fD(tz('Z5'))}) dépasse le temps prévu en Z5 (${fD(dispo5)})` : null;
      if (motif) ecartees.push({ k, motif }); else ok.push(k);
    }
    return { clubs: ok, ecartees };
  };
  /** Parts par zone du reste de la semaine : le temps du club en Z2 et en Z5 est déduit de la répartition, le reliquat va en Z2 */
  const horsClub = (parts, vol, clubs) => {
    const nClub = clubs.length, clubT = clubs.reduce((a, k) => a + k.duree, 0);
    const clubZ = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6'].map(z => clubs.reduce((a, k) => a + (k.parts[z] || 0), 0));
    if (!nClub || vol - clubT <= 0) return parts;
    const p = parts.map((x, k) => Math.max(0, vol * x - clubZ[k]) / (vol - clubT));
    p[1] += 1 - p.reduce((a, x) => a + x, 0);
    return p;
  };
  /** Séances écartées cette semaine : décompte (alertes du plan) et note sous la semaine */
  const noter = (w, ecartees, aClubSem) => {
    ecartees.forEach(({ k, motif }) => {
      aClubSem.ecartees[k.jour] = (aClubSem.ecartees[k.jour] || 0) + 1;
      (w.notes = w.notes || []).push(`La séance du club du ${k.jour} ne peut pas être effectuée cette semaine : ${motif}. Elle est remplacée par une séance du plan.`);
    });
  };
  /** Plan par date : séances du club à leur jour de la semaine (lundi, jeudi) quand il tombe dans la semaine du plan */
  const fixes = (clubs, club, w) => clubs.map((k, m) => { for (let o = 0; o <= Math.round((w.fin - w.debut) / JOUR); o++) { const t = new Date(w.debut); t.setDate(t.getDate() + o); if (t.getDay() === k.dow) return { t: t.getTime(), jour: [club[m]] }; } return null; }).filter(Boolean);
  /** Plan sans dates : lundi en tête, jeudi en 4e jour, avant la sortie longue */
  const inserer = (jours, club, clubs) => club.forEach((x, m) => jours.splice(clubs[m].id === 'club1' ? 0 : Math.min(3, jours.length - 1), 0, [x]));
  /** Alertes d'incohérence liées aux séances du club */
  const alertes = ({ c, clubs, nClub, clubQ, jourLibres, aClubSem, semaines }) => {
    const aClub = [], pl = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
    if (nClub) {
      if (jourLibres === 1) aClub.push(`Les séances du club (${clubs.map(k => k.jour).join(' et ')}) occupent ${nClub} de vos ${state.seances} jours de course : il ne reste qu'un jour libre, donc ni footing ni séance de qualité propres au plan. Ajoutez des jours de course.`);
      Object.entries(aClubSem.ecartees).forEach(([jour, n]) => aClub.push(`La séance du club du ${jour} ne peut pas être effectuée ${pl(n, 'semaine')} (elle ne tient pas dans le temps prévu par la répartition par zone) : elle est remplacée par une séance du plan ces semaines-là, avec une note sous la semaine.`));
      if (aClubSem.sansQualite) aClub.push(`La séance du jeudi tient lieu de séance de qualité (${pl(aClubSem.sansQualite, 'semaine')}) : le plan n'en ajoute pas ces semaines-là, la méthode perd une partie de son principe.`);
      const h = horizon();
      if (clubQ && h.d0) { // séance de qualité du club à moins de 3 jours d'une compétition (hors footing) ou de l'objectif
        const dates = [...state.courses.filter(x => x.d > 0 && x.effort !== 'footing').map(x => parseDate(x.date)), ...(c.course ? [h.d1] : [])].filter(t => Number.isFinite(t) && t >= h.d0 && t <= h.d1);
        const trop = [];
        semaines.forEach(w => { if (w.dates) w.jours.forEach((j, k) => { if (j[0].club && j[0].qualite) { const r = dates.find(t => Math.abs(t - w.dates[k]) < 3 * JOUR); if (r !== undefined) trop.push(`${fDate(w.dates[k], true)} (course le ${fDate(r, true)})`); } }); });
        if (trop.length) aClub.push(`La séance du club du jeudi tombe à moins de 3 jours d'une compétition : ${trop.slice(0, 3).join(', ')}${trop.length > 3 ? '…' : ''}. À alléger ou à sauter.`);
      }
    }
    return aClub;
  };
  /** Cases et note de l'étape 2 */
  const afficher = () => {
    $('pl-clubNote').hidden = !clubsActifs().length;
    $('pl-club1').checked = state.club1;
    $('pl-club2').checked = state.club2;
  };

  ['club1', 'club2'].forEach(k => $(`pl-${k}`).addEventListener('change', e => { state[k] = e.target.checked; render(); }));

  PlanCore.contrainte('club', { actifs: clubsActifs, seance: seanceClub, semaine, horsClub, noter, fixes, inserer, alertes, afficher });
})();
