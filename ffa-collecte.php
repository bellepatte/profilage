<?php
/**
 * Collecte des résultats FFA du club (base athle.fr) pour l'outil « Profil d'endurance ».
 *
 * Lancé de préférence en ligne de commande, typiquement par cron (une fois par jour) ; le lancement par le web est possible avec une clé secrète (CLE_WEB) :
 *     php /chemin/vers/ffa-collecte.php [/chemin/du/fichier-de-sortie.json]
 * Exemple de ligne crontab (tous les jours à 5 h) :
 *     0 5 * * * php /var/www/profil/ffa-collecte.php >> /var/log/ffa-collecte.log 2>&1
 *
 * Le script lit la base de résultats du club (liste complète, sans nom ni prénom), garde sur route ou piste, avec une distance
 * reconnue :
 *   1. les courses qui ont un NIVEAU (compétitions labellisées, donc mesurées et chronométrées selon les règles officielles) ;
 *   2. les courses du CHALLENGE COURSES 80 (https://courses80.fr/archive/ : courses de la Somme, chronométrées à puce selon la
 *      réglementation FFA, distance respectée), même sans niveau dans la base FFA : on relève le nom, la date et la distance
 *      des courses du challenge, puis on les retrouve dans les chronos des adhérents (même date, même distance, même lieu).
 * Il écrit ensuite un fichier JSON lu par l'outil (ffa.js). Rien n'est exécutable depuis le web sans la clé CLE_WEB.
 *
 * Sécurité des données : le fichier ne contient que le nécessaire (identifiant FFA, nom, prénom, épreuve, distance, chrono,
 * niveau, date, ville). En cas d'échec, l'ancien fichier est conservé.
 */

const CLUB = '080072';                     // club « Les Pieds Nicleys », imposé : évite les homonymes
const BASE = 'https://www.athle.fr/bases/liste.aspx';
const PAUSE_S = 1;                         // pause entre deux requêtes, par politesse envers le serveur de la FFA
const DISTANCE_MIN = 800;                  // m
const DISTANCE_MAX = 42195;                // m
const MOIS_FENETRE = 12;                   // seuls les résultats des 12 derniers mois figurent dans le fichier (même fenêtre que ffa.js)
const VITESSE_KMH = [5, 30];               // chronos hors de cette plage : données douteuses, ignorées
const COURSES80_ARCHIVE = 'https://courses80.fr/archive/';
const NIVEAU_COURSES80 = 'C80';            // « niveau » affiché pour les courses du challenge Courses 80 qui n'en ont pas dans la base FFA
// Mots trop courants pour reconnaître une course, et lieux que le nom de la course ne contient pas (nom de course → lieu indiqué par la base FFA)
const MOTS_GENERIQUES = ['course', 'courses', 'corrida', 'trail', 'semi', 'marathon', 'elite', 'open', 'route', 'kms', 'des', 'les', 'aux', 'run', 'running', 'foulees', 'challenge', 'solidaire', 'feminine', 'memorial'];
const LIEUX_COURSES80 = ['saisons' => 'amiens', 'verne' => 'amiens', 'flesselloise' => 'flesselles'];

// Lancement depuis le web (hébergement sans cron en ligne de commande, ou premier essai à la main) : désactivé tant que CLE_WEB est vide.
// Renseignez une longue clé secrète (ex. 32 caractères au hasard), puis ouvrez  https://votre-site/ffa-collecte.php?cle=VOTRE_CLE
// (cette même adresse peut être appelée par une tâche cron « URL » de l'hébergeur). Sans la bonne clé : accès refusé.
const CLE_WEB = 'lpn80';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
    if (CLE_WEB === '' || !isset($_GET['cle']) || !hash_equals(CLE_WEB, (string) $_GET['cle'])) {
        http_response_code(403);
        exit(CLE_WEB === '' ? "Lancement web désactivé : lancez ce script en ligne de commande (cron), ou renseignez CLE_WEB dans le fichier.\n" : "Accès refusé.\n");
    }
    set_time_limit(300);
    ob_implicit_flush(true);
    $sortie = __DIR__ . '/ffa-resultats.json';
} else {
    $sortie = (isset($argv[1]) && $argv[1] !== '--diag') ? $argv[1] : __DIR__ . '/ffa-resultats.json';
}
if (isset($_GET['diag']) || (PHP_SAPI === 'cli' && in_array('--diag', $argv, true))) { diagnostic($sortie); exit(0); }

/** Message d'erreur : sortie d'erreur en ligne de commande, page en lancement web (la constante STDERR n'existe pas hors ligne de commande) */
function journalErreur(string $message): void {
    if (PHP_SAPI === 'cli') fwrite(STDERR, $message); else echo $message;
}

/** Télécharge une page (cURL, sinon file_get_contents) : [code HTTP (0 si échec), message d'erreur, contenu ou null] */
function telechargerDetail(string $url): array {
    $ua = 'Mozilla/5.0 (compatible; ProfilEnduranceClub/1.0)';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
            CURLOPT_TIMEOUT => 40, CURLOPT_CONNECTTIMEOUT => 15, CURLOPT_USERAGENT => $ua, CURLOPT_ENCODING => '']);
        $html = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $erreur = curl_error($ch);
        curl_close($ch);
        return [$code, $erreur, $html === false ? null : $html];
    }
    $ctx = stream_context_create(['http' => ['timeout' => 40, 'header' => "User-Agent: $ua\r\n"]]);
    $html = @file_get_contents($url, false, $ctx);
    $e = error_get_last();
    return $html === false ? [0, $e ? $e['message'] : 'échec de file_get_contents (allow_url_fopen / https ?)', null] : [200, '', $html];
}

/** Télécharge une page ; null en cas d'erreur (le détail est écrit sur la sortie d'erreur) */
function telecharger(string $url): ?string {
    [$code, $erreur, $html] = telechargerDetail($url);
    if ($html === null || $code !== 200) { journalErreur("Téléchargement impossible (HTTP $code" . ($erreur !== '' ? ", $erreur" : '') . ") : $url\n"); return null; }
    return $html;
}

/** Diagnostic de l'installation (ffa-collecte.php?cle=…&diag=1, ou « php ffa-collecte.php --diag ») : version de PHP, extensions, droits d'écriture, accès aux deux sites */
function diagnostic(string $sortie): void {
    $ok = version_compare(PHP_VERSION, '7.1.0', '>=');
    echo "Diagnostic de ffa-collecte.php\n";
    echo 'PHP ' . PHP_VERSION . ($ok ? " : OK\n" : " : TROP ANCIEN (7.1 minimum)\n");
    foreach (['dom' => true, 'mbstring' => true, 'json' => true, 'curl' => false] as $e => $requise) {
        echo "extension $e : " . (extension_loaded($e) ? 'oui' : ($requise ? 'NON (requise)' : 'non (facultative, file_get_contents sera utilisé)')) . "\n";
    }
    echo 'allow_url_fopen : ' . (ini_get('allow_url_fopen') ? 'oui' : 'non') . "\n";
    $dossier = dirname($sortie);
    echo "dossier de sortie $dossier : " . (is_writable($dossier) ? "écriture possible\n" : "ÉCRITURE IMPOSSIBLE (droits du dossier)\n");
    echo 'fichier de résultats : ' . (file_exists($sortie) ? filesize($sortie) . ' octets, modifié le ' . date('Y-m-d H:i', filemtime($sortie)) : 'absent') . "\n";
    foreach (['Base FFA' => urlListe((int) date('Y'), 0), 'Courses 80' => COURSES80_ARCHIVE] as $nom => $url) {
        [$code, $erreur, $html] = telechargerDetail($url);
        echo "$nom : HTTP $code" . ($erreur !== '' ? " ($erreur)" : '') . ($html !== null ? ', ' . strlen($html) . ' octets' : '') . "\n";
    }
    $c = chargerCourses80();
    echo 'Courses du challenge Courses 80 répertoriées : ' . ($c === null ? 'ÉCHEC (page illisible)' : count($c)) . "\n";
}

function urlListe(int $saison, int $position): string {
    return BASE . '?' . http_build_query(['frmpostback' => 'true', 'frmbase' => 'resultats', 'frmmode' => 1, 'frmespace' => 0,
        'frmsaison' => $saison, 'frmclub' => CLUB, 'frmlicence' => '', 'frmnom' => '', 'frmprenom' => '', 'frmsexe' => '',
        'frmdepartement' => '', 'frmligue' => '', 'frmcomprch' => '', 'frmposition' => $position]);
}

/** Sans accents, minuscules : pour reconnaître les libellés d'épreuves */
function simple(string $s): string {
    $s = mb_strtolower($s, 'UTF-8');
    return strtr($s, ['à' => 'a', 'â' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c']);
}

/**
 * Distance (m) d'une épreuve route ou piste d'après son libellé (« 10 Km Route / TCX » → 10000) ; null si elle n'est pas reconnue
 * ou si l'épreuve ne se prête pas au calcul (trail, haies, marche, relais, cross, triathlon, concours…).
 */
function distanceEpreuve(string $epreuve): ?int {
    $libelle = simple(trim(explode(' / ', $epreuve, 2)[0]));
    if (preg_match('/trail|haies|steeple|marche|relais|cross|ekiden|triathlon|duathlon|aquathlon|salle|jeunes|obstacle|lancer|saut|longueur|hauteur|perche|poids|disque|javelot|marteau|vitesse|combine|pentathlon|decathlon|heptathlon|virtuel|ultra|ravito/', $libelle)) return null;
    $d = null;
    if (preg_match('#^1/2\s*marathon#', $libelle) || preg_match('#^semi#', $libelle)) $d = 21097;
    elseif (preg_match('#^marathon#', $libelle)) $d = 42195;
    elseif (preg_match('#^(\d+(?:[.,]\d+)?)\s*km\b#', $libelle, $m)) $d = (int) round((float) str_replace(',', '.', $m[1]) * 1000);
    elseif (preg_match('#^(\d[\d\s]*)\s*m$#', $libelle, $m)) $d = (int) preg_replace('/\s+/', '', $m[1]);
    return ($d !== null && $d >= DISTANCE_MIN && $d <= DISTANCE_MAX) ? $d : null;
}

/** « 1h32'52'' », « 26'04'' », « 3'08''1 » → secondes (décimales gardées) ; null si illisible */
function secondes(string $t): ?float {
    if (!preg_match("/(?:(\d+)\s*h\s*)?(\d{1,2})'\s*(\d{2})(?:''\s*(\d+)?)?/u", $t, $m)) return null;
    $s = (int) ($m[1] ?? 0) * 3600 + (int) $m[2] * 60 + (int) $m[3];
    if (!empty($m[4])) $s += (float) ('0.' . $m[4]);
    return (float) $s;
}

/** Colonne « Résultat » : « 18. 1h32'52'' (1h32'52'') » → rang, temps officiel, temps réel entre parenthèses (puce) ; null si pas un chrono */
function lireResultat(string $r): ?array {
    if (!preg_match('/^\s*(\d+)\.\s*(.*)$/u', $r, $m)) return null; // NP, DNS, abandon, HC… : pas de classement
    $rang = (int) $m[1];
    if (!preg_match_all("/\d+(?:\s*h\s*)?\d*'\s*\d{2}(?:''\s*\d*)?/u", $m[2], $ts)) return null;
    $officiel = secondes($ts[0][0]);
    $reel = isset($ts[0][1]) ? secondes($ts[0][1]) : null;
    return $officiel === null ? null : ['rang' => $rang, 'officiel' => $officiel, 'reel' => $reel];
}

/** Date « dd/mm » + saison → « aaaa-mm-jj ». La saison de la base FFA suit l'année civile ; une date future (impossible) est ramenée à l'année précédente. */
function dateComplete(string $jjmm, int $saison): ?string {
    if (!preg_match('#^(\d{2})/(\d{2})$#', trim($jjmm), $m)) return null;
    $d = sprintf('%04d-%02d-%02d', $saison, (int) $m[2], (int) $m[1]);
    if (!checkdate((int) $m[2], (int) $m[1], $saison)) return null;
    return $d > date('Y-m-d') ? sprintf('%04d-%02d-%02d', $saison - 1, (int) $m[2], (int) $m[1]) : $d;
}

/** « JEUNECOURT Christophe », « DE LA FUENTE Jean-Paul » → [nom (majuscules), prénom] */
function separerNom(string $complet): array {
    $nom = []; $prenom = [];
    foreach (preg_split('/\s+/u', trim($complet)) as $mot) {
        if (!$prenom && mb_strtoupper($mot, 'UTF-8') === $mot && preg_match('/\p{L}/u', $mot)) $nom[] = $mot; else $prenom[] = $mot;
    }
    return [implode(' ', $nom), implode(' ', $prenom)];
}

/** Mots d'un libellé (sans accents, en minuscules, lettres et chiffres) */
function mots(string $s): array {
    return array_values(array_filter(explode(' ', trim(preg_replace('/[^a-z0-9]+/', ' ', simple($s)))), function ($m) { return $m !== ''; }));
}

/** Distance (m) d'un libellé de l'archive Courses 80 (« 5 km », « semi marathon », « marathon ») ; null au-delà du marathon ou si inconnu */
function distanceCourses80(string $libelle): ?int {
    $l = simple($libelle);
    if (preg_match('/semi/', $l)) return 21097;
    if (preg_match('/^marathon/', $l)) return 42195;
    if (preg_match('/^(\d+(?:[.,]\d+)?)\s*km/', $l, $m)) {
        $d = (int) round((float) str_replace(',', '.', $m[1]) * 1000);
        return ($d >= DISTANCE_MIN && $d <= DISTANCE_MAX) ? $d : null;
    }
    return null;
}

/** Courses du challenge Courses 80 des 14 derniers mois : [{ date, distance (m), mots }] ; null si la page est illisible */
function chargerCourses80(): ?array {
    $html = telecharger(COURSES80_ARCHIVE);
    if ($html === null || ($i = strpos($html, 'let data = [')) === false) return null;
    $i += strlen('let data = ');
    $j = strpos($html, '}]', $i);                  // chaque élément se termine par « } » suivi de « , » ; la fin du tableau est le premier « }] »
    $liste = $j === false ? null : json_decode(substr($html, $i, $j + 2 - $i), true);
    if (!is_array($liste)) return null;
    $depuis = date('Y-m-d', strtotime('-14 months'));
    $courses = [];
    foreach ($liste as $c) {
        $distance = distanceCourses80((string) ($c['distance'] ?? ''));
        if ($distance === null || empty($c['present']) || ($c['date'] ?? '') < $depuis) continue;
        $m = mots((string) $c['nom']);
        foreach ($m as $mot) if (isset(LIEUX_COURSES80[$mot])) $m[] = LIEUX_COURSES80[$mot];   // lieu que le nom de la course ne contient pas
        $courses[] = ['date' => $c['date'], 'distance' => $distance, 'mots' => $m];
    }
    return $courses;
}

/** Deux mots désignent le même lieu ou la même course : préfixe commun d'au moins 5 lettres couvrant 70 % du plus court (saiso / saisons, flessel / flesselles) */
function memeMot(string $a, string $b): bool {
    if (strlen($a) < 4 || strlen($b) < 4) return false;
    $n = 0; $max = min(strlen($a), strlen($b));
    while ($n < $max && $a[$n] === $b[$n]) $n++;
    return $n >= 5 ? $n >= 0.7 * $max : $n === $max;
}

/** La ligne FFA (date, distance, lieu et texte de l'épreuve) est-elle une course du challenge Courses 80 ? Même date, même distance (à 3 % près), même lieu */
function dansChallenge(array $courses80, string $date, int $distance, string $ville, string $epreuve): bool {
    $jf = array_merge(mots($ville), mots(explode(' / ', $epreuve, 2)[1] ?? ''));
    foreach ($courses80 as $c) {
        if ($c['date'] !== $date || abs($c['distance'] - $distance) > 0.03 * $distance) continue;
        foreach ($c['mots'] as $m) {
            if (in_array($m, MOTS_GENERIQUES, true)) continue;
            foreach ($jf as $u) if (memeMot($m, $u)) return true;
        }
    }
    return false;
}

/** Lignes d'une page de résultats (colonnes : nom, épreuve, résultat, tour, infos, points, niveau, date, ville) */
function lireLignes(string $html, int $saison, array $courses80): array {
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="utf-8" ?>' . $html);
    libxml_clear_errors();
    $xp = new DOMXPath($dom);
    $lignes = [];
    foreach ($xp->query("//table[@id='ctnResultats']//tr[not(contains(@class, 'detail-row'))]") as $tr) {
        $tds = $xp->query('./td', $tr);
        if ($tds->length < 9) continue;
        $c = [];
        foreach ($tds as $td) $c[] = trim(preg_replace('/\s+/u', ' ', str_replace("\xc2\xa0", ' ', $td->textContent)));
        [$nomLien, $epreuve, $resultat, , , , $niveau, $jjmm, $ville] = $c;
        $distance = distanceEpreuve($epreuve);
        $res = lireResultat($resultat);
        $date = dateComplete($jjmm, $saison);
        if ($distance === null || $res === null || $date === null) continue;
        if ($niveau === '') {                            // sans niveau : seulement si c'est une course du challenge Courses 80
            if (!dansChallenge($courses80, $date, $distance, $ville, $epreuve)) continue;
            $niveau = NIVEAU_COURSES80;
        }
        $ref = $res['reel'] ?? $res['officiel'];
        if ($ref <= 0) continue;
        $vitesse = $distance / $ref * 3.6;
        if ($vitesse < VITESSE_KMH[0] || $vitesse > VITESSE_KMH[1]) continue;
        $a = $xp->query('.//a[@href]', $tds->item(0))->item(0);
        $id = $a && preg_match('#/athletes/(\d+)/#', $a->getAttribute('href'), $m) ? (int) $m[1] : null;
        if ($id === null) continue;
        [$nom, $prenom] = separerNom($nomLien);
        $lignes[] = ['id' => $id, 'nom' => $nom, 'prenom' => $prenom, 'epreuve' => $epreuve, 'distance' => $distance, 'rang' => $res['rang'],
            'officiel' => $res['officiel'], 'reel' => $res['reel'], 'niveau' => $niveau, 'date' => $date, 'ville' => $ville];
    }
    return $lignes;
}

$courses80 = chargerCourses80();
if ($courses80 === null) { journalErreur("Échec : liste des courses du challenge Courses 80 illisible (" . COURSES80_ARCHIVE . ") : fichier conservé.\n"); exit(1); }
sleep(PAUSE_S);

$annee = (int) date('Y');
$tous = []; $erreurs = 0; $pages = 0;
foreach ([$annee - 1, $annee, $annee + 1] as $saison) {
    $position = 0; $total = 1;
    do {
        $html = telecharger(urlListe($saison, $position));
        sleep(PAUSE_S);
        if ($html === null) { $erreurs++; journalErreur("Échec : saison $saison, page " . ($position + 1) . "\n"); break; }
        $pages++;
        if ($position === 0 && preg_match('#Page&nbsp;&gt;&nbsp;\d+/(\d+)#', $html, $m)) $total = (int) $m[1];
        foreach (lireLignes($html, $saison, $courses80) as $l) $tous[md5(json_encode([$l['id'], $l['date'], $l['epreuve'], $l['officiel']]))] = $l;
        $position++;
    } while ($position < $total);
}

if (!$pages || $erreurs) {                      // une saison manquante fausserait les résultats : on ne touche pas au fichier existant
    journalErreur("Collecte incomplète ($erreurs erreur(s)) : fichier conservé.\n");
    exit(1);
}

// Seuls les 12 derniers mois sont gardés (la fenêtre de l'outil) : le fichier est refait chaque jour, il reste donc à jour
$depuis = date('Y-m-d', strtotime('-' . MOIS_FENETRE . ' months'));
$resultats = array_values(array_filter($tous, function ($r) use ($depuis) { return $r['date'] >= $depuis; }));
usort($resultats, function ($a, $b) { return [$a['nom'], $a['prenom'], $b['date']] <=> [$b['nom'], $b['prenom'], $a['date']]; });
$json = json_encode(['genere' => date('c'), 'club' => CLUB, 'source' => 'athle.fr (base résultats FFA) et courses du challenge Courses 80', 'resultats' => $resultats],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
if ($json === false) { journalErreur("Encodage JSON impossible.\n"); exit(1); }
$tmp = $sortie . '.tmp';
if (file_put_contents($tmp, $json) === false || !rename($tmp, $sortie)) { journalErreur("Écriture impossible : $sortie\n"); exit(1); }
$nbC80 = count(array_filter($resultats, function ($r) { return $r['niveau'] === NIVEAU_COURSES80; }));
echo date('c') . ' : ' . count($resultats) . " résultat(s) retenu(s) dont $nbC80 du challenge Courses 80 sans niveau FFA, " . count($courses80) . " course(s) du challenge répertoriée(s), $pages page(s) lue(s) → $sortie\n";
