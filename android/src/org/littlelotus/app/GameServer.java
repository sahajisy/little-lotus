package org.littlelotus.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URLDecoder;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * A tiny web server for "Play together": players in the same room open the host's
 * address on their own phones and answer from there. It only relays. The host page
 * (the app's WebView) owns the game and sends the screen everyone should see; the
 * server hands that to players, and passes their joins and answers back to the host.
 * Nothing leaves the local network and nothing is stored once the game ends.
 * Uses only java.* so it can be tested on a desktop JDK.
 */
public class GameServer {
    /** Where the player page's files come from (the app's assets, or a folder when testing). */
    public interface Files {
        InputStream open(String path) throws IOException;
    }

    public static final int MAX_PLAYERS = 80;
    private static final int[] PORTS = {8686, 8687, 8688, 8689, 8690};
    private static final long POLL_WAIT_MS = 15000;

    private final Files files;
    private final SecureRandom random = new SecureRandom();
    private ServerSocket socket;
    private ExecutorService pool;
    private volatile boolean running;

    // Guarded by "this".
    private String room = "";
    private String state = "{}";
    private long version = 0;
    private final Map<String, String[]> players = new LinkedHashMap<>(); // key -> {id, name}
    private final List<String> events = new ArrayList<>();

    public GameServer(Files files) {
        this.files = files;
    }

    /** Starts listening and returns the port, or throws if no port is free. */
    public synchronized int start(String roomCode) throws IOException {
        stop();
        room = roomCode;
        state = "{}";
        version = 1;
        players.clear();
        events.clear();
        IOException last = null;
        for (int port : PORTS) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new java.net.InetSocketAddress(port));
                socket = s;
                break;
            } catch (IOException e) {
                last = e;
            }
        }
        if (socket == null) throw last != null ? last : new IOException("no free port");
        running = true;
        pool = Executors.newCachedThreadPool();
        final ServerSocket s = socket;
        Thread accept = new Thread(new Runnable() {
            @Override
            public void run() {
                while (running) {
                    try {
                        final Socket c = s.accept();
                        pool.execute(new Runnable() {
                            @Override
                            public void run() { handle(c); }
                        });
                    } catch (IOException e) {
                        if (!running) return;
                    } catch (RuntimeException e) {
                        if (!running) return; // pool shut down
                    }
                }
            }
        }, "lotus-accept");
        accept.setDaemon(true);
        accept.start();
        return socket.getLocalPort();
    }

    public synchronized void stop() {
        running = false;
        if (socket != null) {
            try { socket.close(); } catch (IOException ignored) { }
            socket = null;
        }
        if (pool != null) {
            pool.shutdownNow();
            pool = null;
        }
        players.clear();
        events.clear();
        notifyAll();
    }

    public boolean isRunning() {
        return running;
    }

    /** The screen players should see now, as JSON from the host page. Returns the server clock. */
    public synchronized long setState(String json) {
        state = json == null || json.isEmpty() ? "{}" : json;
        version++;
        notifyAll();
        return System.currentTimeMillis();
    }

    /** Joins and answers since the last call, as a JSON array. */
    public synchronized String takeEvents() {
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < events.size(); i++) {
            if (i > 0) b.append(',');
            b.append(events.get(i));
        }
        events.clear();
        return b.append(']').toString();
    }

    /** The IPv4 addresses other phones can reach: Wi-Fi first, then the phone's own hotspot. */
    public static List<String> addresses() {
        List<String[]> found = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String name = ni.getName().toLowerCase();
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("dummy")
                        || name.startsWith("tun") || name.startsWith("p2p")) continue; // mobile data, VPN
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && !a.isLinkLocalAddress()) {
                        int rank = name.startsWith("wlan") ? 0 : (name.startsWith("ap") || name.startsWith("swlan")) ? 1 : 2;
                        found.add(new String[]{String.valueOf(rank), a.getHostAddress()});
                    }
                }
            }
        } catch (Exception ignored) {
            // No network interfaces: no addresses.
        }
        Collections.sort(found, new java.util.Comparator<String[]>() {
            @Override
            public int compare(String[] x, String[] y) { return x[0].compareTo(y[0]); }
        });
        List<String> out = new ArrayList<>();
        for (String[] f : found) if (!out.contains(f[1])) out.add(f[1]);
        return out;
    }

    /* ------------------------------------------------------------------ HTTP */

    private void handle(Socket c) {
        try {
            c.setSoTimeout(20000);
            InputStream in = c.getInputStream();
            String head = readHead(in);
            if (head == null) return;
            String[] lines = head.split("\r\n");
            String[] req = lines[0].split(" ");
            if (req.length < 2) return;
            String method = req[0], target = req[1];
            int length = 0;
            for (int i = 1; i < lines.length; i++) {
                int colon = lines[i].indexOf(':');
                if (colon > 0 && lines[i].substring(0, colon).trim().equalsIgnoreCase("content-length")) {
                    try { length = Integer.parseInt(lines[i].substring(colon + 1).trim()); } catch (NumberFormatException ignored) { }
                }
            }
            if (length < 0 || length > 4096) { send(c, 413, "text/plain", bytes("Too large")); return; }
            byte[] body = new byte[length];
            int got = 0;
            while (got < length) {
                int n = in.read(body, got, length - got);
                if (n < 0) break;
                got += n;
            }
            String path = target, query = "";
            int q = target.indexOf('?');
            if (q >= 0) { path = target.substring(0, q); query = target.substring(q + 1); }
            Map<String, String> params = parse(query);
            if ("POST".equals(method)) params.putAll(parse(new String(body, 0, got, "UTF-8")));
            route(c, method, path, params);
        } catch (SocketTimeoutException ignored) {
            // Slow or idle client.
        } catch (IOException ignored) {
            // Client went away.
        } finally {
            try { c.close(); } catch (IOException ignored) { }
        }
    }

    private void route(Socket c, String method, String path, Map<String, String> p) throws IOException {
        if (path.equals("/join") && "POST".equals(method)) { send(c, 200, "application/json", bytes(join(p))); return; }
        if (path.equals("/answer") && "POST".equals(method)) { send(c, 200, "application/json", bytes(answer(p))); return; }
        if (path.equals("/state")) { send(c, 200, "application/json", bytes(poll(p))); return; }
        if (!"GET".equals(method) && !"HEAD".equals(method)) { send(c, 405, "text/plain", bytes("Method not allowed")); return; }
        if (path.equals("/")) path = "/play.html";
        serveFile(c, path.substring(1));
    }

    private String join(Map<String, String> p) {
        synchronized (this) {
            if (!running) return "{\"error\":\"closed\"}";
            if (!room.equals(trim(p.get("room"), 8))) return "{\"error\":\"room\"}";
            String key = trim(p.get("key"), 40);
            if (!key.isEmpty() && players.containsKey(key)) { // rejoining after a reload
                String[] me = players.get(key);
                return "{\"id\":" + quote(me[0]) + ",\"key\":" + quote(key) + ",\"name\":" + quote(me[1]) + "}";
            }
            if (players.size() >= MAX_PLAYERS) return "{\"error\":\"full\"}";
            String name = cleanName(p.get("name"));
            if (name.isEmpty()) return "{\"error\":\"name\"}";
            String unique = name;
            for (int n = 2; nameTaken(unique); n++) unique = name + " " + n;
            String id = "p" + (players.size() + 1);
            key = token();
            players.put(key, new String[]{id, unique});
            events.add("{\"e\":\"join\",\"id\":" + quote(id) + ",\"name\":" + quote(unique) + "}");
            notifyAll();
            return "{\"id\":" + quote(id) + ",\"key\":" + quote(key) + ",\"name\":" + quote(unique) + "}";
        }
    }

    private String answer(Map<String, String> p) {
        synchronized (this) {
            String[] me = players.get(trim(p.get("key"), 40));
            if (me == null) return "{\"error\":\"player\"}";
            String qid = trim(p.get("q"), 12), a = trim(p.get("a"), 2);
            if (!qid.matches("\\d+") || !a.matches("\\d")) return "{\"error\":\"answer\"}";
            events.add("{\"e\":\"answer\",\"id\":" + quote(me[0]) + ",\"q\":" + qid + ",\"a\":" + a
                    + ",\"t\":" + System.currentTimeMillis() + "}");
            return "{\"ok\":true}";
        }
    }

    /** Waits until the state is newer than the version the player has, then returns it. */
    private String poll(Map<String, String> p) {
        long have;
        try { have = Long.parseLong(trim(p.get("v"), 18)); } catch (NumberFormatException e) { have = -1; }
        String key = trim(p.get("key"), 40);
        synchronized (this) {
            long until = System.currentTimeMillis() + POLL_WAIT_MS;
            while (running && version == have) {
                long left = until - System.currentTimeMillis();
                if (left <= 0) break;
                try { wait(left); } catch (InterruptedException e) { break; }
            }
            if (!running) return "{\"v\":-1,\"closed\":true}";
            String[] me = players.get(key);
            return "{\"v\":" + version + ",\"me\":" + (me == null ? "null" : quote(me[0])) + ",\"s\":" + state + "}";
        }
    }

    private void serveFile(Socket c, String path) throws IOException {
        boolean allowed = path.equals("play.html") || path.equals("play.js") || path.equals("style.css")
                || path.startsWith("fonts/") || path.startsWith("icons/");
        if (!allowed || path.contains("..") || path.contains("\\")) { send(c, 404, "text/plain", bytes("Not found")); return; }
        InputStream in;
        try { in = files.open(path); } catch (IOException e) { send(c, 404, "text/plain", bytes("Not found")); return; }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        try {
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
        } finally {
            in.close();
        }
        send(c, 200, mime(path), out.toByteArray());
    }

    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html; charset=utf-8";
        if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (path.endsWith(".css")) return "text/css; charset=utf-8";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }

    private static void send(Socket c, int code, String type, byte[] body) throws IOException {
        String reason = code == 200 ? "OK" : code == 404 ? "Not Found" : code == 405 ? "Method Not Allowed" : "Error";
        String head = "HTTP/1.1 " + code + " " + reason + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "X-Content-Type-Options: nosniff\r\n"
                + "Connection: close\r\n\r\n";
        OutputStream out = c.getOutputStream();
        out.write(head.getBytes("ISO-8859-1"));
        out.write(body);
        out.flush();
    }

    private static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int s = 0;
        while (b.size() < 8192) {
            int ch = in.read();
            if (ch < 0) return null;
            b.write(ch);
            s = (ch == '\r' && (s == 0 || s == 2)) ? s + 1 : (ch == '\n' && (s == 1 || s == 3)) ? s + 1 : 0;
            if (s == 4) return new String(b.toByteArray(), "ISO-8859-1");
        }
        return null;
    }

    /* --------------------------------------------------------------- helpers */

    private boolean nameTaken(String name) {
        for (String[] pl : players.values()) if (pl[1].equalsIgnoreCase(name)) return true;
        return false;
    }

    private String token() {
        byte[] b = new byte[12];
        random.nextBytes(b);
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x & 0xff));
        return s.toString();
    }

    private static Map<String, String> parse(String s) {
        Map<String, String> m = new HashMap<>();
        if (s == null || s.isEmpty()) return m;
        for (String pair : s.split("&")) {
            int eq = pair.indexOf('=');
            try {
                if (eq > 0) m.put(URLDecoder.decode(pair.substring(0, eq), "UTF-8"), URLDecoder.decode(pair.substring(eq + 1), "UTF-8"));
            } catch (Exception ignored) {
                // Malformed pair.
            }
        }
        return m;
    }

    private static String trim(String s, int max) {
        if (s == null) return "";
        s = s.trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    /** Letters, marks, digits, spaces and a little punctuation, at most 18 characters. */
    static String cleanName(String s) {
        if (s == null) return "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length() && b.length() < 18; ) {
            int cp = s.codePointAt(i);
            i += Character.charCount(cp);
            int t = Character.getType(cp);
            boolean ok = Character.isLetterOrDigit(cp) || t == Character.NON_SPACING_MARK || t == Character.COMBINING_SPACING_MARK
                    || cp == ' ' || cp == '-' || cp == '.' || cp == '\'';
            if (ok) b.appendCodePoint(cp);
        }
        return b.toString().replaceAll("\\s+", " ").trim();
    }

    static String quote(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == '"' || ch == '\\') b.append('\\').append(ch);
            else if (ch < 0x20 || ch == 0x2028 || ch == 0x2029) b.append(String.format("\\u%04x", (int) ch));
            else b.append(ch);
        }
        return b.append('"').toString();
    }

    private static byte[] bytes(String s) {
        try { return s.getBytes("UTF-8"); } catch (java.io.UnsupportedEncodingException e) { return new byte[0]; }
    }
}
