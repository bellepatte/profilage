/* Résultats FFA : importe dans « Mes chronos » les performances officielles des 12 derniers mois d'un athlète du club.
   Les données viennent du fichier ffa-resultats.json, produit chaque jour par ffa-collecte.php (cron sur le serveur) : le navigateur ne peut pas
   lire athle.fr directement. Seules les courses avec un niveau (compétitions labellisées) ou du challenge Courses 80 (niveau « C80 »), sur route ou
   piste, de distance reconnue, y figurent.
   L'athlète tape son nom et son prénom (dans n'importe quel ordre) ; une fenêtre liste tous ses chronos, à cocher ; la sélection est envoyée à la
   page par l'événement « ffa-chronos » ({ chronos: [{ distance (m), temps (min) }], athlete }). */
(function () {
  'use strict';
  const URL_DONNEES = 'ffa-resultats.json';
  const MOIS = 12, DUREE_MIN = 5, DUREE_MAX = 300; // fenêtre de recherche (mois) ; plage de validité du modèle d'endurance (min)
  const E = window.Endurance;
  let donnees = null, athletes = [], courant = null, dlg = null;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /** Sans accents ni ponctuation, minuscules : « Jean-Paul DE LA Fuente » → « jean paul de la fuente » */
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const jetons = (s) => norm(s).split(' ').filter(Boolean);
  const nomDist = (m) => (m === 21097 ? 'Semi-marathon' : m === 42195 ? 'Marathon' : m >= 1000 ? `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km` : `${m} m`);
  const fDate = (iso) => iso.split('-').reverse().join('/');
  const fTemps = (s) => E.formatTemps(Math.round(s) / 60);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  /** Date limite des 12 derniers mois (aujourd'hui moins 12 mois, au jour près) */
  const limite = () => { const d = new Date(); d.setMonth(d.getMonth() - MOIS); return iso(d); };
  const ilYa = (dateIso) => {
    const a = new Date(dateIso), n = new Date(), m = (n.getFullYear() - a.getFullYear()) * 12 + n.getMonth() - a.getMonth() - (n.getDate() < a.getDate() ? 1 : 0);
    return m <= 0 ? 'ce mois-ci' : m === 1 ? 'il y a 1 mois' : `il y a ${m} mois`;
  };

  /** Athlètes dont le nom et le prénom contiennent tous les mots saisis (début de mot accepté), quel que soit l'ordre */
  function chercher(saisie) {
    const q = jetons(saisie);
    if (!q.length) return [];
    const parId = new Map();
    for (const r of donnees.resultats) {
      if (!parId.has(r.id)) parId.set(r.id, { id: r.id, nom: r.nom, prenom: r.prenom, resultats: [] });
      parId.get(r.id).resultats.push(r);
    }
    const debut = limite();
    return [...parId.values()].filter((a) => {
      const mots = jetons(`${a.nom} ${a.prenom}`), pris = new Set();
      return q.every((t) => { const i = mots.findIndex((m, k) => !pris.has(k) && m.startsWith(t)); if (i >= 0) pris.add(i); return i >= 0; });
    }).map((a) => ({ ...a, recents: a.resultats.filter((r) => r.date >= debut) }))
      .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
  }

  const chrono = (r) => r.reel ?? r.officiel; // temps retenu : le temps réel (puce) quand il existe, sinon le temps officiel
  const dansPlage = (r) => chrono(r) / 60 >= DUREE_MIN && chrono(r) / 60 <= DUREE_MAX;

  /* ---------- Fenêtre ---------- */

  function creerFenetre() {
    dlg = document.createElement('dialog');
    dlg.id = 'ffa-dialog';
    dlg.setAttribute('aria-labelledby', 'ffa-titre');
    dlg.innerHTML = `<form method="dialog" class="ffa-tete"><h2 id="ffa-titre"><span class="ico" aria-hidden="true">🏅</span>Mes résultats FFA</h2><button class="suppr" aria-label="Fermer">✕</button></form>
      <div class="ffa-corps">
        <form id="ffa-recherche" class="ffa-recherche" novalidate>
          <label>Votre nom et prénom <input id="ffa-nom" autocomplete="off" placeholder="ex. Anaé Robbie" aria-describedby="ffa-etat-donnees"></label>
          <button type="submit" class="sec">Rechercher</button>
        </form>
        <p class="sous" id="ffa-etat-donnees">Chargement des résultats du club…</p>
        <div id="ffa-resultats" aria-live="polite"></div>
      </div>
      <div class="ffa-pied"><span class="sous" id="ffa-compte"></span><button type="button" class="lien" id="ffa-annuler">Annuler</button><button type="button" class="sec" id="ffa-valider" disabled>Intégrer au calcul</button></div>`;
    document.body.append(dlg);
    dlg.querySelector('#ffa-annuler').addEventListener('click', () => dlg.close());
    dlg.querySelector('#ffa-recherche').addEventListener('submit', (e) => { e.preventDefault(); lancer(); });
    dlg.querySelector('#ffa-valider').addEventListener('click', valider);
    dlg.querySelector('#ffa-resultats').addEventListener('change', (e) => {
      const c = e.target.closest('input[type=checkbox]');
      if (!c) return;
      if (c.checked) dlg.querySelectorAll(`input[type=checkbox][data-d="${c.dataset.d}"]`).forEach((o) => { if (o !== c) o.checked = false; }); // un seul chrono par distance
      compter();
    });
    dlg.querySelector('#ffa-resultats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-athlete]');
      if (b) montrer(athletes.find((a) => String(a.id) === b.dataset.athlete));
    });
  }

  async function charger() {
    if (donnees) return true;
    const etat = dlg.querySelector('#ffa-etat-donnees');
    try {
      const r = await fetch(`${URL_DONNEES}?v=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      donnees = await r.json();
      if (!Array.isArray(donnees.resultats)) throw new Error('format');
      etat.textContent = `Données issues de la base de résultats de la FFA (athle.fr) : courses labellisées FFA et courses du challenge Courses 80 des adhérents du club, route et piste. Mise à jour le ${new Date(donnees.genere).toLocaleDateString('fr-FR')} ; recherche sur les ${MOIS} derniers mois.`;
      return true;
    } catch (e) {
      etat.innerHTML = location.protocol === 'file:'
        ? 'Les résultats FFA ne se chargent pas quand la page est ouverte comme un fichier : ouvrez-la depuis le site (serveur web).'
        : 'Les résultats FFA ne sont pas disponibles pour le moment (fichier <code>ffa-resultats.json</code> introuvable ou illisible). Réessayez plus tard.';
      return false;
    }
  }

  function lancer() {
    const zone = dlg.querySelector('#ffa-resultats'), saisie = dlg.querySelector('#ffa-nom').value;
    if (!donnees) return;
    courant = null; compter();
    if (!jetons(saisie).length) { zone.innerHTML = '<p class="erreur">Tapez votre nom et votre prénom.</p>'; return; }
    athletes = chercher(saisie);
    if (!athletes.length) { zone.innerHTML = `<p class="avert">Aucun athlète du club ne correspond à « ${esc(saisie)} ». Vérifiez l'orthographe (l'ordre nom / prénom n'a pas d'importance).</p>`; return; }
    if (athletes.length === 1) return montrer(athletes[0]);
    zone.innerHTML = `<p>Plusieurs athlètes correspondent : choisissez-vous.</p><ul class="ffa-choix">${athletes.map((a) =>
      `<li><button type="button" class="puce" data-athlete="${a.id}">${esc(a.nom)} ${esc(a.prenom)} <span class="sous">· ${a.recents.length} résultat${a.recents.length > 1 ? 's' : ''} sur ${MOIS} mois</span></button></li>`).join('')}</ul>`;
  }

  /** Tableau des chronos de l'athlète, groupés par distance (tous affichés : le plus pertinent dépend du contexte : blessure, course tranquille…) */
  function montrer(a) {
    courant = a;
    const zone = dlg.querySelector('#ffa-resultats');
    if (!a.recents.length) { zone.innerHTML = `<p class="avert">${esc(a.nom)} ${esc(a.prenom)} : aucun résultat labellisé (FFA ou challenge Courses 80, route ou piste) sur les ${MOIS} derniers mois.</p>`; compter(); return; }
    const groupes = new Map();
    for (const r of a.recents) { if (!groupes.has(r.distance)) groupes.set(r.distance, []); groupes.get(r.distance).push(r); }
    const html = [...groupes.entries()].sort((x, y) => x[0] - y[0]).map(([d, liste]) => {
      liste.sort((x, y) => y.date.localeCompare(x.date));
      const utiles = liste.filter(dansPlage), meilleur = utiles.length > 1 ? utiles.reduce((m, r) => (chrono(r) < chrono(m) ? r : m)) : null, recent = liste[0];
      const seul = utiles.length === 1 ? utiles[0] : null; // un seul chrono sur la distance : présélectionné
      return `<tbody><tr class="ffa-groupe"><th colspan="5">${nomDist(d)} <span class="sous">· ${liste.length} résultat${liste.length > 1 ? 's' : ''}</span></th></tr>${liste.map((r) => {
        const ok = dansPlage(r), badges = [r === meilleur ? '🏅 meilleur chrono' : '', liste.length > 1 && r === recent ? '🕒 plus récent' : ''].filter(Boolean).join(' · ');
        const id = `ffa-${r.id}-${r.date}-${r.distance}-${Math.round(r.officiel)}`;
        return `<tr${ok ? '' : ' class="ffa-hors"'}><td><input type="checkbox" id="${id}" data-d="${r.distance}" data-t="${chrono(r)}" data-r="${esc(r.epreuve)}"${ok ? '' : ' disabled'}${r === seul ? ' checked' : ''} aria-label="Intégrer ce chrono"></td>
          <td><label for="${id}"><strong>${fDate(r.date)}</strong> <span class="sous">${ilYa(r.date)}</span></label></td>
          <td>${esc(r.epreuve.split(' / ')[0])}<div class="sous">${esc(r.ville)}${r.rang ? ` · ${r.rang}${r.rang === 1 ? 'er' : 'e'}` : ''}${badges ? ` · ${badges}` : ''}</div></td>
          <td class="num"><strong>${fTemps(chrono(r))}</strong>${r.reel && r.reel !== r.officiel ? `<div class="sous" title="Temps officiel (au pistolet) ; le temps réel, mesuré à la puce, est celui retenu">officiel ${fTemps(r.officiel)}</div>` : ''}${ok ? '' : '<div class="sous">hors plage (5 min – 5 h)</div>'}</td>
          <td>${r.niveau === 'C80' ? '<span class="badge">Courses80</span>' : `<span class="badge" title="Niveau ${esc(r.niveau)}">Label FFA</span>`}</td></tr>`;
      }).join('')}</tbody>`;
    }).join('');
    zone.innerHTML = `<p><strong>${esc(a.nom)} ${esc(a.prenom)}</strong> <span class="sous">· cochez les chronos à intégrer, un seul par distance</span></p>
      <div class="tableau"><table class="ffa-tab">${html}</table></div>
      <p class="sous">Le temps retenu est le temps réel (mesuré à la puce) quand il existe. Choisissez le chrono le plus représentatif de votre forme actuelle : le plus récent, ou le plus abouti, selon votre situation (blessure, course courue tranquillement…).</p>`;
    compter();
  }

  function compter() {
    const n = dlg.querySelectorAll('#ffa-resultats input[type=checkbox]:checked').length;
    dlg.querySelector('#ffa-compte').textContent = n ? `${n} chrono${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''}` : '';
    dlg.querySelector('#ffa-valider').disabled = !n;
  }

  function valider() {
    const chronos = [...dlg.querySelectorAll('#ffa-resultats input[type=checkbox]:checked')].map((c) => ({ distance: Number(c.dataset.d), temps: Number(c.dataset.t) / 60 }));
    if (!chronos.length) return;
    document.dispatchEvent(new CustomEvent('ffa-chronos', { detail: { chronos, athlete: courant ? `${courant.nom} ${courant.prenom}` : '' } }));
    dlg.close();
  }

  async function ouvrir() {
    if (!dlg) creerFenetre();
    dlg.showModal();
    if (await charger()) dlg.querySelector('#ffa-nom').focus();
  }

  window.FFA = { ouvrir, chercher: (s) => (donnees ? chercher(s) : []), norm };
})();
