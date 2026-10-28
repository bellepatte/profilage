/* Sauvegarde des données : tout effacer (avec confirmation), enregistrer dans un fichier, recharger un fichier.
   Les données de l'outil sont dans le stockage du navigateur (localStorage) : saisie (chronos, VMA, profil), balance (objectif,
   volume, répartition), plan (méthode, semaine, durée, compétitions…), et l'affichage (vue, étape).
   Fichier évolutif : { format, version, enregistre, donnees: { saisie, balance, plan }, affichage: { vue, etape } }.
   - version : numéro du format ; un fichier plus ancien est mis à niveau par MIGRATIONS (une fonction par version), un fichier plus
     récent que l'outil est refusé.
   - Champs inconnus ignorés, champs absents remplacés par les valeurs par défaut : chaque module ne lit que les clés qu'il connaît
     et les valide (voir le chargement de state dans balance.js et plan.js, la saisie dans index.html). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const FORMAT = 'profil-endurance', VERSION = 1;
  const DONNEES = ['saisie', 'balance', 'plan'], AFFICHAGE = ['vue', 'etape'];
  // MIGRATIONS[n] : fichier de version n → version n + 1 (à compléter quand le format change ; ex. 1: (f) => { …; return f; })
  const MIGRATIONS = {};

  const lire = (cle) => { try { return localStorage.getItem(cle); } catch (e) { return null; } };
  const json = (cle) => { try { return JSON.parse(lire(cle)); } catch (e) { return null; } };

  /** Fenêtre de confirmation (dialog) : résout true si l'utilisateur confirme */
  function confirmer(titre, texte, bouton) {
    return new Promise((ok) => {
      const d = document.createElement('dialog');
      d.className = 'dlg';
      d.innerHTML = `<div class="dlg-corps"><h2>${titre}</h2><p>${texte}</p></div>
        <div class="dlg-pied"><button type="button" class="lien" data-r="0">Annuler</button><button type="button" class="sec danger" data-r="1">${bouton}</button></div>`;
      document.body.append(d);
      d.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) d.close(b.dataset.r); });
      d.addEventListener('close', () => { ok(d.returnValue === '1'); d.remove(); });
      d.showModal();
      d.querySelector('[data-r="0"]').focus();
    });
  }
  /** Message bref (dialog) */
  function informer(titre, texte) {
    const d = document.createElement('dialog');
    d.className = 'dlg';
    d.innerHTML = `<div class="dlg-corps"><h2>${titre}</h2><p>${texte[0].toUpperCase() + texte.slice(1)}</p></div><div class="dlg-pied"><button type="button" class="sec">OK</button></div>`;
    document.body.append(d);
    d.querySelector('button').addEventListener('click', () => d.close());
    d.addEventListener('close', () => d.remove());
    d.showModal();
  }

  const effacer = () => { [...DONNEES, ...AFFICHAGE].forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* stockage indisponible */ } }); };

  function enregistrer() {
    const f = { format: FORMAT, version: VERSION, enregistre: new Date().toISOString(), application: "Profil d'endurance",
      donnees: Object.fromEntries(DONNEES.map(k => [k, json(k)])), affichage: Object.fromEntries(AFFICHAGE.map(k => [k, lire(k)])) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(f, null, 2)], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = `profil-endurance-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Fichier lu → données au format courant ; lève une erreur au message lisible si le fichier n'est pas utilisable */
  function migrer(f) {
    if (!f || f.format !== FORMAT || !Number.isInteger(f.version) || typeof f.donnees !== 'object' || !f.donnees) throw new Error("ce fichier n'est pas une sauvegarde du Profil d'endurance.");
    if (f.version > VERSION) throw new Error("ce fichier vient d'une version plus récente de l'outil : rechargez la page (Ctrl+F5) pour obtenir la dernière version.");
    for (let v = f.version; v < VERSION; v++) {
      if (!MIGRATIONS[v]) throw new Error(`format ${v} non pris en charge.`);
      f = { ...MIGRATIONS[v](f), version: v + 1 };
    }
    return f;
  }

  async function charger(fichier) {
    let f;
    try { f = migrer(JSON.parse(await fichier.text())); } catch (e) {
      informer('Chargement impossible', e instanceof SyntaxError ? "le fichier n'est pas un fichier JSON lisible." : e.message);
      return;
    }
    const quand = f.enregistre ? ` (enregistrée le ${new Date(f.enregistre).toLocaleDateString('fr-FR')})` : '';
    if (!await confirmer('Charger une sauvegarde ?', `Les données de cette sauvegarde${quand} remplacent toutes vos saisies actuelles (profil et entraînement).`, 'Charger')) return;
    effacer();
    try {
      DONNEES.forEach(k => { if (f.donnees[k] && typeof f.donnees[k] === 'object') localStorage.setItem(k, JSON.stringify(f.donnees[k])); });
      AFFICHAGE.forEach(k => { if (typeof f.affichage?.[k] === 'string') localStorage.setItem(k, f.affichage[k]); });
    } catch (e) { informer('Chargement impossible', 'le stockage du navigateur est indisponible (navigation privée ?).'); return; }
    location.reload(); // chaque module relit et valide ses données au démarrage
  }

  $('donnees-enregistrer').addEventListener('click', enregistrer);
  $('donnees-charger').addEventListener('click', () => $('donnees-fichier').click());
  $('donnees-fichier').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) charger(f); });
  $('donnees-effacer').addEventListener('click', async () => {
    if (!await confirmer('Tout effacer ?', 'Toutes vos saisies sont supprimées : chronos, VMA, profil, objectif, volume, répartition, plan et compétitions. Pensez à les enregistrer avant si vous voulez les garder.', 'Tout effacer')) return;
    effacer();
    location.reload();
  });

  window.Sauvegarde = { migrer, VERSION }; // pour les tests
})();
