<?php
/*
 * Little Lotus, Play together online: a tiny relay for rooms hosted from the website.
 *
 * The host's browser runs the game; this only passes the current screen to players and
 * their joins and answers back to the host, like GameServer.java does on the phone.
 * Each room is one small JSON file in the server's temporary folder (never in the web
 * folder). It holds players' names and answers only while the room is open, and is
 * deleted when the host closes it or after ROOM_TTL seconds at most.
 *
 * All requests: room.php?a=<action>, form-encoded parameters.
 *   host-start                          -> {ok, code, key, now}
 *   host-state   code, key, state      -> {now}
 *   host-events  code, key             -> {events: [...]}
 *   host-stop    code, key             -> {ok}
 *   join         code (or room), name [, key] -> {id, key, name} | {error}
 *   answer       code, key, q, a (the answer's index) -> {ok} | {error}
 *   state        code, key, v          -> {v, me, s?} | {v: -1, closed: true}
 */

const ROOM_TTL = 4 * 3600;      // seconds a room may live
const MAX_PLAYERS = 80;
const MAX_STATE = 65536;        // bytes of screen state from the host
const MAX_EVENTS = 2000;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');

function out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function param($name, $max = 64) {
    $v = isset($_POST[$name]) ? $_POST[$name] : (isset($_GET[$name]) ? $_GET[$name] : '');
    return is_string($v) ? substr(trim($v), 0, $max) : '';
}
function now_ms() { return (int) round(microtime(true) * 1000); }
function dir_path() {
    $d = rtrim(sys_get_temp_dir(), '/') . '/little-lotus-rooms';
    if (!is_dir($d)) @mkdir($d, 0700, true);
    return $d;
}
function room_file($code) { return dir_path() . '/' . $code . '.json'; }
function token($bytes) { return bin2hex(random_bytes($bytes)); }

/** Letters, marks, digits, spaces and . - ' only; at most 18 characters. */
function clean_name($s) {
    $s = preg_replace("/[^\\p{L}\\p{M}\\p{N} .'\\-]/u", '', (string) $s);
    $s = trim(preg_replace('/\s+/u', ' ', (string) $s));
    return mb_substr($s, 0, 18, 'UTF-8');
}

/** Runs $fn on the room's data under an exclusive lock; saves the room unless $fn returns false. Returns [room, found]. */
function with_room($code, $fn) {
    if (!preg_match('/^\d{6}$/', $code)) return [null, false];
    $path = room_file($code);
    if (!is_file($path)) return [null, false];
    $fh = @fopen($path, 'c+');
    if (!$fh) return [null, false];
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $room = json_decode($raw, true);
    if (!is_array($room) || $room['expires'] < time()) {
        flock($fh, LOCK_UN); fclose($fh); @unlink($path);
        return [null, false];
    }
    $result = $fn($room);
    if ($result !== false) {
        ftruncate($fh, 0); rewind($fh);
        fwrite($fh, json_encode($room, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        fflush($fh);
    }
    flock($fh, LOCK_UN); fclose($fh);
    return [$room, true];
}

function sweep_expired() {
    foreach (glob(dir_path() . '/*.json') ?: [] as $f) {
        if (filemtime($f) < time() - ROOM_TTL) @unlink($f);
    }
}

// The action comes only from the address; "a" in the form body is a player's answer.
$a = isset($_GET['a']) && is_string($_GET['a']) ? substr($_GET['a'], 0, 20) : '';
// The phone server names the room "room"; accept either.
if (param('code', 6) === '' && param('room', 6) !== '') $_POST['code'] = param('room', 6);
$method = $_SERVER['REQUEST_METHOD'];
if ($a !== 'state' && $method !== 'POST') out(['error' => 'method'], 405);

switch ($a) {
case 'host-start':
    sweep_expired();
    for ($i = 0; $i < 20; $i++) {
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $path = room_file($code);
        $fh = @fopen($path, 'x'); // fails if the code is taken
        if ($fh) {
            $key = token(16);
            $room = ['host' => $key, 'expires' => time() + ROOM_TTL, 'v' => 1, 'state' => new stdClass(),
                     'players' => new stdClass(), 'n' => 0, 'events' => []];
            fwrite($fh, json_encode($room)); fclose($fh); @chmod($path, 0600);
            out(['ok' => true, 'code' => $code, 'key' => $key, 'now' => now_ms()]);
        }
    }
    out(['ok' => false, 'error' => 'busy'], 503);

case 'host-state':
    $state = isset($_POST['state']) && is_string($_POST['state']) ? $_POST['state'] : '';
    if (strlen($state) > MAX_STATE) out(['error' => 'large'], 413);
    $decoded = json_decode($state, true);
    if (!is_array($decoded)) out(['error' => 'state'], 400);
    $key = param('key');
    list($room, $ok) = with_room(param('code', 6), function (&$r) use ($key, $decoded) {
        if (!hash_equals($r['host'], $key)) return false;
        $r['state'] = $decoded; $r['v']++; return true;
    });
    if (!$ok || !hash_equals($room['host'], $key)) out(['error' => 'room'], 404);
    out(['now' => now_ms()]);

case 'host-events':
    $key = param('key'); $events = [];
    list($room, $ok) = with_room(param('code', 6), function (&$r) use ($key, &$events) {
        if (!hash_equals($r['host'], $key)) return false;
        $events = $r['events']; $r['events'] = []; return true;
    });
    if (!$ok || !hash_equals($room['host'], $key)) out(['error' => 'room'], 404);
    out(['events' => $events]);

case 'host-stop':
    $code = param('code', 6); $key = param('key');
    list($room, $ok) = with_room($code, function (&$r) { return false; });
    if ($ok && hash_equals($room['host'], $key)) @unlink(room_file($code));
    out(['ok' => true]);

case 'join':
    $name = clean_name(param('name', 120)); $rejoin = param('key');
    $res = null;
    list($room, $ok) = with_room(param('code', 6), function (&$r) use ($name, $rejoin, &$res) {
        $players = (array) $r['players'];
        if ($rejoin !== '' && isset($players[$rejoin])) { $p = $players[$rejoin]; $res = ['id' => $p['id'], 'key' => $rejoin, 'name' => $p['name']]; return false; }
        if (count($players) >= MAX_PLAYERS) { $res = ['error' => 'full']; return false; }
        if ($name === '') { $res = ['error' => 'name']; return false; }
        $taken = array_map(function ($p) { return mb_strtolower($p['name'], 'UTF-8'); }, array_values($players));
        $unique = $name;
        for ($n = 2; in_array(mb_strtolower($unique, 'UTF-8'), $taken, true); $n++) $unique = $name . ' ' . $n;
        $r['n']++; $id = 'p' . $r['n']; $key = token(12);
        $players[$key] = ['id' => $id, 'name' => $unique];
        $r['players'] = $players;
        if (count($r['events']) < MAX_EVENTS) $r['events'][] = ['e' => 'join', 'id' => $id, 'name' => $unique];
        $res = ['id' => $id, 'key' => $key, 'name' => $unique];
        return true;
    });
    if (!$ok) out(['error' => 'room']);
    out($res);

case 'answer':
    $key = param('key'); $q = param('q', 12); $ans = isset($_POST['a']) && is_string($_POST['a']) ? substr(trim($_POST['a']), 0, 2) : '';
    if (!preg_match('/^\d+$/', $q) || !preg_match('/^\d$/', $ans)) out(['error' => 'answer'], 400);
    $res = ['error' => 'player'];
    list($room, $ok) = with_room(param('code', 6), function (&$r) use ($key, $q, $ans, &$res) {
        $players = (array) $r['players'];
        if (!isset($players[$key])) return false;
        if (count($r['events']) < MAX_EVENTS) $r['events'][] = ['e' => 'answer', 'id' => $players[$key]['id'], 'q' => (int) $q, 'a' => (int) $ans, 't' => now_ms()];
        $res = ['ok' => true];
        return true;
    });
    if (!$ok) out(['v' => -1, 'closed' => true]);
    out($res);

case 'state':
    $key = param('key'); $have = param('v', 18);
    list($room, $ok) = with_room(param('code', 6), function (&$r) { return false; });
    if (!$ok) out(['v' => -1, 'closed' => true]);
    $players = (array) $room['players'];
    $me = isset($players[$key]) ? $players[$key]['id'] : null;
    $resp = ['v' => $room['v'], 'me' => $me];
    if ((string) $room['v'] !== $have) $resp['s'] = $room['state'];
    out($resp);

default:
    out(['error' => 'action'], 400);
}
