/**
 * Vercel-ready API that converts a Terabox share link into metadata and a direct download link.
 * Uses the scraping flow from the provided bot repo (jsToken + dp-logid + shorturl).
 *
 * Inputs:
 *   GET /api/terabox?url=<share_url>&action=meta|download
 *   Optional: &index=<n> (0-based file index, default 0)
 *
 * Auth (cookies):
 *   - Set env TERABOX_COOKIE to a "k=v; k2=v2" string, or
 *   - Set env TERABOX_COOKIES_JSON to the JSON export you provided, or
 *   - Place "tera cookies.json" at project root (Chrome/Firefox export).
 */

import fs from "node:fs";
import path from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const baseHeaders = {
  "User-Agent": UA,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  Connection: "keep-alive"
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

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
    const cookiesArray = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.cookies)
      ? parsed.cookies
      : null;
    if (cookiesArray) {
      return cookiesArray.map((c) => `${c.name}=${c.value}`).join("; ");
    }
  } catch {
    return "";
  }
  return "";
}

function findBetween(data, first, last) {
  try {
    const start = data.indexOf(first);
    if (start === -1) return null;
    const end = data.indexOf(last, start + first.length);
    if (end === -1) return null;
    return data.slice(start + first.length, end);
  } catch {
    return null;
  }
}

function extractSurl(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.searchParams.get("surl");
  } catch {
    return null;
  }
}

async function fetchSharePage(url, cookie) {
  const res = await fetch(url, {
    headers: { ...baseHeaders, Cookie: cookie }
  });
  if (!res.ok) throw new Error(`Share page failed: ${res.status}`);
  const text = await res.text();
  return { text, finalUrl: res.url };
}

async function fetchList({ jsToken, logid, shorturl }, cookie) {
  const apiUrl = `https://www.terabox.app/share/list?app_id=250528&web=1&channel=0&jsToken=${encodeURIComponent(
    jsToken
  )}&dp-logid=${encodeURIComponent(
    logid
  )}&page=1&num=20&by=name&order=asc&shorturl=${encodeURIComponent(shorturl)}&root=1`;

  const res = await fetch(apiUrl, {
    headers: {
      Cookie: cookie,
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*"
    }
  });
  if (!res.ok) throw new Error(`share/list failed: ${res.status}`);
  const data = await res.json();
  if (data.errno) throw new Error(`share/list errno ${data.errno}`);
  return data.list || [];
}

async function resolveDirectLink(dlink, cookie) {
  const res = await fetch(dlink, {
    method: "HEAD",
    redirect: "manual",
    headers: { Cookie: cookie, "User-Agent": UA }
  });
  // location header holds the actual download URL
  return res.headers.get("location") || dlink;
}

export default async function handler(req, res) {
  const { url, action = "meta", index = "0" } = req.query;
  if (!url) return json(res, 400, { ok: false, error: "Missing url" });

  const cookie = loadCookieHeader();
  if (!cookie) return json(res, 400, { ok: false, error: "Missing TERABOX_COOKIE" });

  try {
    const { text, finalUrl } = await fetchSharePage(url, cookie);
    const defaultThumb = findBetween(text, 'og:image" content="', '"');
    const logid = findBetween(text, "dp-logid=", "&");
    const jsToken = findBetween(text, "fn%28%22", "%22%29");
    const shorturl = extractSurl(finalUrl) || extractSurl(url);

    if (!logid || !jsToken || !shorturl) {
      throw new Error("Could not extract required tokens (logid/jsToken/shorturl)");
    }

    const files = await fetchList({ jsToken, logid, shorturl }, cookie);
    if (!files.length) throw new Error("No files in share");

    const idx = Number.parseInt(index, 10) || 0;
    const file = files[idx];
    if (!file) throw new Error(`No file at index ${idx}`);

    if (action === "meta") {
      return json(res, 200, {
        ok: true,
        data: {
          count: files.length,
          files: files.map((f) => ({
            fs_id: f.fs_id,
            server_filename: f.server_filename,
            size: f.size,
            isdir: f.isdir,
            dlink: f.dlink
          })),
          tokens: { jsToken, logid, shorturl }
        }
      });
    }

    if (action === "download") {
      const direct = await resolveDirectLink(file.dlink, cookie);
      return json(res, 200, {
        ok: true,
        data: {
          server_filename: file.server_filename,
          size: file.size,
          size_h: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
          dlink: file.dlink,
          direct_link: direct,
          thumb: file?.thumbs?.url3 || defaultThumb
        }
      });
    }

    return json(res, 400, { ok: false, error: "Invalid action" });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message });
  }
}

