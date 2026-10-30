/* Contrainte : volume saisi cible, maxi ou mini (étape 2, toutes méthodes). Cible : moyenne des semaines de charge ; maxi : la semaine la
   plus chargée (compétitions comprises) vaut ce volume ; mini : la semaine de charge la plus légère vaut ce volume. Tout le cycle est décalé
   d'autant. Chargée après plan.js ; le moteur l'appelle par PlanCore.contraintes.volume. */
(function () {
  'use strict';
  const PlanCore = window.PlanCore;
  const { $, state } = PlanCore;
  const render = () => PlanCore.render();

  if (!['max', 'min'].includes(state.volType)) state.volType = 'cible'; // volume saisi : cible, maxi ou mini

  /** Facteurs de volume des semaines du calendrier décalés selon le type de volume (sem : semaines { type, facteur }) */
  const ajuster = (sem, c) => {
    // Volume saisi : cible (moyenne des semaines de charge, tel quel), maxi (la semaine la plus chargée vaut le volume) ou mini (la semaine de
    // charge la plus légère vaut le volume) ; tout le cycle est décalé d'autant, décharge et affûtage compris (ils restent allégés)
    const charges = sem.filter(w => w.type === 'Charge').map(w => w.facteur);
    // marge de 5 min (pas d'arrondi des séances) pour que le volume réel respecte bien le maxi ou le mini
    const marge = c.heures > 0 ? 5 / (c.heures * 60) : 0;
    const kVol = state.volType === 'max' && sem.length ? (1 - marge) / Math.max(...sem.map(w => w.facteur)) : state.volType === 'min' && charges.length ? (1 + marge) / Math.min(...charges) : 1;
    sem.forEach(w => { w.facteur *= kVol; });
  };
  /** Facteur effectif d'une semaine (fEff) : en volume maxi, les compétitions comprises, la semaine ne dépasse pas le volume saisi */
  const plafond = (fEff, tCourses, c) => {
    if (state.volType === 'max' && c.heures > 0) fEff = Math.min(fEff, Math.max(0, 1 - (tCourses + 5) / (c.heures * 60)));
    return fEff;
  };
  /** Texte des alertes : le volume de référence, maxi ou mini */
  const ref = () => ({ max: 'le volume maxi', min: 'le volume mini' }[state.volType] || 'le volume de référence');
  /** Cases de l'étape 2 */
  const afficher = () => {
    $('pl-volMax').checked = state.volType === 'max';
    $('pl-volMin').checked = state.volType === 'min';
  };

  // Volume maxi / mini : cases exclusives (aucune cochée : volume cible)
  [['max', 'pl-volMax'], ['min', 'pl-volMin']].forEach(([t, id]) => $(id).addEventListener('change', e => { state.volType = e.target.checked ? t : 'cible'; render(); }));

  PlanCore.contrainte('volume', { ajuster, plafond, ref, afficher });
})();
