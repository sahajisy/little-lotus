<?php
/*
 * Little Lotus feedback: emails what someone writes in the app's "Give feedback" screen to the
 * developer. Nothing is stored here except a short-lived counter per visitor, used to stop
 * floods of messages (at most RATE_MAX in RATE_WINDOW seconds), kept in the server's temporary folder.
 *
 * POST (form-encoded): rating 1-5 (required), like, better, name, email (all optional),
 * where ("Android app" or "Website"), version, and "company", a hidden field people never fill in.
 * Returns {ok: true} or {error: "..."}.
 */

const TO = 'sbalgunde@gmail.com';
const FROM = 'Little Lotus <info@sahajbalgunde.com>';
const RATE_MAX = 5;
const RATE_WINDOW = 3600;

// The Android app sends from its own files (origin "null"), so allow any origin; no cookies are used.
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');

function out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
/** One field as plain text: no control characters except line breaks, at most $max characters. */
function field($name, $max) {
    $v = isset($_POST[$name]) && is_string($_POST[$name]) ? $_POST[$name] : '';
    $v = preg_replace('/[^\P{C}\n]/u', '', str_replace("\r", '', $v));
    return trim(mb_substr((string) $v, 0, $max, 'UTF-8'));
}
/** For email headers: one line only. */
function one_line($s) { return trim(preg_replace('/[\r\n]+/', ' ', $s)); }

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') out(['ok' => true]);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'method'], 405);

// Bots fill in every field; people never see this one. Pretend it worked.
if (field('company', 200) !== '') out(['ok' => true]);

$rating = (int) field('rating', 1);
if ($rating < 1 || $rating > 5) out(['error' => 'rating'], 400);
$like = field('like', 2000);
$better = field('better', 2000);
$name = one_line(field('name', 60));
$email = one_line(field('email', 120));
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) out(['error' => 'email'], 400);
$where = field('where', 20) === 'Android app' ? 'Android app' : 'Website';
$version = preg_replace('/[^0-9.]/', '', field('version', 10));

// At most RATE_MAX messages an hour from one address. Only a hash of the address is kept.
$dir = rtrim(sys_get_temp_dir(), '/') . '/little-lotus-feedback';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
$slot = $dir . '/' . hash('sha256', 'little-lotus|' . $ip) . '.json';
$now = time();
$times = is_file($slot) ? json_decode((string) @file_get_contents($slot), true) : [];
$times = array_values(array_filter(is_array($times) ? $times : [], function ($t) use ($now) { return $t > $now - RATE_WINDOW; }));
if (count($times) >= RATE_MAX) out(['error' => 'busy'], 429);
$times[] = $now;
@file_put_contents($slot, json_encode($times), LOCK_EX);
foreach (glob($dir . '/*.json') ?: [] as $f) { if (filemtime($f) < $now - RATE_WINDOW) @unlink($f); }

$stars = str_repeat('★', $rating) . str_repeat('☆', 5 - $rating);
$subject = "Little Lotus feedback: $stars ($rating/5) from $where";
$body = "Rating: $stars ($rating/5)\n"
      . "Uses: $where" . ($version !== '' ? " (version $version)" : '') . "\n\n"
      . "What they like:\n" . ($like !== '' ? $like : '(nothing written)') . "\n\n"
      . "What should be better:\n" . ($better !== '' ? $better : '(nothing written)') . "\n\n"
      . "Name: " . ($name !== '' ? $name : '(not given)') . "\n"
      . "Email: " . ($email !== '' ? $email : '(not given)') . "\n\n"
      . "--\nSent from the Little Lotus feedback screen.";
$headers = [
    'From: ' . FROM,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
];
if ($email !== '') $headers[] = 'Reply-To: ' . ($name !== '' ? '"' . str_replace('"', '', $name) . '" ' : '') . "<$email>";

$sent = @mail(TO, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers));
if (!$sent) out(['error' => 'mail'], 502);
out(['ok' => true]);
