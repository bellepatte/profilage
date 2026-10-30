/* Contrainte : travail de nuit (facultatif, plan par date, toutes méthodes). Calendrier des nuits (soirs fixes ou planning tournant) ; le placement évite
   la qualité et la sortie longue (ou le footing long) le lendemain d'une nuit travaillée, et les doublés ces jours-là (reportés sur un autre
   footing ou fondus) ; mentions, alertes, champs de l'étape 2 et pastilles de l'agenda. Chargée après plan.js ; le moteur l'appelle par
   PlanCore.contraintes.nuit. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { $, state, borne, parseDate, fDate, JOUR, fD, ajoute, footing, nbDoubles } = PlanCore;
  const render = () => PlanCore.render();

  { // valeurs par défaut pour les champs absents ou invalides (anciennes sauvegardes)
    const n = state.nuit && typeof state.nuit === 'object' ? state.nuit : {};
    state.nuit = { actif: !!n.actif, mode: n.mode === 'tournant' ? 'tournant' : 'fixe', soirs: Array.from({ length: 7 }, (_, k) => !!(Array.isArray(n.soirs) && n.soirs[k])),
      debut: typeof n.debut === 'string' ? n.debut : '', nuits: Number.isFinite(n.nuits) ? borne(Math.round(n.nuits), 1, 7) : 3, repos: Number.isFinite(n.repos) ? borne(Math.round(n.repos), 1, 14) : 4 };
  }

  // Le manque de sommeil réduit la performance (≈ −7,5 % en moyenne après une nuit courte, Craven et al., Sports Med 2022) ; un adulte
  // a besoin d'au moins 7 h de sommeil (consensus AASM / SRS 2015). Pas de règle chiffrée publiée pour l'entraînement : le plan joue sur
  // le placement, pas sur le volume. Jour de nuit : on part travailler le soir (entraînement possible, plutôt après le sommeil) ; sortie
  // de nuit : le matin qui suit une nuit travaillée (dette de sommeil) : pas de qualité ni de sortie longue si un autre jour le permet.
  /** Calendrier des nuits ({ estNuit(t) }) : nuits fixes (soirs de la semaine, lundi = 0) ou planning tournant (n nuits, r jours de repos) ; null si inactif */
  const suiviNuit = () => {
    const N = state.nuit;
    if (!N.actif || state.horizon !== 'date') return null;
    if (N.mode === 'fixe') return N.soirs.some(Boolean) ? { estNuit: (t) => N.soirs[(new Date(t).getUTCDay() + 6) % 7] } : null;
    const d0 = parseDate(N.debut), P = N.nuits + N.repos;
    return Number.isFinite(d0) ? { estNuit: (t) => ((Math.round((t - d0) / JOUR) % P) + P) % P < N.nuits } : null;
  };
  /** Jour de nuit (départ le soir) et sortie de nuit (lendemain matin d'une nuit travaillée) à la date t */
  const jourNuit = (t, s) => ({ nuit: s.estNuit(t), sortie: s.estNuit(t - JOUR) });
  /** Alertes du travail de nuit : conditions du suivi (plan par date, saisie) */
  function alertesNuit() {
    const N = state.nuit, a = [];
    if (!N.actif) return a;
    if (state.horizon !== 'date') a.push('Travail de nuit : le suivi s\'applique au plan par date (étape 3, durée « Jusqu\'à la date de l\'objectif »).');
    else if (N.mode === 'fixe' && !N.soirs.some(Boolean)) a.push('Travail de nuit : cochez les soirs où vous partez travailler.');
    else if (N.mode === 'tournant' && !Number.isFinite(parseDate(N.debut))) a.push('Travail de nuit : renseignez la date de la première nuit du planning.');
    return a;
  }

  /** Mention sur une séance de qualité restée un lendemain de nuit (pas d'autre créneau) */
  const mention = (t, nuitS) => jourNuit(t, nuitS).sortie && 'Après une nuit de travail : à alléger, ou à faire après une sieste.';
  /** Doublés restés un lendemain de nuit, après le placement : le 2e footing s'ajoute d'abord au footing simple d'un jour de repos (à défaut
      d'un départ en nuit), le plus court, dans la limite de longueur ; sinon le jour est traité par ajusterJour. Renvoie le nombre de doublés reportés */
  const reporterDoubles = (jr, dates, nuitS, c, lim, lim5) => {
    let fondus = 0;
    // Doublé resté un lendemain de nuit : son 2e footing s'ajoute d'abord au footing simple d'un jour de repos (à défaut d'un départ en nuit), le plus court,
    // dans la limite de longueur ; sinon les deux footings du jour sont fondus en un seul (plus bas)
    const rangJ = (i) => { const x = jourNuit(dates[i], nuitS); return x.sortie ? 2 : x.nuit ? 1 : 0; };
    jr.forEach((j, k) => {
      if (rangJ(k) < 2 || j.length < 2 || j.some(x => x.nom === 'Course' || x.club || x.qualite)) return;
      const d2 = j[1].duree;
      const cible = jr.map((_, i) => i).filter(i => i !== k && rangJ(i) < 2 && jr[i].length === 1 && jr[i][0].nom === 'Footing' && jr[i][0].etapes.length === 1 && (!lim || jr[i][0].duree + d2 <= lim5))
        .sort((a, b) => rangJ(a) - rangJ(b) || jr[a][0].duree - jr[b][0].duree)[0];
      if (cible === undefined) return;
      jr[cible] = [footing(jr[cible][0].duree + d2, c)]; jr[k] = [j[0]]; fondus++;
    });
    return fondus;
  };
  /** Jour placé : doublé un lendemain de nuit fondu en un seul footing (pas d'autre jour), ou mention un jour de départ en nuit ; n : jourNuit du jour */
  const ajusterJour = (jj, n, c, lim, lim5) => {
    let fondu = false;
    const double = jj.length > 1 && !jj.some(x => x.nom === 'Course' || x.club);
    // Doublé un lendemain de nuit (pas d'autre jour) : les deux footings deviennent un seul, de même durée totale (dans la limite de longueur)
    if (n && n.sortie && double && jj.every(x => !x.qualite) && (!lim || jj.reduce((a, x) => a + x.duree, 0) <= lim5)) {
      fondu = true;
      const [x0, x1] = jj, tot = x0.duree + x1.duree;
      jj = [x0.etapes.length === 1 ? footing(tot, c, x0.zone === 'Z1' && x1.zone === 'Z1' ? 'Z1' : 'Z2') // deux footings simples : un seul footing
        : { ...x0, duree: tot, km: x0.km === null || x1.km === null ? null : x0.km + x1.km, parts: ajoute(x0.parts, x1.parts), // footing et accélérations : footing allongé
          etapes: [{ ...x0.etapes[0], duree: x0.etapes[0].duree + x1.duree }, ...x0.etapes.slice(1)],
          texte: `${x0.texte} <em>Doublé fondu (lendemain de nuit) : ${fD(x1.duree)} de footing en plus avant les accélérations.</em>` }];
    } else if (n && n.nuit && double) jj = jj.map((x, i) => (i ? { ...x, texte: `${x.texte} <em>Jour de départ en nuit : 2e séance plutôt avant votre sieste.</em>` } : x));
    return { jj, fondu };
  };
  /** Alertes du plan : conditions du suivi, doublés sans jour de repos, doublés fondus, courses et séances de qualité un lendemain de nuit */
  const alertesPlan = ({ s: nuitS, cal, doublesFondus, datesCourses, qSortie }) => {
    const aNuit = alertesNuit();
    if (nuitS && nbDoubles() && cal.length && cal[0].debut) { // plus de doublés demandés que de jours de repos (ni départ en nuit ni lendemain de nuit) dans une semaine
      const repos = cal.map(w => { let n = 0; for (let t = w.debut; t <= w.fin; t += JOUR) { const x = jourNuit(t, nuitS); if (!x.nuit && !x.sortie) n++; } return n; });
      const mini = Math.min(...repos);
      if (nbDoubles() > mini) aNuit.push(`Travail de nuit : ${nbDoubles()} doublé${nbDoubles() > 1 ? 's' : ''} demandé${nbDoubles() > 1 ? 's' : ''}, mais certaines semaines n'ont que ${mini} jour${mini > 1 ? 's' : ''} de repos (ni départ en nuit ni lendemain de nuit) : les doublés en trop vont sur des jours de départ en nuit, ou sont fondus en un seul footing.`);
    }
    if (doublesFondus) aNuit.push(`Après le travail de nuit : ${doublesFondus} doublé${doublesFondus > 1 ? 's' : ''} sur l'ensemble du plan ${doublesFondus > 1 ? 'ont été retirés' : 'a été retiré'} d'un lendemain de nuit (2e footing ajouté à un autre footing ou fondu avec celui du jour, même volume), faute de jour de repos libre pour un doublé. Demandez moins de doublés ou placez vos jours de course sur vos jours de repos.`);
    if (nuitS) datesCourses.filter(t => jourNuit(t, nuitS).sortie).forEach(t => aNuit.push(`Après le travail de nuit : la course du ${fDate(t)} tombe le lendemain d'une nuit travaillée. La date ne se déplace pas : si possible, posez cette nuit ou dormez avant le départ.`));
    if (qSortie) aNuit.push(`Après le travail de nuit : ${qSortie} séance${qSortie > 1 ? 's' : ''} de qualité tombe${qSortie > 1 ? 'nt' : ''} le lendemain d'une nuit travaillée, faute d'autre créneau (mention « à alléger » sur la séance). Réduisez les jours de course ou les séances de qualité les semaines chargées en nuits.`);
    return aNuit;
  };
  /** Pastilles de l'agenda : 🛌 sortie de nuit (lendemain matin), 🌃 nuit de travail le soir */
  const pastille = (t, nuitR) => {
    if (!nuitR) return '';
    const n = jourNuit(t, nuitR);
    return (n.sortie ? '<i class="nuit" title="Sortie de nuit : dette de sommeil, qualité et sortie longue évitées si possible">🛌</i>' : '')
      + (n.nuit ? '<i class="nuit" title="Nuit de travail ce soir">🌃</i>' : '');
  };
  /** Nuit le soir et sortie de nuit pour l'export */
  const infoJour = (t, nuitR) => ({ nuitLeSoir: jourNuit(t, nuitR).nuit, sortieDeNuit: jourNuit(t, nuitR).sortie });
  /** Champs de l'étape 2 */
  const afficher = () => {
    const NT = state.nuit;
    $('pl-nuitActif').checked = NT.actif; $('pl-nuitBloc').hidden = !NT.actif;
    document.querySelectorAll('#pl-nuitMode [data-nmode]').forEach(b => { b.classList.toggle('actif', b.dataset.nmode === NT.mode); b.setAttribute('aria-pressed', b.dataset.nmode === NT.mode); });
    $('pl-nuitFixe').hidden = NT.mode !== 'fixe'; $('pl-nuitTournant').hidden = NT.mode !== 'tournant';
    document.querySelectorAll('#pl-nuitSoirs input').forEach(i => { i.checked = NT.soirs[+i.dataset.k]; });
    $('pl-nuitDebut').value = NT.debut;
    if (document.activeElement !== $('pl-nuitNuits')) $('pl-nuitNuits').value = NT.nuits;
    if (document.activeElement !== $('pl-nuitRepos')) $('pl-nuitRepos').value = NT.repos;
  };

  // Travail de nuit : cases et champs de l'étape 2 (state.nuit)
  $('pl-nuitActif').addEventListener('change', e => { state.nuit.actif = e.target.checked; render(); });
  $('pl-nuitMode').addEventListener('click', e => { const b = e.target.closest('[data-nmode]'); if (b) { state.nuit.mode = b.dataset.nmode; render(); } });
  $('pl-nuitSoirs').addEventListener('change', e => { const k = +e.target.dataset.k; if (k >= 0) { state.nuit.soirs[k] = e.target.checked; render(); } });
  $('pl-nuitDebut').addEventListener('change', e => { state.nuit.debut = e.target.value; render(); });
  [['nuits', 'pl-nuitNuits', 7], ['repos', 'pl-nuitRepos', 14]].forEach(([k, id, max]) => $(id).addEventListener('change', e => {
    const v = Math.round(+e.target.value); if (v >= 1 && v <= max) state.nuit[k] = v; render(); }));

  PlanCore.contrainte('nuit', { suivi: suiviNuit, jour: jourNuit, mention, reporterDoubles, ajusterJour, alertesPlan, pastille, infoJour, afficher });
})();
