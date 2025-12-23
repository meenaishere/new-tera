/**
 * Vercel-ready serverless function to fetch Terabox metadata or download links.
 * Requires a valid Terabox web session cookie. Supply via:
 * - env TERABOX_COOKIE (full "k1=v1; k2=v2" string), OR
 * - env TERABOX_COOKIES_JSON (JSON string like the provided tera cookies.json), OR
 * - local file ./tera cookies.json (Chrome/Firefox export).
 *
 * Usage:
 *   GET /api/terabox?url=<share_url>&action=meta
 *   GET /api/terabox?url=<share_url>&action=download[&fs_id=<id>]
 *
 * Response:
 *   { ok: true, data: {...} } or { ok: false, error: "message" }
 */

import fs from "node:fs";
import path from "node:path";

const sharePageHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
};

/**
 * Load cookie header value from env or local json file.
 */
function loadCookieHeader() {
  if (process.env.TERABOX_COOKIE) return process.env.TERABOX_COOKIE.trim();

  const jsonSource =
    process.env.TERABOX_COOKIES_JSON ||
    (() => {
      try {
        const file = path.join(process.cwd(), "tera cookies.json");
        return fs.readFileSync(file, "utf8");
      } catch {
        return null;
      }
    })();

  if (!jsonSource) return "";

  try {
    const parsed = typeof jsonSource === "string" ? JSON.parse(jsonSource) : jsonSource;
    if (Array.isArray(parsed)) {
      return parsed.map((c) => `${c.name}=${c.value}`).join("; ");
    }
    if (parsed.cookies && Array.isArray(parsed.cookies)) {
      return parsed.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    }
  } catch {
    return "";
  }
  return "";
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

/**
 * Extract window.yunData payload from the share page.
 */
function extractYunData(html) {
  const match = html.match(/window\.yunData\s*=\s*(\{.+?\});/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function fetchSharePage(url, cookie) {
  const res = await fetch(url, {
    headers: {
      ...sharePageHeaders,
      Cookie: cookie
    }
  });
  if (!res.ok) throw new Error(`Share page request failed: ${res.status}`);
  return res.text();
}

async function listFiles(yunData, cookie) {
  const { shareid, uk, sign, timestamp, logid, bdstoken } = yunData;
  const params = new URLSearchParams({
    shareid,
    uk,
    sign,
    timestamp,
    bdstoken,
    channel: "4",
    web: "1",
    app_id: "250528",
    order: "name",
    desc: "0"
  });

  const res = await fetch(`https://www.terabox.com/share/list?${params.toString()}`, {
    headers: {
      Cookie: cookie,
      "User-Agent": sharePageHeaders["User-Agent"],
      Accept: "application/json, text/plain, */*"
    }
  });
  if (!res.ok) throw new Error(`share/list failed: ${res.status}`);
  const json = await res.json();
  if (json.errno !== 0) throw new Error(`share/list errno ${json.errno}`);
  return json.list;
}

async function getDownloadLink(yunData, cookie, fsId) {
  const { shareid, uk, sign, timestamp } = yunData;
  const params = new URLSearchParams({
    shareid,
    uk,
    sign,
    timestamp,
    channel: "4",
    web: "1",
    app_id: "250528",
    clienttype: "12",
    primaryid: shareid,
    fid_list: JSON.stringify([fsId]),
    type: "dlink"
  });

  const res = await fetch("https://www.terabox.com/share/download", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "User-Agent": sharePageHeaders["User-Agent"],
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json, text/plain, */*",
      Origin: "https://www.terabox.com",
      Referer: "https://www.terabox.com/"
    },
    body: params.toString()
  });

  if (!res.ok) throw new Error(`share/download failed: ${res.status}`);
  const json = await res.json();
  if (json.errno !== 0 || !json.dlink) throw new Error(`download errno ${json.errno ?? "unknown"}`);
  return json.dlink;
}

export default async function handler(req, res) {
  const { url, action = "meta", fs_id: fsIdParam } = req.query;
  if (!url) return json(res, 400, { ok: false, error: "Missing url" });

  const cookie = loadCookieHeader();
  if (!cookie) return json(res, 400, { ok: false, error: "Missing TERABOX_COOKIE" });

  try {
    const html = await fetchSharePage(url, cookie);
    const yunData = extractYunData(html);
    if (!yunData) throw new Error("Could not parse share page payload");

    const files = await listFiles(yunData, cookie);

    if (action === "meta") {
      return json(res, 200, { ok: true, data: { files, yunData: { sign: yunData.sign, timestamp: yunData.timestamp, shareid: yunData.shareid, uk: yunData.uk } } });
    }

    if (action === "download") {
      const target = fsIdParam
        ? files.find((f) => String(f.fs_id) === String(fsIdParam))
        : files[0];
      if (!target) throw new Error("File not found in share");
      const dlink = await getDownloadLink(yunData, cookie, target.fs_id);
      return json(res, 200, { ok: true, data: { fs_id: target.fs_id, server_filename: target.server_filename, dlink } });
    }

    return json(res, 400, { ok: false, error: "Invalid action" });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message });
  }
}

