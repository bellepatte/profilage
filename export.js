/* Export du plan affiché (window.Plan.donnees()) : PDF (impression du navigateur), CSV, Excel (.xlsx), JSON et entraînements
   structurés pour montres (fichiers FIT de type « workout », réunis dans une archive .zip). Sans dépendance : archive ZIP sans
   compression, classeur Office Open XML minimal, fichiers FIT écrits octet par octet (protocole FIT 1.0). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();

  /* ---------- Octets ---------- */

  /** Tableau d'octets écrit en petit-boutiste : f reçoit { u8, u16, u32, bytes } */
  function octets(f) {
    const b = [], w = { u8: v => b.push(v & 255), u16: v => b.push(v & 255, (v >>> 8) & 255), bytes: a => { for (const x of a) b.push(x); } };
    w.u32 = v => { w.u16(v & 0xFFFF); w.u16(v >>> 16); };
    f(w);
    return Uint8Array.from(b);
  }
  const concat = (l) => { const r = new Uint8Array(l.reduce((a, x) => a + x.length, 0)); let o = 0; for (const x of l) { r.set(x, o); o += x.length; } return r; };

  /* ---------- ZIP (sans compression) ---------- */

  const TABLE_CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = TABLE_CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  /** Archive ZIP « stockée » : fichiers [{ nom, donnees (Uint8Array) }], noms en UTF-8 */
  function zip(fichiers) {
    const d = new Date(), heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const corps = [], central = [];
    let offset = 0;
    for (const f of fichiers) {
      const nom = enc.encode(f.nom), crc = crc32(f.donnees), n = f.donnees.length;
      const commun = (w) => { w.u16(0x0800); w.u16(0); w.u16(heure); w.u16(date); w.u32(crc); w.u32(n); w.u32(n); w.u16(nom.length); w.u16(0); };
      const tete = octets(w => { w.u32(0x04034b50); w.u16(20); commun(w); w.bytes(nom); });
      central.push(octets(w => { w.u32(0x02014b50); w.u16(20); w.u16(20); commun(w); w.u16(0); w.u16(0); w.u16(0); w.u32(0); w.u32(offset); w.bytes(nom); }));
      corps.push(tete, f.donnees);
      offset += tete.length + n;
    }
    const taille = central.reduce((a, x) => a + x.length, 0);
    const fin = octets(w => { w.u32(0x06054b50); w.u16(0); w.u16(0); w.u16(fichiers.length); w.u16(fichiers.length); w.u32(taille); w.u32(offset); w.u16(0); });
    return concat([...corps, ...central, fin]);
  }

  /* ---------- Tableaux (CSV, Excel) ---------- */

  const ENTETE = ['Semaine', 'Type', 'Phase', 'Jour', 'Date', 'Moment', 'Séance', 'Zone', 'Durée (min)', 'Distance (km)', 'Description'];
  const lignes = (d) => d.semaines.flatMap(s => s.jours.flatMap(j => j.seances.map(x =>
    [s.numero, s.type, s.phase, j.jour, j.date || '', x.moment, x.nom, x.zone, x.dureeMin, x.km, x.description])));
  const allure = (m) => (m === null ? '' : `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')} /km`);
  const parametres = (d) => [['Plan', d.titre], ['Allure', d.contexte.allure], ['Allure (min/km)', allure(d.contexte.allureMinKm)],
    ['Volume (h / semaine)', Math.round(d.contexte.volumeH * 10) / 10], ['Jours de course', d.contexte.jours], ['Doublés', d.contexte.doubles],
    ['Semaines', d.contexte.semaines], ['Cycle', d.contexte.cycle], ['Difficulté (1re semaine)', `${d.contexte.difficulte}/10`]];

  /** CSV pour Excel en français : séparateur « ; », virgule décimale, UTF-8 avec BOM */
  function csv(d) {
    const champ = (v) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '﻿' + [ENTETE, ...lignes(d)].map(l => l.map(champ).join(';')).join('\r\n') + '\r\n';
  }

  /** Classeur .xlsx minimal (chaînes en ligne, sans styles) : feuilles Plan, Répartition, Paramètres */
  function xlsx(d) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const col = (i) => (i >= 26 ? col(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
    const feuille = (rows) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${
      rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => (v === null || v === undefined || v === '' ? ''
        : typeof v === 'number' ? `<c r="${col(j)}${i + 1}"><v>${v}</v></c>`
        : `<c r="${col(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`)).join('')}</row>`).join('')}</sheetData></worksheet>`;
    const feuilles = [['Plan', [ENTETE, ...lignes(d)]], ['Répartition', [['Zone', 'Répartition visée (%)', 'Plan (%)'], ...d.repartition.map(r => [r.zone, r.cible, r.plan])]],
      ['Paramètres', parametres(d)]];
    const xml = (s) => enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
    const NS = 'http://schemas.openxmlformats.org', REL = `${NS}/officeDocument/2006/relationships`;
    return zip([
      { nom: '[Content_Types].xml', donnees: xml(`<Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${
        feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) },
      { nom: '_rels/.rels', donnees: xml(`<Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
      { nom: 'xl/workbook.xml', donnees: xml(`<workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>${feuilles.map(([n], i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
      { nom: 'xl/_rels/workbook.xml.rels', donnees: xml(`<Relationships xmlns="${NS}/package/2006/relationships">${feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`) },
      ...feuilles.map(([, rows], i) => ({ nom: `xl/worksheets/sheet${i + 1}.xml`, donnees: enc.encode(feuille(rows)) }))
    ]);
  }

  /* ---------- FIT (entraînements structurés pour montres) ---------- */

  const CRC_FIT = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
  function crcFit(b) {
    let crc = 0;
    for (const x of b) for (const q of [x & 0xF, (x >> 4) & 0xF]) { const t = CRC_FIT[crc & 0xF]; crc = ((crc >> 4) & 0x0FFF) ^ t ^ CRC_FIT[q]; }
    return crc;
  }
  // Intensité des étapes (énumération FIT intensity) : 0 active, 1 repos, 2 échauffement, 3 retour au calme
  const INTENSITE = { effort: 0, footing: 0, recup: 1, echauffement: 2, retour: 3 };
  const NOM_ETAPE = { effort: 'Effort', footing: 'Footing', recup: 'Récupération', echauffement: 'Échauffement', retour: 'Retour au calme' };
  const NOM_FIT = 32, NOM_PAS = 24; // tailles des champs texte (octets, zéro final compris)
  /** Étapes à plat : une répétition devient ses étapes suivies d'une étape « répéter depuis l'étape debut, n fois » */
  const aplatir = (etapes, out = []) => {
    for (const e of etapes) {
      if (e.rep) { const debut = out.length; aplatir(e.etapes, out); out.push({ repete: true, debut, n: e.rep }); } else out.push(e);
    }
    return out;
  };
  /** Fichier FIT « workout » : file_id, workout, puis une étape workout_step par étape (durée en temps, cible d'allure en vitesse) */
  function fit(nom, etapes) {
    const pas = aplatir(etapes);
    const texte = (w, s, n) => { // UTF-8 tronqué sans couper un caractère, complété par des zéros
      const e = enc.encode(s);
      let k = Math.min(e.length, n - 1);
      while (k > 0 && (e[k] & 0xC0) === 0x80) k--;
      for (let i = 0; i < n; i++) w.u8(i < k ? e[i] : 0);
    };
    const def = (w, local, global, champs) => { w.u8(0x40 | local); w.u8(0); w.u8(0); w.u16(global); w.u8(champs.length); champs.forEach(([n, t, b]) => { w.u8(n); w.u8(t); w.u8(b); }); };
    const vitesse = (m) => Math.round(1e6 / (m * 60)); // allure (min/km) → mm/s
    const donnees = octets(w => {
      def(w, 0, 0, [[0, 1, 0x00], [1, 2, 0x84], [2, 2, 0x84], [3, 4, 0x8C], [4, 4, 0x86]]); // file_id
      w.u8(0); w.u8(5); w.u16(255); w.u16(0); w.u32((Math.random() * 0xFFFFFFFE + 1) >>> 0); w.u32(Math.round(Date.now() / 1000) - 631065600);
      def(w, 1, 26, [[4, 1, 0x00], [6, 2, 0x84], [8, NOM_FIT, 0x07]]); // workout : course à pied
      w.u8(1); w.u8(1); w.u16(pas.length); texte(w, nom, NOM_FIT);
      def(w, 2, 27, [[254, 2, 0x84], [0, NOM_PAS, 0x07], [1, 1, 0x00], [2, 4, 0x86], [3, 1, 0x00], [4, 4, 0x86], [5, 4, 0x86], [6, 4, 0x86], [7, 1, 0x00]]); // workout_step
      pas.forEach((e, i) => {
        w.u8(2); w.u16(i);
        if (e.repete) { texte(w, '', NOM_PAS); w.u8(6); w.u32(e.debut); w.u8(0xFF); w.u32(e.n); w.u32(0); w.u32(0); w.u8(0xFF); return; }
        const a = e.allure;
        texte(w, e.nom || NOM_ETAPE[e.t], NOM_PAS); w.u8(0); w.u32(Math.round(e.duree * 60000));
        w.u8(a ? 0 : 2); w.u32(0); w.u32(a ? vitesse(a[1]) : 0); w.u32(a ? vitesse(a[0]) : 0); w.u8(INTENSITE[e.t] ?? 0);
      });
    });
    const tete = octets(w => { w.u8(14); w.u8(0x10); w.u16(2100); w.u32(donnees.length); w.bytes(enc.encode('.FIT')); });
    const avecCrc = concat([tete, octets(w => w.u16(crcFit(tete))), donnees]);
    return concat([avecCrc, octets(w => w.u16(crcFit(avecCrc)))]);
  }
  /** Une séance par fichier FIT, nommés dans l'ordre du plan : S01-J2-a-seuil.fit (plan par date : 2026-11-04-a-seuil.fit) */
  function montres(d) {
    const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 30);
    return zip(d.semaines.flatMap(s => s.jours.flatMap(j => j.seances.map((x, k) => ({
      nom: `${j.date || `S${String(s.numero).padStart(2, '0')}-J${j.jour}`}${j.seances.length > 1 ? '-' + 'ab'[k] : ''}-${ascii(x.nom)}.fit`,
      donnees: fit(`S${s.numero}J${j.jour}${j.seances.length > 1 ? 'ab'[k] : ''} ${x.nom}`, x.etapes) })))));
  }

  /* ---------- Téléchargement et impression ---------- */

  function telecharger(nom, contenu, type) {
    const url = URL.createObjectURL(new Blob([contenu], { type })), a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const FORMATS = {
    csv: d => ['csv', csv(d), 'text/csv;charset=utf-8'],
    xlsx: d => ['xlsx', xlsx(d), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    json: d => ['json', JSON.stringify(d, null, 2), 'application/json'],
    fit: d => ['fit.zip', montres(d), 'application/zip']
  };

  // Impression (PDF) : semaines dépliées et titre d'impression le temps de l'impression, puis état d'origine
  let ouverts = [];
  window.addEventListener('beforeprint', () => {
    const d = window.Plan.donnees();
    if (d) $('impression-titre').textContent = `${d.titre} · ${d.contexte.allure} · ${d.contexte.semaines} semaines · ${d.contexte.jours} jours par semaine`;
    ouverts = [...document.querySelectorAll('#vue-entrainement details')].map(x => [x, x.open]);
    ouverts.forEach(([x]) => { x.open = true; });
  });
  window.addEventListener('afterprint', () => ouverts.forEach(([x, o]) => { x.open = o; }));

  $('pl-export').addEventListener('click', e => {
    const b = e.target.closest('[data-format]'), d = window.Plan.donnees();
    if (!b || !d) return;
    if (b.dataset.format === 'pdf') { window.print(); return; }
    const [ext, contenu, type] = FORMATS[b.dataset.format](d);
    telecharger(`plan-entrainement-${new Date().toISOString().slice(0, 10)}.${ext}`, contenu, type);
  });

  window.Export = { csv, xlsx, fit, montres, zip }; // pour les tests (Node)
})();
